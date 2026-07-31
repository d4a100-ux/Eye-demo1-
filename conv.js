const WPP_SERVER = 'https://eye-demo1-production.up.railway.app';

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

/* ── main render ── */
async function renderConv() {
  const el = document.getElementById('v-conv');
  el.innerHTML = `
    <div class="conv-wrap" id="conv-wrap">
      <div class="conv-left" id="conv-left">
        <div class="conv-search">
          <input class="fi fi-search" style="width:100%;height:34px" placeholder="Buscar número ou nome…"
            oninput="drawWppList(this.value)" id="conv-q">
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

/* ── load all messages for current unit → group into convs ── */
async function loadWppConvs() {
  const uid = currentUnitId();
  let q = sb.from('whatsapp_mensagens').select('*').order('timestamp', {ascending:false});
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
      <button class="btn-s p" onclick="criarLeadDaWpp('${numero}','${esc(nome)}')">
        <i class="ti ti-user-plus"></i>Criar lead
      </button>
    </div>
    <div class="conv-msgs" id="conv-msgs">
      ${(msgs||[]).length
        ? (msgs||[]).map(wppMsgBubble).join('')
        : '<div style="text-align:center;color:var(--txt3);font-size:13px;padding:30px">Nenhuma mensagem ainda</div>'}
    </div>
    <div class="conv-input-wrap">
      <textarea class="conv-input" id="conv-input" rows="1" placeholder="Digite sua mensagem… (Enter para enviar)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendWppMsg()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
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
      /* if this conv is open, append incoming message */
      if (m.numero_cliente === _activeWppNum && m.tipo === 'recebida') {
        const msgsEl = document.getElementById('conv-msgs');
        if (msgsEl) { msgsEl.insertAdjacentHTML('beforeend', wppMsgBubble(m)); msgsEl.scrollTop = msgsEl.scrollHeight; }
        /* mark read immediately */
        await sb.from('whatsapp_mensagens').update({lida:true}).eq('id', m.id);
        const conv = _wppConvs.find(c => c.numero === m.numero_cliente);
        if (conv) conv.unread = 0;
        _updateConvBadge();
      }
    })
    .subscribe();
}
