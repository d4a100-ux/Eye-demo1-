let _activeConvId = null;
let _convsCache   = [];
let _convFilter   = 'aguardando';
let _realtimeSub  = null;

const CONV_COLORS = ['#5856D6','#007AFF','#34C759','#FF9F0A','#d4537e','#9b59b6','#ba7517'];
function convColor(phone)          { return CONV_COLORS[(phone||'').charCodeAt((phone||'').length-1) % CONV_COLORS.length]; }
function convInitials(name, phone) { return (name||phone||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function fmtMsgTime(iso) {
  if (!iso) return '';
  const d=new Date(iso), now=new Date(), diff=now-d;
  if (diff<86400000)  return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if (diff<604800000) return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

async function renderConv() {
  const el=document.getElementById('v-conv');
  el.innerHTML=`<div class="conv-wrap" id="conv-wrap">
    <div class="conv-left" id="conv-left">
      <div class="conv-search"><input class="fi fi-search" style="width:100%;height:34px" placeholder="Buscar…" oninput="drawConvList(this.value)" id="conv-q"></div>
      <div class="conv-filter-tabs">
        <div class="conv-ft on"  onclick="setConvFilter('aguardando',this)">Aguardando<span id="ct-aw"></span></div>
        <div class="conv-ft"     onclick="setConvFilter('atendendo',this)">Atendendo<span id="ct-at"></span></div>
        <div class="conv-ft"     onclick="setConvFilter('finalizado',this)">Finalizados<span id="ct-fn"></span></div>
      </div>
      <div class="conv-list" id="conv-list">
        <div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">
          <i class="ti ti-loader-2" style="font-size:24px;display:block;margin-bottom:8px;animation:spin 1s linear infinite;color:var(--ind)"></i>Carregando…
        </div>
      </div>
    </div>
    <div class="conv-right" id="conv-right">
      <div class="conv-empty-right"><i class="ti ti-message-2" style="font-size:48px;opacity:.15"></i><p style="font-size:13px;color:var(--txt3)">Selecione uma conversa</p></div>
    </div>
  </div>`;
  await loadConvList();
  startRealtimeConv();
}

async function loadConvList() {
  const{data,error}=await sb.from('eye_conversations').select('*').order('last_message_at',{ascending:false});
  if(error){console.error('conv:',error);return;}
  _convsCache=data||[];
  drawConvList();
}

function drawConvList(q='') {
  q=q||(document.getElementById('conv-q')?.value||''); q=q.toLowerCase();
  let list=_convsCache.filter(c=>c.status===_convFilter);
  if(q) list=list.filter(c=>((c.name||'')+(c.phone||'')).toLowerCase().includes(q));
  const counts={aguardando:0,atendendo:0,finalizado:0};
  _convsCache.forEach(c=>{if(counts[c.status]!==undefined) counts[c.status]++;});
  [{s:'aguardando',id:'ct-aw'},{s:'atendendo',id:'ct-at'},{s:'finalizado',id:'ct-fn'}].forEach(({s,id})=>{
    const el=document.getElementById(id); if(el) el.textContent=counts[s]?` (${counts[s]})`:'';
  });
  const listEl=document.getElementById('conv-list'); if(!listEl) return;
  if(!list.length){listEl.innerHTML=`<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">Nenhuma conversa</div>`;return;}
  listEl.innerHTML=list.map(c=>`
    <div class="conv-item${_activeConvId===c.id?' on':''}" onclick="openConv('${c.id}')">
      <div class="ci-av2" style="background:${convColor(c.phone)}">${convInitials(c.name,c.phone)}</div>
      <div class="ci-info2">
        <div class="ci-top"><span>${c.name||c.phone}</span><span class="ci-time">${fmtMsgTime(c.last_message_at)}</span></div>
        <div class="ci-preview">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.last_message||c.phone||'—'}</span>
          ${c.unread_count>0?`<span class="ci-badge">${c.unread_count}</span>`:''}
        </div>
      </div>
    </div>`).join('');
}

function setConvFilter(filter,btn){
  _convFilter=filter;
  document.querySelectorAll('.conv-ft').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on'); drawConvList();
}

async function openConv(id) {
  _activeConvId=id; drawConvList();
  const conv=_convsCache.find(c=>c.id===id); if(!conv) return;
  if(conv.status==='aguardando'){
    await sb.from('eye_conversations').update({status:'atendendo',assigned_to:CU.nome,unread_count:0}).eq('id',id);
    conv.status='atendendo'; conv.assigned_to=CU.nome; conv.unread_count=0; drawConvList();
  } else {
    await sb.from('eye_conversations').update({unread_count:0}).eq('id',id);
    conv.unread_count=0;
  }
  const{data:msgs}=await sb.from('eye_messages').select('*').eq('conversation_id',id).order('created_at');
  const color=convColor(conv.phone), inits=convInitials(conv.name,conv.phone);
  document.getElementById('conv-right').innerHTML=`
    <div class="conv-header">
      <div class="ci-av2" style="background:${color};width:36px;height:36px;font-size:12px">${inits}</div>
      <div class="ch-info"><div class="ch-name">${conv.name||conv.phone}</div><div class="ch-phone">${conv.phone}${conv.assigned_to?' · <b>'+conv.assigned_to+'</b>':''}</div></div>
      <button class="btn-s p" onclick="criarLeadDaConv('${id}')"><i class="ti ti-user-plus"></i>Criar lead</button>
      ${CU.role!=='vendedor'?`<button class="btn-s" onclick="finalizarConv('${id}')"><i class="ti ti-check"></i>Finalizar</button>`:''}
    </div>
    <div class="conv-msgs" id="conv-msgs">
      ${(msgs||[]).length?(msgs||[]).map(m=>msgBubble(m)).join(''):'<div style="text-align:center;color:var(--txt3);font-size:13px;padding:30px">Nenhuma mensagem ainda</div>'}
    </div>
    <div class="conv-input-wrap">
      <textarea class="conv-input" id="conv-input" rows="1" placeholder="Digite sua mensagem… (Enter para enviar)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendConvMsg()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
      <button class="conv-send" onclick="sendConvMsg()"><i class="ti ti-send"></i></button>
    </div>`;
  const msgsEl=document.getElementById('conv-msgs');
  if(msgsEl) msgsEl.scrollTop=msgsEl.scrollHeight;
}

function msgBubble(m) {
  const isOut=m.direction==='out';
  const time=m.created_at?new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
  return `<div class="msg-bubble ${isOut?'msg-out':'msg-in'}">
    ${isOut&&m.sent_by?`<div class="msg-sender">${m.sent_by}</div>`:''}
    <div>${m.content}</div><div class="msg-time">${time}</div>
  </div>`;
}

async function sendConvMsg() {
  const input=document.getElementById('conv-input');
  const content=(input?.value||'').trim(); if(!content||!_activeConvId) return;
  input.value=''; input.style.height='auto';
  const msg={id:uid(),conversation_id:_activeConvId,direction:'out',content,sent_by:CU.nome,created_at:new Date().toISOString()};
  const{error}=await sb.from('eye_messages').insert(msg);
  if(error){toast('Erro ao enviar','err');return;}
  await sb.from('eye_conversations').update({last_message:content,last_message_at:msg.created_at,status:'atendendo',assigned_to:CU.nome}).eq('id',_activeConvId);
  const msgsEl=document.getElementById('conv-msgs');
  if(msgsEl){msgsEl.insertAdjacentHTML('beforeend',msgBubble(msg));msgsEl.scrollTop=msgsEl.scrollHeight;}
  const conv=_convsCache.find(c=>c.id===_activeConvId);
  if(conv){conv.last_message=content;conv.last_message_at=msg.created_at;} drawConvList();
  if(conv?.phone){
    try{await fetch('https://imwlagfvqeexrvtiyasp.supabase.co/functions/v1/wpp-send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:conv.phone,message:content})});}
    catch(e){console.warn('WhatsApp send falhou:',e);}
  }
}

async function finalizarConv(id){
  if(!confirm('Finalizar esta conversa?')) return;
  await sb.from('eye_conversations').update({status:'finalizado'}).eq('id',id);
  _activeConvId=null; await loadConvList();
  document.getElementById('conv-right').innerHTML=`<div class="conv-empty-right"><i class="ti ti-check" style="font-size:44px;opacity:.2"></i><p style="font-size:13px;color:var(--txt3)">Conversa finalizada</p></div>`;
  toast('Conversa finalizada');
}

async function criarLeadDaConv(id){
  const conv=_convsCache.find(c=>c.id===id); if(!conv) return;
  await getUsers();
  const vnds=vendedores();
  document.getElementById('a-vnd').innerHTML=`<option value="">Selecione…</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  const today=new Date().toISOString().split('T')[0];
  document.getElementById('appt-modal-title').textContent='Criar lead da conversa';
  document.getElementById('appt-id').value='';
  document.getElementById('a-cli').value=conv.name||'';
  document.getElementById('a-tel').value=conv.phone||'';
  document.getElementById('a-data').value=today;
  document.getElementById('a-orig').value='WhatsApp Direto';
  document.getElementById('a-status').value='em_contato';
  document.getElementById('a-vnd').value='';
  ['a-hora','a-modelo','a-valor','a-obs','a-prox'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  document.getElementById('a-pgto').value='';
  document.getElementById('ov-appt').classList.add('on');
}

function startRealtimeConv(){
  if(_realtimeSub){try{sb.removeChannel(_realtimeSub);}catch(e){}}
  _realtimeSub=sb.channel('eye-conv-rt')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'eye_messages'},async payload=>{
      const msg=payload.new;
      if(msg.conversation_id===_activeConvId&&msg.direction==='in'){
        const msgsEl=document.getElementById('conv-msgs');
        if(msgsEl){msgsEl.insertAdjacentHTML('beforeend',msgBubble(msg));msgsEl.scrollTop=msgsEl.scrollHeight;}
      }
      await loadConvList();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'eye_conversations'},async()=>{await loadConvList();})
    .subscribe();
}
