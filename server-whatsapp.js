const express = require('express');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
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

let sock = null;
let qrCodeBase64 = null;
let connectionStatus = 'desconectado';

async function conectarWhatsApp(unidadeId) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./sessions/' + unidadeId);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: require('pino')({ level: 'silent' }),
      browser: ['eye CRM', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCodeBase64 = await QRCode.toDataURL(qr);
        connectionStatus = 'aguardando_qr';
        await supabase.from('whatsapp_conexoes').upsert({
          unidade_id: unidadeId, status: 'aguardando_qr',
          qr_code: qrCodeBase64, atualizado_em: new Date().toISOString()
        }, { onConflict: 'unidade_id' });
      }
      if (connection === 'open') {
        connectionStatus = 'conectado';
        qrCodeBase64 = null;
        await supabase.from('whatsapp_conexoes').upsert({
          unidade_id: unidadeId, status: 'conectado',
          qr_code: null, atualizado_em: new Date().toISOString()
        }, { onConflict: 'unidade_id' });
        console.log('WhatsApp conectado');
      }
      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const deveReconectar = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = deveReconectar ? 'reconectando' : 'desconectado';
        await supabase.from('whatsapp_conexoes').upsert({
          unidade_id: unidadeId, status: connectionStatus,
          atualizado_em: new Date().toISOString()
        }, { onConflict: 'unidade_id' });
        sock = null;
        setTimeout(() => conectarWhatsApp(unidadeId), deveReconectar ? 3000 : 5000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log('[wpp] messages.upsert type:', type, 'count:', messages.length);
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const numero = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const texto = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || msg.message?.imageMessage?.caption || '';
        console.log('[wpp] msg de:', numero, '| texto:', texto?.slice(0, 40));
        if (!texto) continue;
        try {
          const { data: lead } = await supabase
            .from('leads').select('id, nome')
            .eq('unidade_id', unidadeId)
            .eq('telefone', numero).maybeSingle();
          const { error } = await supabase.from('whatsapp_mensagens').insert({
            unidade_id: unidadeId, lead_id: lead?.id || null,
            numero_cliente: numero, nome_cliente: lead?.nome || numero,
            mensagem: texto, tipo: 'recebida', lida: false,
            timestamp: new Date().toISOString()
          });
          if (error) console.error('[wpp] erro ao salvar mensagem:', error.message, '| unidadeId:', unidadeId);
          else console.log('[wpp] mensagem salva OK');
        } catch (err) {
          console.error('[wpp] exceção ao salvar mensagem:', err.message);
        }
      }
    });

  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err);
    setTimeout(() => conectarWhatsApp(unidadeId), 5000);
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/status', (req, res) => {
  res.json({ status: connectionStatus, qr: qrCodeBase64 });
});

app.post('/conectar/:unidadeId', async (req, res) => {
  await conectarWhatsApp(req.params.unidadeId);
  res.json({ ok: true, message: 'Conectando...' });
});

app.get('/conectar/:unidadeId', async (req, res) => {
  conectarWhatsApp(req.params.unidadeId);
  res.json({ ok: true, message: 'Iniciando conexão...' });
});

app.post('/enviar', async (req, res) => {
  const { numero, mensagem, unidadeId } = req.body;
  if (!sock) return res.status(400).json({ erro: 'WhatsApp não conectado' });
  try {
    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });
    await supabase.from('whatsapp_mensagens').insert({
      unidade_id: unidadeId,
      numero_cliente: numero,
      mensagem: mensagem,
      tipo: 'enviada',
      timestamp: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post('/desconectar', async (req, res) => {
  if (sock) { await sock.logout(); sock = null; }
  res.json({ ok: true });
});

app.get('/qr', (req, res) => {
  if (!qrCodeBase64) {
    return res.send(`
      <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;flex-direction:column">
        <h2>QR Code não disponível</h2>
        <p>Status: ${connectionStatus}</p>
        <p>${connectionStatus === 'conectado' ? '✅ WhatsApp já conectado!' : 'Aguarde o servidor gerar o QR Code...'}</p>
        <button onclick="location.reload()" style="padding:10px 20px;margin-top:20px;cursor:pointer">Atualizar</button>
      </body></html>
    `);
  }
  res.send(`
    <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;flex-direction:column;gap:20px">
      <h2 style="margin:0">Escaneie com o WhatsApp</h2>
      <p style="margin:0;color:#666">Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
      <img src="${qrCodeBase64}" style="width:300px;height:300px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
      <p style="margin:0;color:#999;font-size:13px">O QR Code expira em 60 segundos — atualize se necessário</p>
      <button onclick="location.reload()" style="padding:10px 24px;background:#5B6EFF;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px">Atualizar QR Code</button>
    </body></html>
  `);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('Servidor WhatsApp rodando na porta', PORT);
  const unidadeId = process.env.UNIDADE_ID_DEFAULT;
  if (unidadeId) conectarWhatsApp(unidadeId);
});
