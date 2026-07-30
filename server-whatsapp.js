const express = require('express');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let sock = null;
let qrCodeBase64 = null;
let connectionStatus = 'desconectado';

async function conectarWhatsApp(unidadeId) {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions/' + unidadeId);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCodeBase64 = await QRCode.toDataURL(qr);
      connectionStatus = 'aguardando_qr';
      await supabase.from('whatsapp_conexoes').upsert({
        unidade_id: unidadeId,
        status: 'aguardando_qr',
        qr_code: qrCodeBase64,
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'unidade_id' });
      console.log('QR Code gerado');
    }

    if (connection === 'open') {
      connectionStatus = 'conectado';
      qrCodeBase64 = null;
      await supabase.from('whatsapp_conexoes').upsert({
        unidade_id: unidadeId,
        status: 'conectado',
        qr_code: null,
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'unidade_id' });
      console.log('WhatsApp conectado');
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const deveReconectar = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = deveReconectar ? 'reconectando' : 'desconectado';
      await supabase.from('whatsapp_conexoes').upsert({
        unidade_id: unidadeId,
        status: connectionStatus,
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'unidade_id' });
      if (deveReconectar) {
        setTimeout(() => conectarWhatsApp(unidadeId), 5000);
      } else {
        sock = null;
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const numero = msg.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || '';
      if (!texto) continue;
      const { data: lead } = await supabase
        .from('leads')
        .select('id, nome')
        .eq('unidade_id', unidadeId)
        .eq('telefone', numero)
        .maybeSingle();
      await supabase.from('whatsapp_mensagens').insert({
        unidade_id: unidadeId,
        lead_id: lead?.id || null,
        numero_cliente: numero,
        nome_cliente: lead?.nome || numero,
        mensagem: texto,
        tipo: 'recebida',
        lida: false,
        timestamp: new Date().toISOString()
      });
    }
  });
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/status', (req, res) => {
  res.json({ status: connectionStatus, qr: qrCodeBase64 });
});

app.post('/conectar/:unidadeId', async (req, res) => {
  await conectarWhatsApp(req.params.unidadeId);
  res.json({ ok: true, message: 'Conectando...' });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('Servidor WhatsApp rodando na porta', PORT);
  const unidadeId = process.env.UNIDADE_ID_DEFAULT;
  if (unidadeId) conectarWhatsApp(unidadeId);
});
