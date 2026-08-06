const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Fallbacks globais — usados quando a unidade ainda não tem config própria
const GLOBAL_TOKEN    = process.env.META_ACCESS_TOKEN;
const GLOBAL_PHONE_ID = process.env.META_PHONE_NUMBER_ID;
const VERIFY_TOKEN    = process.env.META_VERIFY_TOKEN || 'eye_crm_verify_2025';
const UNIT_DEFAULT    = process.env.UNIDADE_ID_DEFAULT;

/* ── Helpers de lookup ── */
async function conexaoByPhone(phoneId) {
  const { data } = await supabase.from('whatsapp_conexoes')
    .select('unidade_id, access_token')
    .eq('phone_number_id', phoneId).maybeSingle();
  return data;
}

async function conexaoByUnidade(unidadeId) {
  const { data } = await supabase.from('whatsapp_conexoes')
    .select('phone_number_id, access_token, numero_display, status')
    .eq('unidade_id', unidadeId).maybeSingle();
  return data;
}

/* ── Webhook verification ── */
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log('[meta] webhook verificado');
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

/* ── Receber mensagens ── */
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  if (req.body.object !== 'whatsapp_business_account') return;

  for (const entry of req.body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const val    = change.value;
      const phoneId = val.metadata?.phone_number_id;

      // Roteia pelo phone_number_id → unidade_id (cada unidade tem seu número)
      let unidadeId = UNIT_DEFAULT;
      if (phoneId) {
        const c = await conexaoByPhone(phoneId);
        if (c?.unidade_id) unidadeId = c.unidade_id;
      }

      for (const msg of val.messages || []) {
        if (msg.type !== 'text') continue;
        const numero = msg.from;
        const texto  = msg.text?.body || '';
        const nome   = val.contacts?.find(c => c.wa_id === msg.from)?.profile?.name || numero;

        console.log(`[meta] ${numero} → unidade ${(unidadeId||'').slice(0,8)} | ${texto.slice(0,50)}`);

        try {
          const { data: lead } = await supabase.from('leads')
            .select('id, nome').eq('unidade_id', unidadeId).eq('telefone', numero).maybeSingle();

          const { error } = await supabase.from('whatsapp_mensagens').insert({
            unidade_id:     unidadeId,
            lead_id:        lead?.id || null,
            numero_cliente: numero,
            nome_cliente:   lead?.nome || nome,
            mensagem:       texto,
            tipo:           'recebida',
            lida:           false,
            timestamp:      new Date().toISOString()
          });

          if (error) console.error('[meta] erro salvar:', error.message);
          else       console.log('[meta] salvo OK');
        } catch (err) {
          console.error('[meta] exceção:', err.message);
        }
      }
    }
  }
});

/* ── Enviar mensagem ── */
app.post('/enviar', async (req, res) => {
  const { numero, mensagem, unidadeId } = req.body;

  // Usa token e phoneId da unidade; fallback para variáveis globais
  let token   = GLOBAL_TOKEN;
  let phoneId = GLOBAL_PHONE_ID;

  if (unidadeId) {
    const c = await conexaoByUnidade(unidadeId);
    if (c?.access_token)    token   = c.access_token;
    if (c?.phone_number_id) phoneId = c.phone_number_id;
  }

  if (!token || !phoneId)
    return res.status(400).json({ erro: 'WhatsApp não configurado para esta unidade' });

  const to = (numero || '').replace(/\D/g, '');

  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: mensagem } })
    });
    const result = await r.json();
    if (!r.ok) return res.status(400).json({ erro: result.error?.message || 'Erro Meta API' });

    await supabase.from('whatsapp_mensagens').insert({
      unidade_id: unidadeId || UNIT_DEFAULT, numero_cliente: to,
      mensagem, tipo: 'enviada', timestamp: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[meta] erro enviar:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

/* ── Status por unidade ── */
app.get('/status', async (req, res) => {
  const uid = req.query.unidadeId;
  if (uid) {
    const c = await conexaoByUnidade(uid);
    if (c) return res.json({
      status:  c.status || (c.phone_number_id ? 'conectado' : 'desconectado'),
      numero:  c.numero_display || null,
      provider: 'meta_cloud_api'
    });
  }
  // Fallback: se não há registro no banco, usa variáveis globais
  const ok = !!(GLOBAL_TOKEN && GLOBAL_PHONE_ID);
  res.json({ status: ok ? 'conectado' : 'desconectado', provider: 'meta_cloud_api' });
});

/* ── Conectar unidade (Embedded Signup callback) ──
   Recebe phoneNumberId, wabaId, accessToken, numeroDisplay
   e salva na tabela whatsapp_conexoes para aquela unidade.    */
app.post('/conectar-unidade', async (req, res) => {
  const { unidadeId, phoneNumberId, wabaId, accessToken, numeroDisplay } = req.body;
  if (!unidadeId || !phoneNumberId)
    return res.status(400).json({ erro: 'unidadeId e phoneNumberId são obrigatórios' });

  const { error } = await supabase.from('whatsapp_conexoes').upsert({
    unidade_id:      unidadeId,
    phone_number_id: phoneNumberId,
    waba_id:         wabaId    || null,
    access_token:    accessToken || null,
    numero_display:  numeroDisplay || null,
    status:          'conectado',
    qr_code:         null,
    atualizado_em:   new Date().toISOString()
  }, { onConflict: 'unidade_id' });

  if (error) return res.status(500).json({ erro: error.message });
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true }));

/* ── Relatório SDR (enviado pela extensão Chrome) ── */
app.post('/relatorio-sdr', async (req, res) => {
  const { sdrName, date, conversations } = req.body;
  if (!conversations) return res.status(400).json({ erro: 'dados inválidos' });

  const novos    = (conversations || []).filter(c => c.isNewLead).length;
  const resumo   = JSON.stringify({ date, sdrName, total: conversations.length, novosLeads: novos, conversations });

  const { error } = await supabase.from('whatsapp_mensagens').insert({
    unidade_id:     UNIT_DEFAULT,
    numero_cliente: 'RELATORIO_SDR',
    nome_cliente:   sdrName || 'SDR',
    mensagem:       resumo,
    tipo:           'relatorio_sdr',
    lida:           false,
    timestamp:      new Date().toISOString()
  });

  if (error) { console.error('[relatorio]', error.message); return res.status(500).json({ erro: error.message }); }
  console.log(`[relatorio] ${sdrName} — ${conversations.length} contatos em ${date}`);
  res.json({ ok: true });
});

/* ── Desconectar ── */
app.post('/desconectar', async (req, res) => {
  const { unidadeId } = req.body;
  if (unidadeId) {
    await supabase.from('whatsapp_conexoes').upsert({
      unidade_id:      unidadeId,
      status:          'desconectado',
      phone_number_id: null,
      access_token:    null,
      numero_display:  null,
      qr_code:         null,
      atualizado_em:   new Date().toISOString()
    }, { onConflict: 'unidade_id' });
  }
  res.json({ ok: true });
});

/* ── Compat ── */
app.post('/conectar/:unidadeId', (req, res) => res.json({ ok: true }));
app.get('/conectar/:unidadeId',  (req, res) => res.json({ ok: true }));
app.get('/qr', (req, res) => res.send(`
  <html><body style="font-family:sans-serif;padding:40px;max-width:480px;margin:auto">
    <h2>Eye CRM — WhatsApp</h2>
    <p>Este servidor usa a API oficial do WhatsApp (Meta Cloud API).</p>
    <p style="color:#666">Cada unidade conecta o próprio número pelo painel de configurações.</p>
  </body></html>
`));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[eye] Servidor Meta Cloud API na porta ${PORT}`);
  if (!GLOBAL_TOKEN)    console.warn('[eye] AVISO: META_ACCESS_TOKEN não configurado');
  if (!GLOBAL_PHONE_ID) console.warn('[eye] AVISO: META_PHONE_NUMBER_ID não configurado');
});
