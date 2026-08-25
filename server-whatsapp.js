const express = require('express');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Zernio config ──────────────────────────────────────────────────────────────
const ZERNIO_API    = 'https://zernio.com/api/v1';
const ZERNIO_KEY    = process.env.ZERNIO_API_KEY;
const ZERNIO_ACCT   = process.env.ZERNIO_ACCOUNT_ID;   // ID da conta WhatsApp no Zernio
const ZERNIO_SECRET = process.env.ZERNIO_WEBHOOK_SECRET; // para HMAC (opcional mas recomendado)
const GROQ_KEY      = process.env.GROQ_KEY;
const UNIT_DEFAULT  = process.env.UNIDADE_ID_DEFAULT;

function zHeaders() {
  return { 'Authorization': `Bearer ${ZERNIO_KEY}`, 'Content-Type': 'application/json' };
}

// ── Verificação de assinatura HMAC-SHA256 ──────────────────────────────────────
function validarAssinatura(req) {
  if (!ZERNIO_SECRET) return true; // pula se secret não configurado
  const sig = req.headers['x-zernio-signature'];
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', ZERNIO_SECRET)
    .update(JSON.stringify(req.body)).digest('hex');
  return sig === expected;
}

// ── Groq — auto-resposta no primeiro contato ───────────────────────────────────
async function gerarAutoResposta(mensagem, nome) {
  if (!GROQ_KEY) return null;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 150,
        messages: [
          { role: 'system', content: 'Você é a recepção de uma concessionária de veículos. Responda de forma simpática, breve e profissional dando boas-vindas ao cliente e perguntando como pode ajudar. Máximo 2 frases. Português brasileiro natural.' },
          { role: 'user',   content: `Cliente ${nome} enviou pela primeira vez: "${mensagem}". Gere a saudação de boas-vindas.` }
        ]
      })
    });
    const data = await r.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('[groq]', e.message);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function isFirstContact(unidadeId, numero) {
  const { count } = await supabase.from('whatsapp_mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('unidade_id', unidadeId).eq('numero_cliente', numero);
  return count === 0;
}

// Busca conversationId via Zernio API (por número de telefone)
// Não depende de colunas extras no Supabase
async function conversaIdByNumero(unidadeId, numero) {
  if (!ZERNIO_KEY) return null;
  try {
    const r = await fetch(`${ZERNIO_API}/inbox/conversations`, { headers: zHeaders() });
    const data = await r.json();
    const semPlus = numero.replace(/^\+/, '');
    const conv = (data.data || []).find(c =>
      c.participantId === semPlus || c.participantId === `+${semPlus}`
    );
    return conv?.id || null;
  } catch (e) {
    console.error('[zernio] busca conversa:', e.message);
    return null;
  }
}

// Busca unidade pelo account_id do Zernio
async function unidadeByAccount(accountId) {
  if (!accountId) return null;
  const { data } = await supabase.from('whatsapp_conexoes')
    .select('unidade_id').eq('account_id', accountId).maybeSingle();
  return data?.unidade_id || null;
}

// ── Envio via Zernio — com conversationId existente ───────────────────────────
async function _enviarMensagem(conversationId, mensagem, accountId) {
  if (!ZERNIO_KEY || !conversationId) return { ok: false, erro: 'sem configuração' };
  try {
    const r = await fetch(`${ZERNIO_API}/inbox/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: zHeaders(),
      body: JSON.stringify({ accountId: accountId || ZERNIO_ACCT, message: mensagem })
    });
    const result = await r.json();
    if (!r.ok) {
      console.error('[zernio] erro envio:', JSON.stringify(result));
      return { ok: false, erro: result.error || result.message || 'Erro Zernio' };
    }
    // platformMessageId vem na resposta — usado para rastrear delivery/read
    const platId = result.message?.platformMessageId || result.platformMessageId || null;
    return { ok: true, platId, data: result };
  } catch (e) {
    console.error('[zernio] exceção envio:', e.message);
    return { ok: false, erro: e.message };
  }
}

// ── Cria nova conversa outbound (SDR inicia contato sem conversationId) ────────
// Zernio: POST /v1/inbox/conversations cria E envia a primeira mensagem
async function _criarConversa(para, mensagem, accountId) {
  if (!ZERNIO_KEY) return { ok: false, erro: 'ZERNIO_API_KEY não configurada' };
  try {
    const r = await fetch(`${ZERNIO_API}/inbox/conversations`, {
      method: 'POST',
      headers: zHeaders(),
      body: JSON.stringify({
        accountId: accountId || ZERNIO_ACCT,
        participantId: para,   // número E.164 do destinatário
        message: mensagem
      })
    });
    const result = await r.json();
    if (!r.ok) {
      console.error('[zernio] erro criar conversa:', JSON.stringify(result));
      return { ok: false, erro: result.error || result.message || 'Erro Zernio' };
    }
    const convId = result.conversation?.id || result.id;
    return { ok: true, conversationId: convId, data: result };
  } catch (e) {
    console.error('[zernio] exceção criar conversa:', e.message);
    return { ok: false, erro: e.message };
  }
}

// ── Mapa em memória: platformMessageId → supabase row id (para delivery status) ─
const _sentMap = new Map();

// ── Extrai conteúdo de uma mensagem Zernio (texto + mídia) ────────────────────
function _parseMsgContent(msg) {
  const texto      = msg?.text || '';
  const attachments = Array.isArray(msg?.attachments) ? msg.attachments : [];
  if (!attachments.length) return texto;

  const att     = attachments[0];
  const rawUrl  = att.url || '';
  // URL format: https://zernio.com/api/v1/whatsapp/media/{mediaId}
  const mediaId = rawUrl.split('/').pop() || rawUrl;
  const caption = texto ? ` ${texto}` : '';

  switch (att.type) {
    case 'audio':   return `[AUDIO:${mediaId}]${caption}`;
    case 'image':   return `[IMAGEM:${mediaId}]${caption}`;
    case 'video':   return `[VIDEO:${mediaId}]${caption}`;
    case 'sticker': return `[STICKER:${mediaId}]`;
    default:        return `[ARQUIVO:${att.payload?.filename||'arquivo'}:${mediaId}]${caption}`;
  }
}

// ── WEBHOOK — recebe eventos do Zernio ─────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde imediatamente para o Zernio não retentar

  if (!validarAssinatura(req)) {
    console.warn('[zernio] assinatura inválida — ignorado');
    return;
  }

  const eventos = Array.isArray(req.body) ? req.body : [req.body];

  for (const evt of eventos) {

    // ── Delivery / Read status ─────────────────────────────────────────────────
    if (evt.event === 'message.delivered' || evt.event === 'message.read') {
      const platId = evt.message?.platformMessageId;
      if (platId && _sentMap.has(platId)) {
        const rowId = _sentMap.get(platId);
        const status = evt.event === 'message.read' ? 'lido' : 'entregue';
        await supabase.from('whatsapp_mensagens')
          .update({ status_entrega: status }).eq('id', rowId);
        if (evt.event === 'message.read') _sentMap.delete(platId);
      }
      continue;
    }

    if (evt.event === 'message.failed') {
      const platId = evt.message?.platformMessageId;
      if (platId && _sentMap.has(platId)) {
        await supabase.from('whatsapp_mensagens')
          .update({ status_entrega: 'falhou' }).eq('id', _sentMap.get(platId));
        _sentMap.delete(platId);
      }
      continue;
    }

    if (evt.event !== 'message.received') continue;

    // Ignorar ecos de mensagens enviadas pelo próprio servidor
    if (evt.message?.direction === 'outgoing') continue;

    const convId  = evt.message?.conversationId || evt.conversation?.id;
    const account = evt.account?.id || ZERNIO_ACCT;
    const sender  = evt.message?.sender || {};

    const numero = (sender.phoneNumber || sender.id || '').replace(/\D/g, '');
    const nome   = sender.name || numero;
    const foto   = sender.picture || null;

    if (!numero || !convId) {
      console.warn('[zernio] payload incompleto:', JSON.stringify(evt).slice(0, 300));
      continue;
    }

    const mensagem = _parseMsgContent(evt.message);
    if (!mensagem) continue;

    const unidadeId = (await unidadeByAccount(account)) || UNIT_DEFAULT;
    const primeiro  = await isFirstContact(unidadeId, numero);

    // Tenta inserir com nome_cliente; se coluna não existir, insere sem
    let insertData = {
      unidade_id: unidadeId, numero_cliente: numero,
      nome_cliente: nome, foto_cliente: foto,
      mensagem, tipo: 'recebida', lida: false,
      timestamp: new Date().toISOString()
    };
    let { error } = await supabase.from('whatsapp_mensagens').insert(insertData);
    if (error?.message?.includes('nome_cliente') || error?.message?.includes('foto_cliente')) {
      // Fallback sem colunas extras
      const { nome_cliente, foto_cliente, ...base } = insertData;
      const r2 = await supabase.from('whatsapp_mensagens').insert(base);
      error = r2.error;
    }
    if (error) { console.error('[zernio] erro salvar:', error.message); continue; }

    console.log(`[zernio] ← ${numero} (${nome}) | ${mensagem.slice(0,60)}`);

    // Auto-resposta IA no primeiro contato (apenas mensagens de texto)
    if (primeiro && evt.message?.text) {
      const autoResp = await gerarAutoResposta(evt.message.text, nome);
      if (autoResp) {
        const { ok } = await _enviarMensagem(convId, autoResp, account);
        if (ok) {
          await supabase.from('whatsapp_mensagens').insert({
            unidade_id: unidadeId, numero_cliente: numero,
            nome_cliente: nome, mensagem: autoResp,
            tipo: 'enviada', status_entrega: 'enviado',
            timestamp: new Date().toISOString()
          }).catch(() => supabase.from('whatsapp_mensagens').insert({
            unidade_id: unidadeId, numero_cliente: numero,
            mensagem: autoResp, tipo: 'enviada',
            timestamp: new Date().toISOString()
          }));
        }
      }
    }
  }
});

// ── GET /webhook — Zernio não precisa de verify token (diferente do Meta) ──────
app.get('/webhook', (req, res) => res.status(200).send('Eye CRM · Zernio Webhook OK'));

// ── ENVIAR — SDR envia mensagem para cliente ───────────────────────────────────
app.post('/enviar', async (req, res) => {
  const { numero, mensagem, unidadeId } = req.body;
  const to = (numero || '').replace(/\D/g, '');
  if (!to || !mensagem) return res.status(400).json({ erro: 'numero e mensagem são obrigatórios' });

  let convId = await conversaIdByNumero(unidadeId, to);
  const uid  = unidadeId || UNIT_DEFAULT;
  let platId = null;

  if (convId) {
    // Conversa existente — envia direto
    const result = await _enviarMensagem(convId, mensagem);
    if (!result.ok) return res.status(500).json({ erro: result.erro || 'Erro ao enviar via Zernio' });
    platId = result.platId;
  } else {
    // Sem conversa prévia — cria nova e envia (Zernio faz os dois em um request)
    const result = await _criarConversa(`+${to}`, mensagem);
    if (!result.ok) return res.status(500).json({ erro: result.erro });
    convId = result.conversationId;
    platId = result.platId;
  }

  const { data: row } = await supabase.from('whatsapp_mensagens').insert({
    unidade_id: uid, numero_cliente: to, mensagem,
    tipo: 'enviada', status_entrega: 'enviado',
    timestamp: new Date().toISOString()
  }).select('id').single().catch(() =>
    supabase.from('whatsapp_mensagens').insert({
      unidade_id: uid, numero_cliente: to, mensagem,
      tipo: 'enviada', timestamp: new Date().toISOString()
    }).select('id').single()
  );

  // Registra no mapa de delivery para rastrear entrega/leitura
  if (platId && row?.id) {
    _sentMap.set(platId, row.id);
    setTimeout(() => _sentMap.delete(platId), 24 * 60 * 60 * 1000); // limpa após 24h
  }

  console.log(`[zernio] → ${to} | ${mensagem.slice(0, 60)}`);
  res.json({ ok: true });
});

// ── STATUS ─────────────────────────────────────────────────────────────────────
app.get('/status', async (req, res) => {
  const uid = req.query.unidadeId;
  if (uid) {
    const { data } = await supabase.from('whatsapp_conexoes')
      .select('account_id, numero_display, status').eq('unidade_id', uid).maybeSingle();
    if (data) return res.json({
      status:   data.status || (data.account_id ? 'conectado' : 'desconectado'),
      numero:   data.numero_display || null,
      provider: 'zernio'
    });
  }
  res.json({ status: ZERNIO_KEY ? 'configurado' : 'sem_key', provider: 'zernio' });
});

// ── CONECTAR UNIDADE — salva o account_id do Zernio para a unidade ─────────────
app.post('/conectar-unidade', async (req, res) => {
  const { unidadeId, accountId, numeroDisplay } = req.body;
  if (!unidadeId || !accountId)
    return res.status(400).json({ erro: 'unidadeId e accountId são obrigatórios' });

  const { error } = await supabase.from('whatsapp_conexoes').upsert({
    unidade_id:     unidadeId,
    account_id:     accountId,
    numero_display: numeroDisplay || null,
    status:         'conectado',
    atualizado_em:  new Date().toISOString()
  }, { onConflict: 'unidade_id' });

  if (error) return res.status(500).json({ erro: error.message });
  res.json({ ok: true });
});

// ── REGISTRAR WEBHOOK no Zernio — chamar uma vez após deploy ──────────────────
// POST /registrar-webhook { "webhookUrl": "https://seu-servidor.vercel.app/webhook" }
app.post('/registrar-webhook', async (req, res) => {
  if (!ZERNIO_KEY) return res.status(503).json({ erro: 'ZERNIO_API_KEY não configurada' });
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ erro: 'webhookUrl é obrigatório' });

  try {
    const r = await fetch(`${ZERNIO_API}/webhooks/settings`, {
      method: 'POST',
      headers: zHeaders(),
      body: JSON.stringify({
        name:     'Eye CRM',
        url:      webhookUrl,
        events:   ['message.received'],
        isActive: true,
        ...(ZERNIO_SECRET ? { secret: ZERNIO_SECRET } : {})
      })
    });
    const result = await r.json();
    if (!r.ok) return res.status(400).json({ erro: result.message || 'Erro Zernio', detail: result });
    console.log('[zernio] webhook registrado:', webhookUrl);
    res.json({ ok: true, webhook: result });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── DESCONECTAR ────────────────────────────────────────────────────────────────
app.post('/desconectar', async (req, res) => {
  const { unidadeId } = req.body;
  if (unidadeId) {
    await supabase.from('whatsapp_conexoes').upsert({
      unidade_id:     unidadeId,
      status:         'desconectado',
      account_id:     null,
      numero_display: null,
      atualizado_em:  new Date().toISOString()
    }, { onConflict: 'unidade_id' });
  }
  res.json({ ok: true });
});

// ── GROQ SUGGEST — sugestão IA para o SDR ─────────────────────────────────────
app.post('/groq-suggest', async (req, res) => {
  const { contact, phone, context } = req.body;
  if (!GROQ_KEY) return res.status(503).json({ erro: 'GROQ_KEY não configurada no servidor' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 200,
        messages: [
          { role: 'system', content: 'Você é copilot de vendas de uma concessionária de veículos. Sugira UMA resposta curta, natural e persuasiva em português brasileiro. Máximo 2-3 frases. Qualifique o lead e proponha próximos passos.' },
          { role: 'user',   content: `Contato: ${contact} (${phone})\n\nConversa:\n${context}\n\nSugira a próxima resposta do SDR:` }
        ]
      })
    });
    const data = await r.json();
    res.json({ suggestion: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── RELATÓRIO SDR ──────────────────────────────────────────────────────────────
app.post('/relatorio-sdr', async (req, res) => {
  const { sdrName, date, conversations } = req.body;
  if (!conversations) return res.status(400).json({ erro: 'dados inválidos' });

  const novos  = (conversations || []).filter(c => c.isNewLead).length;
  const resumo = JSON.stringify({ date, sdrName, total: conversations.length, novosLeads: novos, conversations });

  const { error } = await supabase.from('whatsapp_mensagens').insert({
    unidade_id: UNIT_DEFAULT, numero_cliente: 'RELATORIO_SDR',
    nome_cliente: sdrName || 'SDR', mensagem: resumo,
    tipo: 'relatorio_sdr', lida: false, timestamp: new Date().toISOString()
  });

  if (error) return res.status(500).json({ erro: error.message });
  res.json({ ok: true });
});

// ── PROXY DE MÍDIA — busca arquivo do Zernio com auth e repassa ao browser ─────
app.get('/media/:mediaId', async (req, res) => {
  if (!ZERNIO_KEY) return res.status(503).json({ erro: 'sem chave' });
  const { mediaId } = req.params;
  try {
    const r = await fetch(`${ZERNIO_API}/whatsapp/media/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${ZERNIO_KEY}` }
    });
    if (!r.ok) return res.status(r.status).send('Mídia não encontrada');
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Streama o body sem buffer (Node 18+ fetch retorna body ReadableStream)
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error('[media]', e.message);
    res.status(500).send('Erro');
  }
});

// ── HEALTH ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  ok:         true,
  provider:   'zernio',
  configured: !!ZERNIO_KEY,
  account:    ZERNIO_ACCT || null
}));

// ── Compat — rotas antigas que o frontend pode ainda chamar ───────────────────
app.post('/conectar/:unidadeId', (req, res) => res.json({ ok: true }));
app.get('/conectar/:unidadeId',  (req, res) => res.json({ ok: true }));
app.get('/qr', (req, res) => res.send(`
  <html><body style="font-family:sans-serif;padding:40px;max-width:480px;margin:auto">
    <h2>Eye CRM — WhatsApp via Zernio</h2>
    <p>Provider: <strong>Zernio</strong></p>
    <p>Configure o webhook apontando para <code>/webhook</code> no painel do Zernio.</p>
  </body></html>
`));

// ──────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[eye] Servidor Zernio WhatsApp na porta ${PORT}`);
  if (!ZERNIO_KEY)  console.warn('[eye] ⚠ ZERNIO_API_KEY não configurada');
  if (!ZERNIO_ACCT) console.warn('[eye] ⚠ ZERNIO_ACCOUNT_ID não configurada');
});
