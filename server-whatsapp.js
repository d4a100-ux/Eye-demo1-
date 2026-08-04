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

const ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const VERIFY_TOKEN    = process.env.META_VERIFY_TOKEN || 'eye_crm_verify_2025';
const UNIDADE_ID      = process.env.UNIDADE_ID_DEFAULT;

/* ── Webhook verification (Meta calls this to confirm the URL) ── */
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[meta] webhook verificado com sucesso');
    return res.status(200).send(challenge);
  }
  console.warn('[meta] webhook verification falhou — token inválido');
  res.sendStatus(403);
});

/* ── Receive incoming messages (Meta sends here) ── */
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde imediatamente para Meta não reenviar
  if (req.body.object !== 'whatsapp_business_account') return;

  for (const entry of req.body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const val = change.value;

      for (const msg of val.messages || []) {
        if (msg.type !== 'text') continue;

        const numero = msg.from; // ex: "5581912345678"
        const texto  = msg.text?.body || '';
        const nome   = val.contacts?.find(c => c.wa_id === msg.from)?.profile?.name || numero;

        console.log('[meta] msg de:', numero, '| texto:', texto.slice(0, 50));

        try {
          const { data: lead } = await supabase
            .from('leads').select('id, nome')
            .eq('unidade_id', UNIDADE_ID)
            .eq('telefone', numero).maybeSingle();

          const { error } = await supabase.from('whatsapp_mensagens').insert({
            unidade_id:     UNIDADE_ID,
            lead_id:        lead?.id || null,
            numero_cliente: numero,
            nome_cliente:   lead?.nome || nome,
            mensagem:       texto,
            tipo:           'recebida',
            lida:           false,
            timestamp:      new Date().toISOString()
          });

          if (error) console.error('[meta] erro ao salvar:', error.message);
          else       console.log('[meta] mensagem salva OK');
        } catch (err) {
          console.error('[meta] exceção:', err.message);
        }
      }
    }
  }
});

/* ── Send message via Meta Graph API ── */
app.post('/enviar', async (req, res) => {
  const { numero, mensagem, unidadeId } = req.body;

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID)
    return res.status(400).json({ erro: 'META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID não configurados no Railway' });

  const to = (numero || '').replace(/\D/g, '');

  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: mensagem }
        })
      }
    );

    const result = await r.json();
    if (!r.ok) {
      console.error('[meta] erro ao enviar:', result);
      return res.status(400).json({ erro: result.error?.message || 'Erro Meta API' });
    }

    await supabase.from('whatsapp_mensagens').insert({
      unidade_id:     unidadeId || UNIDADE_ID,
      numero_cliente: to,
      mensagem,
      tipo:           'enviada',
      timestamp:      new Date().toISOString()
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[meta] erro ao enviar:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

/* ── Status — frontend usa isso para mostrar "conectado" ── */
app.get('/status', (req, res) => {
  const ok = !!(ACCESS_TOKEN && PHONE_NUMBER_ID);
  res.json({ status: ok ? 'conectado' : 'desconectado', provider: 'meta_cloud_api' });
});

app.get('/health', (req, res) => res.json({ ok: true }));

/* ── No-op endpoints (mantidos para compatibilidade com o frontend) ── */
app.post('/conectar/:unidadeId', (req, res) => res.json({ ok: true, message: 'Meta Cloud API não precisa de QR Code' }));
app.get('/conectar/:unidadeId',  (req, res) => res.json({ ok: true }));
app.post('/desconectar',         (req, res) => res.json({ ok: true }));
app.get('/qr', (req, res) => res.send(`
  <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
    <h2>✅ Meta Cloud API</h2>
    <p>Este servidor usa a API oficial do WhatsApp — sem QR Code.</p>
    <p style="color:#666">Configure o webhook em developers.facebook.com</p>
  </body></html>
`));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[eye] Servidor Meta Cloud API rodando na porta ${PORT}`);
  if (!ACCESS_TOKEN)    console.warn('[eye] AVISO: META_ACCESS_TOKEN não configurado');
  if (!PHONE_NUMBER_ID) console.warn('[eye] AVISO: META_PHONE_NUMBER_ID não configurado');
  if (!UNIDADE_ID)      console.warn('[eye] AVISO: UNIDADE_ID_DEFAULT não configurado');
});
