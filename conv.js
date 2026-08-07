const WPP_SERVER    = 'https://eye-demo1-production.up.railway.app';
const WPP_TEMPLATES = [
  { label: 'Saudação',      text: 'Olá! Tudo bem? Sou do time Eye Motors. Como posso te ajudar hoje?' },
  { label: 'Modelo?',       text: 'Qual modelo você está procurando? Temos várias opções disponíveis!' },
  { label: 'Visita',        text: 'Que tal agendar uma visita? Qual dia e horário fica melhor para você?' },
  { label: 'Financiamento', text: 'Posso verificar as melhores condições de financiamento. Me passa seu CPF?' },
  { label: 'Disponível',    text: 'Esse veículo está disponível sim! Posso reservar. Quer vir hoje?' },
];

let _activeWppNum = null;
let _wppMsgsCache = [];
let _wppConvs     = [];
let _wppConvSub   = null;

/* ── helpers ── */
const CONV_COLORS = ['#5856D6','#007AFF','#34C759','#FF9F0A','#d4537e','#9b59b6','#ba7517'];
function convColor(p)     { return CONV_COLORS[(p||'').charCodeAt((p||'').length-1) % CONV_COLORS.length]; }
function convInitials(n,p){ return (n||p||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function fmtMsgTime(iso) {
  if (!iso) return '';
  const d=new Date(iso), now=new Date(), diff=now-d;
  if (diff<86400000)  return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if (diff<604800000) return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

/* ── group raw messages into conversations ── */
function _groupWppConvs(msgs) {
  const map = {};
  msgs.forEach(m => {
    const k = m.numero_cliente;
    if (!map[k]) map[k] = { numero:k, nome:m.nome_cliente||k, lastMsg:'', lastTs:'', unread:0 };
    if ((m.timestamp||'') > (map[k].lastTs||'')) {
      map[k].lastTs  = m.timestamp;
      map[k].lastMsg = m.mensagem;
      if (m.nome_cliente && m.nome_cliente !== k) map[k].nome = m.nome_cliente;
    }
    if (!m.lida && m.tipo === 'recebida') map[k].unread++;
  });
  return Object.values(map).sort((a,b) => (b.lastTs||'') > (a.lastTs||'') ? 1 : -1);
}

/* ── badge on sidebar ── */
function _updateConvBadge() {
  const total = _wppConvs.reduce((s,c) => s + (c.unread||0), 0);
  const btn = document.querySelector('#tab-nav button[onclick*="conv"]');
  if (!btn) return;
  let b = btn.querySelector('.task-badge');
  if (total <= 0) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'task-badge'; btn.appendChild(b); }
  b.textContent = total;
}

/* ── inject styles once ── */
function _injectConvStyles() {
  if (document.getElementById('eye-conv-styles')) return;
  const s = document.createElement('style');
  s.id = 'eye-conv-styles';
  s.textContent = `
    .conv-ai-box{padding:10px 12px;background:#fffbf0;border-top:1px solid #FFD60A40;display:none}
    .conv-ai-box .ai-text{font-size:13px;color:var(--txt1,#1c1c1e);line-height:1.5;white-space:pre-wrap;margin-bottom:8px}
    .conv-ai-box .ai-use{padding:5px 14px;border-radius:8px;border:none;background:#FF9F0A;color:#fff;font-size:12px;font-weight:600;cursor:pointer}
    .conv-templates{display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px;border-top:0.5px solid var(--bdr,#e5e5ea);background:var(--bg2,#f9f9fb)}
    .tpl-chip{padding:3px 10px;border-radius:20px;border:1px solid var(--bdr,#e5e5ea);background:var(--bg1,#fff);font-size:11px;font-weight:500;color:var(--txt2,#636366);cursor:pointer;transition:all 0.15s;white-space:nowrap}
    .tpl-chip:hover{background:#5B6EFF;color:#fff;border-color:#5B6EFF}
    .conv-ai-btn{width:34px;height:34px;border-radius:8px;border:1px solid var(--bdr,#e5e5ea);background:var(--bg1,#fff);color:#5B6EFF;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s}
    .conv-ai-btn:hover{background:#5B6EFF;color:#fff}
    .conv-ai-btn:disabled{opacity:0.5;cursor:not-allowed}
    @keyframes eye-crm-spin{to{transform:rotate(360deg)}}
    .eye-crm-spinner{display:inline-block;width:12px;height:12px;border:2px solid rgba(91,110,255,0.3);border-top-color:#5B6EFF;border-radius:50%;animation:eye-crm-spin 0.7s linear infinite}
  `;
  document.head.appendChild(s);
}

/* ── template quick-fill ── */
function _useTpl(i) {
  const t = WPP_TEMPLATES[i];
  if (!t) return;
  const inp = document.getElementById('conv-input');
  if (!inp) return;
  inp.value = t.text;
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
  inp.focus();
}

/* ── IA suggestion from Eye CRM ── */
async function eyeAISugerir() {
  const btn = document.getElementById('conv-ai-btn');
  const box = document.getElementById('conv-ai-box');
  if (!btn || !box) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="eye-crm-spinner"></span>';

  const uid  = currentUnitId();
  const conv = _wppConvs.find(c => c.numero === _activeWppNum);
  const nome = conv?.nome || _activeWppNum;

  let msgsQ = sb.from('whatsapp_mensagens').select('mensagem,tipo')
    .eq('numero_cliente', _activeWppNum).order('timestamp', { ascending: false }).limit(10);
  if (uid) msgsQ = msgsQ.eq('unidade_id', uid);
  const { data: msgs } = await msgsQ;

  const ctx = (msgs || []).reverse()
    .map(m => `${m.tipo === 'recebida' ? nome : 'SDR'}: ${m.mensagem}`).join('\n');

  try {
    const res = await fetch(`${WPP_SERVER}/groq-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: nome, phone: _activeWppNum, context: ctx })
    });
    const data = await res.json();
    const txt = data.suggestion || '';
    if (txt) {
      box.style.display = 'block';
      box.querySelector('.ai-text').textContent = txt;
    } else { toast('IA não retornou sugestão', 'err'); }
  } catch(e) { toast('Erro IA: ' + e.message, 'err'); }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-sparkles"></i>';
}

/* ── push notification helper ── */
function _showWppNotification(m) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Nova mensagem — Eye CRM', {
    body: `${m.nome_cliente || m.numero_cliente}: ${(m.mensagem || '').slice(0, 80)}`,
    icon: '/favicon.ico',
    tag:  `wpp-${m.numero_cliente}`
  });
}

/* ── main render ── */
async function renderConv() {
  _injectConvStyles();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const el = document.getElementById('v-conv');
  el.innerHTML = `
    <div class="conv-wrap" id="conv-wrap">
      <div class="conv-left" id="conv-left">
        <div class="conv-search" style="display:flex;gap:6px;align-items:center">
          <input class="fi fi-search" style="flex:1;height:34px" placeholder="Buscar número ou nome…"
            oninput="drawWppList(this.value)" id="conv-q">
          <button onclick="toggleRelatoriosView()" id="btn-relat" title="Relatórios SDR"
            style="height:34px;padding:0 10px;border-radius:10px;border:none;background:var(--bg2);color:var(--txt2);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap">
            <i class="ti ti-chart-bar"></i> SDR
          </button>
        </div>
        <div class="conv-list" id="conv-list">
          <div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">
            <i class="ti ti-loader-2" style="font-size:24px;display:block;margin-bottom:8px;animation:spin 1s linear infinite;color:var(--ind)"></i>Carregando…
          </div>
        </div>
      </div>
      <div class="conv-right" id="conv-right">
        <div class="conv-empty-right">
          <i class="ti ti-brand-whatsapp" style="font-size:48px;opacity:.15"></i>
          <p style="font-size:13px;color:var(--txt3)">Selecione uma conversa</p>
        </div>
      </div>
    </div>`;
  await loadWppConvs();
  startWppRealtime();
}

let _showingRelat = false;
async function toggleRelatoriosView() {
  _showingRelat = !_showingRelat;
  const btn = document.getElementById('btn-relat');
  if (btn) btn.style.background = _showingRelat ? 'var(--ind)' : 'var(--bg2)';
  if (btn) btn.style.color      = _showingRelat ? '#fff' : 'var(--txt2)';
  if (_showingRelat) await renderRelatorios();
  else drawWppList();
}

async function renderRelatorios() {
  const list = document.getElementById('conv-list');
  const right = document.getElementById('conv-right');
  if (!list) return;

  list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:20px;display:block;margin-bottom:6px"></i>Carregando…</div>`;

  const uid = currentUnitId();
  let q = sb.from('whatsapp_mensagens').select('*').eq('tipo','relatorio_sdr').order('timestamp',{ascending:false}).limit(50);
  if (uid) q = q.eq('unidade_id', uid);
  const { data } = await q;
  const relats   = (data || []).map(r => { try { return { ...r, dados: JSON.parse(r.mensagem) }; } catch { return { ...r, dados: null }; } });

  if (!relats.length) {
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">Nenhum relatório enviado ainda.<br><span style="font-size:11px;opacity:.6">Os SDRs enviam pelo botão 📊 da extensão.</span></div>`;
    right.innerHTML = `<div class="conv-empty-right"><i class="ti ti-chart-bar" style="font-size:48px;opacity:.15"></i><p style="font-size:13px;color:var(--txt3)">Relatórios SDR diários</p></div>`;
    return;
  }

  list.innerHTML = relats.map((r,i) => {
    const d   = r.dados;
    const dia = d?.date ? new Date(d.date).toLocaleDateString('pt-BR') : new Date(r.timestamp).toLocaleDateString('pt-BR');
    return `<div class="conv-item" onclick="openRelatorio(${i})" data-idx="${i}" style="flex-direction:column;align-items:flex-start;gap:2px">
      <div style="display:flex;width:100%;align-items:center;gap:8px">
        <div class="ci-av2" style="background:var(--ind);font-size:11px">${(r.nome_cliente||'SDR').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--txt1)">${esc(r.nome_cliente||'SDR')}</div>
          <div style="font-size:11px;color:var(--txt3)">${dia} · ${d?.total||0} contatos · ${d?.novosLeads||0} novos</div>
        </div>
      </div>
    </div>`;
  }).join('');

  window._relats = relats;
  if (relats.length) openRelatorio(0);
}

function openRelatorio(idx) {
  const r     = (window._relats || [])[idx];
  if (!r) return;
  const d     = r.dados;
  const convs = d?.conversations || [];
  const novos = convs.filter(c => c.isNewLead).length;
  const diaFmt = d?.date
    ? new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    : new Date(r.timestamp).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const right = document.getElementById('conv-right');

  right.innerHTML = `
    <div class="conv-header">
      <div class="ci-av2" style="background:var(--ind);width:36px;height:36px;font-size:12px">${(r.nome_cliente||'SDR').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
      <div class="ch-info">
        <div class="ch-name">${esc(r.nome_cliente||'SDR')}</div>
        <div class="ch-phone" style="text-transform:capitalize">${diaFmt}</div>
      </div>
      <button onclick="exportarRelatorioPDF(${idx})" style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;border:none;background:var(--ind);color:#fff;font-size:12px;font-weight:600;cursor:pointer">
        <i class="ti ti-file-type-pdf"></i> Exportar PDF
      </button>
    </div>
    <div class="conv-msgs" style="padding:16px;overflow-y:auto">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="background:var(--bg2);border-radius:14px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:var(--ind)">${convs.length}</div>
          <div style="font-size:11px;color:var(--txt3);margin-top:4px">Atendidos</div>
        </div>
        <div style="background:var(--bg2);border-radius:14px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:var(--amb)">${novos}</div>
          <div style="font-size:11px;color:var(--txt3);margin-top:4px">Novos leads</div>
        </div>
        <div style="background:var(--bg2);border-radius:14px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:var(--grn)">${convs.length - novos}</div>
          <div style="font-size:11px;color:var(--txt3);margin-top:4px">Já cadastrados</div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Contatos atendidos</div>
      ${convs.length === 0
        ? `<div style="color:var(--txt3);font-size:13px;text-align:center;padding:20px">Nenhum contato registrado</div>`
        : convs.map((c, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid var(--bdr)">
            <div style="font-size:12px;color:var(--txt3);width:14px;text-align:right;flex-shrink:0;font-weight:600">${i+1}</div>
            <div style="font-size:11px;color:var(--txt3);width:36px;flex-shrink:0">${c.hora||'—'}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--txt1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome||c.telefone||'Desconhecido')}</div>
              <div style="font-size:11px;color:var(--txt3)">${c.telefone||''}</div>
            </div>
            <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;flex-shrink:0;background:${c.isNewLead?'#fff3e0':'#e8f0ff'};color:${c.isNewLead?'#e65100':'#3a4acc'}">${c.isNewLead?'NOVO LEAD':'JÁ CADASTRADO'}</span>
          </div>`).join('')}
    </div>`;

  document.querySelectorAll('#conv-list .conv-item').forEach((el, i) => el.classList.toggle('on', i === idx));
}

function exportarRelatorioPDF(idx) {
  const r     = (window._relats || [])[idx];
  if (!r) return;
  const d     = r.dados;
  const convs = d?.conversations || [];
  const novos = convs.filter(c => c.isNewLead).length;
  const sdr   = r.nome_cliente || 'SDR';
  const diaFmt = d?.date
    ? new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    : new Date(r.timestamp).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  const rows = convs.map((c, i) => `
    <tr>
      <td style="color:#8e8e93;text-align:center">${i+1}</td>
      <td style="color:#8e8e93;text-align:center">${c.hora||'—'}</td>
      <td style="font-weight:600">${c.nome||c.telefone||'Desconhecido'}</td>
      <td style="color:#8e8e93">${c.telefone||'—'}</td>
      <td style="text-align:center">
        <span style="padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${c.isNewLead?'#fff3e0':'#e8f0ff'};color:${c.isNewLead?'#e65100':'#3a4acc'}">${c.isNewLead?'NOVO LEAD':'JÁ CADASTRADO'}</span>
      </td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Relatório SDR — ${sdr}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif; background:#fff; color:#1c1c1e; padding:40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid #f2f2f7; }
    .logo { font-size:22px; font-weight:800; color:#5B6EFF; letter-spacing:-0.5px; }
    .logo span { color:#1c1c1e; }
    .header-right { text-align:right; }
    h1 { font-size:20px; font-weight:700; margin-bottom:4px; }
    .subtitle { font-size:13px; color:#8e8e93; text-transform:capitalize; }
    .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:32px; }
    .kpi { background:#f9f9fb; border-radius:14px; padding:16px; text-align:center; }
    .kpi .num { font-size:36px; font-weight:700; }
    .kpi .lbl { font-size:11px; color:#8e8e93; margin-top:6px; text-transform:uppercase; letter-spacing:.4px; }
    .kpi.total .num { color:#5B6EFF; }
    .kpi.novos  .num { color:#FF9F0A; }
    .kpi.exist  .num { color:#34C759; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#f2f2f7; padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#8e8e93; font-weight:600; }
    th:first-child, th:nth-child(2) { text-align:center; }
    td { padding:10px 12px; border-bottom:.5px solid #f2f2f7; vertical-align:middle; }
    tr:last-child td { border-bottom:none; }
    .footer { margin-top:32px; padding-top:16px; border-top:1px solid #f2f2f7; font-size:11px; color:#aeaeb2; display:flex; justify-content:space-between; }
    @media print { body { padding:20px; } @page { margin:1cm; } }
  </style>
  </head><body>
  <div class="header">
    <div>
      <div class="logo">eye<span>.crm</span></div>
      <div style="margin-top:8px;font-size:13px;color:#8e8e93">Relatório de Atendimento WhatsApp</div>
    </div>
    <div class="header-right">
      <h1>${sdr}</h1>
      <div class="subtitle">${diaFmt}</div>
    </div>
  </div>
  <div class="kpis">
    <div class="kpi total"><div class="num">${convs.length}</div><div class="lbl">Total atendidos</div></div>
    <div class="kpi novos"><div class="num">${novos}</div><div class="lbl">Novos leads</div></div>
    <div class="kpi exist"><div class="num">${convs.length - novos}</div><div class="lbl">Já cadastrados</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Hora</th><th>Nome</th><th>Telefone</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>Eye CRM — Carros Online</span>
    <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

/* ── load all messages for current unit → group into convs ── */
async function loadWppConvs() {
  const uid = currentUnitId();
  let q = sb.from('whatsapp_mensagens').select('*').neq('tipo','relatorio_sdr').order('timestamp', {ascending:false});
  if (uid) q = q.eq('unidade_id', uid);
  const { data, error } = await q;
  if (error) { console.error('wpp:', error); return; }
  _wppMsgsCache = data || [];
  _wppConvs = _groupWppConvs(_wppMsgsCache);
  drawWppList();
  _updateConvBadge();
}

/* ── draw the left-panel list ── */
function drawWppList(q = '') {
  q = (q || document.getElementById('conv-q')?.value || '').toLowerCase();
  let list = _wppConvs;
  if (q) list = list.filter(c => (c.nome+c.numero).toLowerCase().includes(q));
  const el = document.getElementById('conv-list'); if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">
      ${_wppMsgsCache.length ? 'Nenhuma conversa encontrada' : 'Ainda não há mensagens WhatsApp recebidas nesta unidade'}</div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="conv-item${_activeWppNum===c.numero?' on':''}" onclick="openWppConv('${c.numero}')">
      <div class="ci-av2" style="background:${convColor(c.numero)}">${convInitials(c.nome, c.numero)}</div>
      <div class="ci-info2">
        <div class="ci-top">
          <span>${esc(c.nome)}</span>
          <span class="ci-time">${fmtMsgTime(c.lastTs)}</span>
        </div>
        <div class="ci-preview">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.lastMsg||'')}</span>
          ${c.unread > 0 ? `<span class="ci-badge">${c.unread}</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

/* ── open a conversation ── */
async function openWppConv(numero) {
  _activeWppNum = numero;
  drawWppList();
  const uid = currentUnitId();
  const conv = _wppConvs.find(c => c.numero === numero);

  /* mark as read */
  let markQ = sb.from('whatsapp_mensagens').update({lida:true}).eq('numero_cliente',numero).eq('lida',false);
  if (uid) markQ = markQ.eq('unidade_id', uid);
  await markQ;
  if (conv) conv.unread = 0;
  _updateConvBadge(); drawWppList();

  /* load messages for this number */
  let msgsQ = sb.from('whatsapp_mensagens').select('*').eq('numero_cliente',numero).order('timestamp',{ascending:true});
  if (uid) msgsQ = msgsQ.eq('unidade_id', uid);
  const { data: msgs } = await msgsQ;

  const nome  = conv?.nome || numero;
  const color = convColor(numero);

  document.getElementById('conv-right').innerHTML = `
    <div class="conv-header">
      <div class="ci-av2" style="background:${color};width:36px;height:36px;font-size:12px">${convInitials(nome, numero)}</div>
      <div class="ch-info">
        <div class="ch-name">${esc(nome)}</div>
        <div class="ch-phone">${numero}</div>
      </div>
      <button class="btn-s p" data-num="${numero}" data-nome="${esc(nome)}" onclick="criarLeadDaWpp(this.dataset.num,this.dataset.nome)">
        <i class="ti ti-user-plus"></i>Criar lead
      </button>
    </div>
    <div class="conv-msgs" id="conv-msgs">
      ${(msgs||[]).length
        ? (msgs||[]).map(wppMsgBubble).join('')
        : '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:30px">Nenhuma mensagem ainda</div>'}
    </div>
    <div class="conv-ai-box" id="conv-ai-box">
      <div class="ai-text"></div>
      <button class="ai-use" onclick="(function(){var t=document.getElementById('conv-ai-box').querySelector('.ai-text');var i=document.getElementById('conv-input');if(t&&i){i.value=t.textContent;i.style.height='auto';i.style.height=Math.min(i.scrollHeight,100)+'px';document.getElementById('conv-ai-box').style.display='none';}})()"><i class="ti ti-arrow-down-circle"></i> Usar</button>
    </div>
    <div class="conv-templates">
      ${WPP_TEMPLATES.map((t,i) => `<button class="tpl-chip" onclick="_useTpl(${i})">${esc(t.label)}</button>`).join('')}
    </div>
    <div class="conv-input-wrap">
      <textarea class="conv-input" id="conv-input" rows="1" placeholder="Digite sua mensagem… (Enter para enviar)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendWppMsg()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
      <button class="conv-ai-btn" id="conv-ai-btn" onclick="eyeAISugerir()" title="Sugerir resposta com IA"><i class="ti ti-sparkles"></i></button>
      <button class="conv-send" onclick="sendWppMsg()"><i class="ti ti-send"></i></button>
    </div>`;

  const msgsEl = document.getElementById('conv-msgs');
  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
}

/* ── message bubble ── */
function wppMsgBubble(m) {
  const isOut = m.tipo === 'enviada';
  const time  = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
  return `<div class="msg-bubble ${isOut ? 'msg-out' : 'msg-in'}">
    <div>${esc(m.mensagem)}</div>
    <div class="msg-time">${time}</div>
  </div>`;
}

/* ── send a message ── */
async function sendWppMsg() {
  const input = document.getElementById('conv-input');
  const mensagem = (input?.value || '').trim();
  if (!mensagem || !_activeWppNum) return;
  input.value = ''; input.style.height = 'auto';

  const uid = currentUnitId();
  const now = new Date().toISOString();

  /* optimistic render */
  const msgsEl = document.getElementById('conv-msgs');
  if (msgsEl) {
    msgsEl.insertAdjacentHTML('beforeend', wppMsgBubble({ mensagem, tipo:'enviada', timestamp:now }));
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  /* update local list */
  const conv = _wppConvs.find(c => c.numero === _activeWppNum);
  if (conv) { conv.lastMsg = mensagem; conv.lastTs = now; }
  drawWppList();

  /* call Railway server — it saves to whatsapp_mensagens automatically */
  try {
    const res = await fetch(`${WPP_SERVER}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: _activeWppNum, mensagem, unidadeId: uid })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      toast('Erro ao enviar: ' + (err.erro || 'verifique a conexão WhatsApp'), 'err');
    }
  } catch(e) {
    toast('Sem conexão com o servidor WhatsApp', 'err');
  }
}

/* ── create lead from WhatsApp ── */
async function criarLeadDaWpp(numero, nome) {
  await getUsers();
  const vnds = vendedores();
  document.getElementById('a-vnd').innerHTML =
    `<option value="">Selecione…</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('appt-modal-title').textContent = 'Criar lead do WhatsApp';
  document.getElementById('appt-id').value   = '';
  document.getElementById('a-cli').value     = nome !== numero ? nome : '';
  document.getElementById('a-tel').value     = numero;
  document.getElementById('a-data').value    = today;
  document.getElementById('a-orig').value    = 'WhatsApp Direto';
  document.getElementById('a-status').value  = 'em_atendimento';
  document.getElementById('a-vnd').value     = '';
  ['a-hora','a-modelo','a-valor','a-obs','a-prox'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('a-pgto').value = '';
  document.getElementById('ov-appt').classList.add('on');
}

/* ── realtime subscription ── */
function startWppRealtime() {
  if (_wppConvSub) { try { sb.removeChannel(_wppConvSub); } catch(e) {} }
  const uid = currentUnitId();
  _wppConvSub = sb.channel('eye-wpp-rt2')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens',
      ...(uid ? { filter: `unidade_id=eq.${uid}` } : {})
    }, async payload => {
      const m = payload.new;
      _wppMsgsCache.unshift(m);
      _wppConvs = _groupWppConvs(_wppMsgsCache);
      drawWppList();
      _updateConvBadge();
      /* if this conv is open, append + mark read */
      if (m.tipo === 'recebida') {
        if (document.hidden || m.numero_cliente !== _activeWppNum) {
          _showWppNotification(m);
        }
      }
      if (m.numero_cliente === _activeWppNum && m.tipo === 'recebida') {
        const msgsEl = document.getElementById('conv-msgs');
        if (msgsEl) {
          msgsEl.insertAdjacentHTML('beforeend', wppMsgBubble(m));
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }
        await sb.from('whatsapp_mensagens').update({lida:true}).eq('id', m.id);
        const conv = _wppConvs.find(c => c.numero === m.numero_cliente);
        if (conv) conv.unread = 0;
        _updateConvBadge();
        drawWppList();
      }
    })
    .subscribe();
}
