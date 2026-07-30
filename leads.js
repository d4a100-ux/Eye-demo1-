// ─── BRIEFING SDR → VENDEDOR ──────────────────────────────────────────────────
let _pendingBriefing = null;

function _alertHours(a) {
  if (!a.em) return 0;
  const activeStatuses = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno'];
  if (!activeStatuses.includes(a.status)) return 0;
  return (Date.now() - new Date(a.em)) / 3600000;
}

// ─── APPT CARD ────────────────────────────────────────────────────────────────
function apptCard(a, opts = {}) {
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);
  const hasNeg = a.modelo || a.valor || a.pgto;
  const hasObs = a.obs || a.prox;
  const alertH = _alertHours(a);
  const alertCls = alertH >= 24 ? 'ac-alert-dead' : alertH >= 4 ? 'ac-alert-crit' : alertH >= 2 ? 'ac-alert-warn' : '';
  return `<div class="ac${alertCls?' '+alertCls:''}" style="--c:${sm.c}">
    <div class="ac-head">
      <div class="ac-av" style="background:${ac}">${initials(a.vnd)}</div>
      <div class="ac-info">
        <div class="ac-name">${esc(a.cli)}<span class="tag ${sm.cls}">${sm.l}</span>${alertH>=2?`<span class="ac-alert-badge">${alertH>=24?'🔴':'⚠'} Parado há ${Math.round(alertH)}h</span>`:''}</div>
        <div class="ac-sub">
          <span><i class="ti ti-calendar"></i>${fmtDate(a.data)}${a.hora?' · '+esc(a.hora):''}</span>
          <span><i class="ti ti-user"></i>${esc(a.vnd)||'—'}</span>
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${esc(a.orig)}</span>`:''}
          ${a.tel ?`<span><i class="ti ti-phone"></i>${esc(a.tel)}</span>` :''}
        </div>
      </div>
    </div>
    ${hasNeg?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${esc(a.modelo)}</div></div>`:''}
      ${a.valor ?`<div class="af"><div class="afl">Valor</div><div class="afv" style="color:var(--grn)">${esc(a.valor)}</div></div>`:''}
      ${a.pgto  ?`<div class="af"><div class="afl">Pagamento</div><div class="afv">${esc(a.pgto)}</div></div>`:''}
    </div>`:''}
    ${hasObs?`<div class="ac-neg">
      <div class="neg-lbl">Negociação</div>
      ${a.obs ?`<div>${esc(a.obs)}</div>`:''}
      ${a.prox?`<div class="next"><i class="ti ti-arrow-right" style="font-size:12px;vertical-align:-1px"></i> ${esc(a.prox)}</div>`:''}
    </div>`:''}
    ${opts.noActs?'':canEdit(a)?`<div class="ac-acts">
      <button class="btn-s p" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i>${CU.role==='vendedor'?'Atualizar':'Negociação'}</button>
      ${CU.role!=='vendedor'?`<button class="btn-s" onclick="openAppt('${a.id}')"><i class="ti ti-edit"></i>Editar</button>`:''}
      ${canDelete()?`<button class="btn-s d" onclick="delAppt('${a.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div>`:''}
  </div>`;
}

// ─── AGENDA ───────────────────────────────────────────────────────────────────
async function renderAgenda() {
  const el = document.getElementById('v-agenda');
  loading(el);
  let appts = await getAppts();
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv" style="color:var(--ind2)">${appts.length}</div><div class="sl">Total</div></div>
      <div class="stat-c"><div class="sv">${appts.filter(a=>a.status==='agendado').length}</div><div class="sl">Agendados</div></div>
      <div class="stat-c"><div class="sv" style="color:#FF9F0A">${appts.filter(a=>a.status==='passado_vendedor').length}</div><div class="sl">Com vendedor</div></div>
      <div class="stat-c"><div class="sv" style="color:#34C759">${appts.filter(a=>a.status==='venda_concluida').length}</div><div class="sl">Vendas</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--red)">${appts.filter(a=>a.status==='perdido').length}</div><div class="sl">Perdidos</div></div>
    </div>
    <div class="filters">
      <input class="fi fi-search" id="ag-q" placeholder="Buscar cliente, modelo…" oninput="_filterAgenda()">
      <select class="fi fi-sel" id="ag-st" onchange="_filterAgenda()">
        <option value="">Todos os status</option>
        ${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v.l}</option>`).join('')}
      </select>
      ${CU.role!=='vendedor'?`<select class="fi fi-sel" id="ag-vnd" onchange="_filterAgenda()">
        <option value="">Todos os vendedores</option>
        ${vendedores().map(v=>`<option>${v.nome}</option>`).join('')}
      </select>`:''}
      <select class="fi fi-sel" id="ag-orig" onchange="_filterAgenda()">
        <option value="">Todas as origens</option>
        ${Object.keys(activeOrigins()).map(o=>`<option>${o}</option>`).join('')}
      </select>
      <button class="btn-s" onclick="exportCSV()" style="white-space:nowrap"><i class="ti ti-table-export"></i>Exportar CSV</button>
    </div>
    <div id="ag-list"></div>`;
  _filterAgenda();
}

function _filterAgenda() {
  let appts = [..._apptsCache];
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const q    = (document.getElementById('ag-q')?.value   ||'').toLowerCase();
  const st   =  document.getElementById('ag-st')?.value  ||'';
  const vnd  =  document.getElementById('ag-vnd')?.value ||'';
  const orig =  document.getElementById('ag-orig')?.value||'';
  if (q)    appts = appts.filter(a => (a.cli+a.vnd+(a.modelo||'')).toLowerCase().includes(q));
  if (st)   appts = appts.filter(a => a.status===st);
  if (vnd)  appts = appts.filter(a => a.vnd===vnd);
  if (orig) appts = appts.filter(a => a.orig===orig);
  const el = document.getElementById('ag-list');
  if (!appts.length) { el.innerHTML=`<div class="empty-st"><i class="ti ti-calendar-off"></i><p>Nenhum agendamento encontrado.<br>Clique em "Novo lead" para criar o primeiro.</p></div>`; return; }
  appts.sort((a,b) => (a.data+a.hora)<(b.data+b.hora)?-1:1);
  const byDate = {};
  appts.forEach(a => { if (!byDate[a.data]) byDate[a.data]=[]; byDate[a.data].push(a); });
  el.innerHTML = Object.entries(byDate).map(([d,arr])=>`
    <div class="sec-lbl" style="margin-top:18px">${fmtDate(d)}<span>${arr.length} agendamento${arr.length!==1?'s':''}</span></div>
    <div style="display:flex;flex-direction:column;gap:8px">${arr.map(a=>agendaCard(a)).join('')}</div>`).join('');
}

function agendaQuickActs(a) {
  const st = a.status;
  const acts = [];
  if (st === 'agendado') {
    acts.push(`<button class="ag-qa-btn g" onclick="agQa('${a.id}','passado_vendedor')"><i class="ti ti-check"></i> Confirmou</button>`);
    acts.push(`<button class="ag-qa-btn r" onclick="agQa('${a.id}','perdido')"><i class="ti ti-x"></i> Cancelou</button>`);
    acts.push(`<button class="ag-qa-btn a" onclick="openNeg('${a.id}')"><i class="ti ti-calendar-event"></i> Reagendar</button>`);
  } else if (st === 'passado_vendedor') {
    acts.push(`<button class="ag-qa-btn g" onclick="agQa('${a.id}','em_negociacao')"><i class="ti ti-user-check"></i> Cliente chegou</button>`);
    acts.push(`<button class="ag-qa-btn r" onclick="agQa('${a.id}','lead_frio')"><i class="ti ti-user-off"></i> Não compareceu</button>`);
  } else if (st === 'em_negociacao' || st === 'test_drive') {
    acts.push(`<button class="ag-qa-btn g" onclick="agQa('${a.id}','venda_concluida')"><i class="ti ti-trophy"></i> Venda feita!</button>`);
    acts.push(`<button class="ag-qa-btn a" onclick="agQa('${a.id}','ag_retorno')"><i class="ti ti-clock"></i> Ag. retorno</button>`);
  } else if (st === 'pendente' || st === 'em_atendimento') {
    acts.push(`<button class="ag-qa-btn g" onclick="agQa('${a.id}','qualificado')"><i class="ti ti-check"></i> Qualificado</button>`);
    acts.push(`<button class="ag-qa-btn a" onclick="agQa('${a.id}','agendado')"><i class="ti ti-calendar-plus"></i> Agendar</button>`);
    acts.push(`<button class="ag-qa-btn r" onclick="agQa('${a.id}','sem_resposta')"><i class="ti ti-phone-off"></i> Sem resposta</button>`);
  }
  acts.push(`<button class="ag-qa-btn b" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i> Editar</button>`);
  return acts.join('');
}

function agendaCard(a) {
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);
  return `<div class="ag-card" style="--c:${sm.c}">
    <div class="ag-card-top">
      <div class="ac-av" style="background:${ac};width:36px;height:36px;font-size:12px;flex:none">${initials(a.vnd)}</div>
      <div class="ag-card-info">
        <div class="ag-card-name">${esc(a.cli)}<span class="tag ${sm.cls}">${sm.l}</span></div>
        <div class="ag-card-sub">
          ${a.hora?`<span><i class="ti ti-clock"></i>${a.hora}</span>`:''}
          <span><i class="ti ti-user"></i>${esc(a.vnd||'—')}</span>
          ${a.tel?`<span><i class="ti ti-phone"></i>${esc(a.tel)}</span>`:''}
          ${a.modelo?`<span><i class="ti ti-car"></i>${esc(a.modelo)}</span>`:''}
        </div>
      </div>
      <button class="btn-s" style="flex:none" onclick="openLeadTimeline('${a.id}')"><i class="ti ti-timeline"></i></button>
    </div>
    <div class="ag-quick-acts">${agendaQuickActs(a)}</div>
  </div>`;
}

async function agQa(id, newStatus) {
  const a = _apptsCache.find(x => x.id === id);
  if (!a) return;
  const old = a.status;
  const now = new Date().toISOString();
  a.status = newStatus; a.em = now;
  _filterAgenda();
  const { error } = await sb.from('eye_appts').update({ status: newStatus, em: now }).eq('id', id);
  if (error) { toast('Erro ao atualizar', 'err'); a.status = old; _filterAgenda(); return; }
  if (old !== newStatus) await logStatus(id, old, newStatus);
  toast('Status atualizado!');
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth(), calSelDay = null;

async function renderCal() {
  const el = document.getElementById('v-cal');
  loading(el);
  await getAppts();
  el.innerHTML = `<div class="cal-wrap"><div class="cal-box" id="cal-grid-box"></div><div class="cal-detail" id="cal-detail-box"></div></div>`;
  drawCalGrid();
  const today = new Date();
  calSelDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  drawCalDetail(calSelDay);
}

function drawCalGrid() {
  const filtered = CU.role==='vendedor' ? _apptsCache.filter(a=>a.vnd===CU.nome) : _apptsCache;
  const agendByDay={}, leadsDay={};
  filtered.forEach(a => {
    if (['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)) agendByDay[a.data]=(agendByDay[a.data]||0)+1;
    if (['pendente','em_atendimento','qualificado','sem_resposta'].includes(a.status)) leadsDay[a.data]=(leadsDay[a.data]||0)+1;
  });
  const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const firstDay=new Date(calYear,calMonth,1).getDay(), daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  let cells='';
  for(let i=0;i<firstDay;i++) cells+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=ds===todayStr, isSel=ds===calSelDay;
    const agCnt=agendByDay[ds]||0, ldCnt=leadsDay[ds]||0;
    const badges=(agCnt||ldCnt)?`<div class="cal-badges">
      ${agCnt?`<span class="cal-badge ${isSel?'cb-ag-sel':'cb-ag'}">${agCnt}</span>`:''}
      ${ldCnt?`<span class="cal-badge ${isSel?'cb-ld-sel':'cb-ld'}">${ldCnt}</span>`:''}
    </div>`:'';
    cells+=`<div class="cal-day${isToday?' today':''}${isSel?' sel':''}" onclick="selectCalDay('${ds}')">${d}${badges}</div>`;
  }
  document.getElementById('cal-grid-box').innerHTML=`
    <div class="cal-header">
      <button class="cal-nav-btn" onclick="calNav(-1)"><i class="ti ti-chevron-left"></i></button>
      <h3>${months[calMonth]} ${calYear}</h3>
      <button class="cal-nav-btn" onclick="calNav(1)"><i class="ti ti-chevron-right"></i></button>
    </div>
    <div class="cal-dow"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="cal-grid">${cells}</div>`;
}

function calNav(dir) {
  calMonth+=dir;
  if(calMonth>11){calMonth=0;calYear++;}
  if(calMonth<0) {calMonth=11;calYear--;}
  drawCalGrid();
}
function selectCalDay(ds){calSelDay=ds;drawCalGrid();drawCalDetail(ds);}

function drawCalDetail(ds) {
  let appts=_apptsCache.filter(a=>a.data===ds);
  if(CU.role==='vendedor') appts=appts.filter(a=>a.vnd===CU.nome);
  appts.sort((a,b)=>a.hora<b.hora?-1:1);
  const [y,m,d]=ds.split('-');
  document.getElementById('cal-detail-box').innerHTML=`
    <div class="cal-detail-head">${d}/${m}/${y} · ${appts.length} agendamento${appts.length!==1?'s':''}</div>
    <div class="cal-detail-body">
      ${appts.length?appts.map(a=>{
        const sm=fmtStatus(a.status);
        return `<div class="cal-appt-mini" style="--c:${sm.c}" onclick="openNeg('${a.id}')">
          <div class="cam-time">${a.hora||'—'} · <span class="tag ${sm.cls}" style="font-size:10px">${sm.l}</span></div>
          <div class="cam-name">${a.cli}</div>
          <div class="cam-sub"><span style="color:${userColor(a.vnd)};font-weight:600">${a.vnd}</span>${a.modelo?' · '+a.modelo:''}</div>
        </div>`;
      }).join(''):`<div class="cal-empty"><i class="ti ti-calendar-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>Sem agendamentos neste dia</div>`}
    </div>`;
}

// ─── ORIGENS ──────────────────────────────────────────────────────────────────
async function renderOrigem() {
  const el=document.getElementById('v-origem');
  loading(el);
  let appts=await getAppts();
  if(CU.role==='vendedor') appts=appts.filter(a=>a.vnd===CU.nome);
  const total=appts.length||1, orgs=activeOrigins();
  const grid=Object.keys(orgs).map(o=>{
    const c=appts.filter(a=>a.orig===o).length, pct=Math.round(c/total*100);
    return `<div class="origin-c"><div class="oi">${orgs[o]}</div><div class="on2">${o}</div><div class="ov">${c}</div><div class="obar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const byOrig={};
  appts.forEach(a=>{const k=a.orig||'Outros';if(!byOrig[k])byOrig[k]=[];byOrig[k].push(a);});
  el.innerHTML=`<div class="origin-grid">${grid}</div>${Object.entries(byOrig).map(([o,arr])=>`
    <div class="sec-lbl" style="margin-top:18px">${orgs[o]||'📌'} ${o}<span>${arr.length}</span></div>
    <div class="appt-list">${arr.map(a=>apptCard(a,{noActs:true})).join('')}</div>`).join('')}`;
}

// ─── PIPELINE (negociações) ───────────────────────────────────────────────────
async function renderNegoc() {
  const el = document.getElementById('v-negoc');
  loading(el);
  let appts = await getAppts();
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const active = appts.filter(a => ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno'].includes(a.status));
  const totalVal = active.reduce((s,a)=>{const n=parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));return s+(isNaN(n)?0:n);},0);
  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv">${active.length}</div><div class="sl">Leads ativos</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--grn)">R$${Math.round(totalVal).toLocaleString('pt-BR')}</div><div class="sl">Potencial</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--amb)">${active.filter(a=>a.pgto==='À vista').length}</div><div class="sl">À vista</div></div>
      <div class="stat-c"><div class="sv">${active.filter(a=>(a.pgto||'').toLowerCase().includes('financ')).length}</div><div class="sl">Financiamento</div></div>
    </div>
    <div class="sec-lbl">Leads em andamento<span>Clique em "Histórico" para ver todos os movimentos</span></div>
    ${active.length
      ? `<div class="appt-list">${active.sort((a,b)=>(a.em||'')<(b.em||'')?1:-1).map(pipelineCard).join('')}</div>`
      : `<div class="empty-st"><i class="ti ti-handshake"></i><p>Nenhum lead ativo no pipeline.</p></div>`}`;
}

function pipelineCard(a) {
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);
  const lastUpd = a.em ? fmtLogTime(a.em) : '—';
  return `<div class="ac" style="--c:${sm.c}">
    <div class="ac-head">
      <div class="ac-av" style="background:${ac}">${initials(a.vnd)}</div>
      <div class="ac-info">
        <div class="ac-name">${esc(a.cli)}<span class="tag ${sm.cls}">${sm.l}</span></div>
        <div class="ac-sub">
          <span><i class="ti ti-user"></i>${esc(a.vnd)}</span>
          ${a.tel?`<span><i class="ti ti-phone"></i>${esc(a.tel)}</span>`:''}
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${esc(a.orig)}</span>`:''}
        </div>
      </div>
    </div>
    ${a.modelo||a.valor?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${esc(a.modelo)}</div></div>`:''}
      ${a.valor?`<div class="af"><div class="afl">Valor</div><div class="afv" style="color:var(--grn)">${esc(a.valor)}</div></div>`:''}
      ${a.pgto?`<div class="af"><div class="afl">Pagamento</div><div class="afv">${esc(a.pgto)}</div></div>`:''}
    </div>`:''}
    ${a.obs?`<div class="ac-neg"><div class="neg-lbl">Negociação</div><div>${esc(a.obs)}</div>${a.prox?`<div class="next"><i class="ti ti-arrow-right" style="font-size:12px;vertical-align:-1px"></i> ${esc(a.prox)}</div>`:''}</div>`:''}
    <div class="ac-acts" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--txt3)"><i class="ti ti-clock" style="vertical-align:-1px"></i> ${lastUpd}</span>
      <div style="display:flex;gap:6px">
        <button class="btn-s" onclick="openLeadTimeline('${a.id}')"><i class="ti ti-timeline"></i>Histórico</button>
        <button class="btn-s p" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i>Atualizar</button>
      </div>
    </div>
  </div>`;
}

// ─── TIMELINE DE LEAD ─────────────────────────────────────────────────────────
async function openLeadTimeline(id) {
  const a = _apptsCache.find(x => x.id === id);
  if (!a) return;
  const [logs, comments, briefing] = await Promise.all([loadApptLogs(id), loadComments(id), getBriefing(id)]);
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);

  const events = [
    ...logs.map(l => ({ type:'status',   ts:l.created_at, user:l.user_nome, de:l.de_status, para:l.para_status })),
    ...comments.map(c => ({ type:'comment', ts:c.created_at, user:c.user_nome, texto:c.texto })),
    ...(briefing ? [{ type:'briefing', ts:briefing.criado_em, data:briefing }] : [])
  ].sort((a,b) => a.ts < b.ts ? -1 : 1);

  const titleEl = document.getElementById('tl-title');
  titleEl.style.cssText = 'font-size:22px;font-weight:800;color:var(--txt);letter-spacing:-.5px;line-height:1.1';
  titleEl.textContent = a.cli;
  document.getElementById('tl-status').innerHTML = `<span class="tag ${sm.cls}" style="margin-top:6px;display:inline-block">${sm.l}</span>`;
  document.getElementById('tl-info').innerHTML = `
    <div style="background:rgba(255,255,255,.45);border:.5px solid rgba(255,255,255,.7);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${a.modelo||a.valor?'12':'0'}px">
        <div class="ac-av" style="background:${ac};width:38px;height:38px;font-size:13px;flex:none">${initials(a.vnd)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--txt2);display:flex;gap:8px;flex-wrap:wrap">
            ${[a.vnd,a.tel,a.orig].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('<span style="color:var(--txt3)">·</span>')}
          </div>
        </div>
      </div>
      ${a.modelo||a.valor?`<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:.5px solid rgba(60,60,67,.08)">
        ${a.modelo?`<div style="flex:1;min-width:80px"><div style="font-size:9px;color:var(--txt3);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Modelo</div><div style="font-size:13px;font-weight:600;color:var(--txt)">${esc(a.modelo)}</div></div>`:''}
        ${a.valor?`<div style="flex:1;min-width:80px"><div style="font-size:9px;color:var(--txt3);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Valor</div><div style="font-size:13px;font-weight:700;color:var(--grn)">${esc(a.valor)}</div></div>`:''}
        ${a.pgto?`<div style="flex:1;min-width:80px"><div style="font-size:9px;color:var(--txt3);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Pagamento</div><div style="font-size:13px;font-weight:600;color:var(--txt)">${esc(a.pgto)}</div></div>`:''}
      </div>`:''}
    </div>`;

  drawJourney(a.status, logs, document.getElementById('tl-journey'));

  const _timeAgo = ts => {
    const m = Math.floor((Date.now() - new Date(ts)) / 60000);
    if (m < 1) return 'agora mesmo';
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return d < 30 ? `há ${d} dia${d > 1 ? 's' : ''}` : fmtLogTime(ts);
  };

  document.getElementById('tl-timeline').innerHTML = events.length
    ? `<div class="tl-list">${events.map((ev, idx) => {
        const isLast = idx === events.length - 1;
        const connector = isLast ? '' : '<div class="tl-connector-v"></div>';
        if (ev.type === 'status') {
          const from = fmtStatus(ev.de), to = fmtStatus(ev.para);
          return `<div class="tl-item-v2">
            <div class="tl-item-left">
              <div class="tl-dot-v2" style="background:${to.c}"><i class="ti ti-arrow-right" style="font-size:9px;color:#fff"></i></div>
              ${connector}
            </div>
            <div class="tl-body-v2">
              <div class="tl-user-v2">${esc(ev.user)}</div>
              <div class="tl-text-v2" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                <span class="tag ${from.cls}" style="font-size:10px">${from.l}</span>
                <i class="ti ti-chevron-right" style="font-size:10px;color:var(--txt3)"></i>
                <span class="tag ${to.cls}" style="font-size:10px">${to.l}</span>
              </div>
              <div class="tl-time-v2"><i class="ti ti-clock" style="font-size:9px"></i>${_timeAgo(ev.ts)}</div>
            </div>
          </div>`;
        } else if (ev.type === 'briefing') {
          const b = ev.data;
          const urgLabels = {essa_semana:'Essa semana',esse_mes:'Esse mês',sem_prazo:'Sem prazo'};
          const objLabels = {preco:'Preço',pagamento:'Condição de pagamento',modelo:'Modelo',pesquisando:'Ainda pesquisando',nenhuma:'Nenhuma'};
          return `<div class="tl-item-v2">
            <div class="tl-item-left">
              <div class="tl-dot-v2" style="background:#FF9F0A"><i class="ti ti-clipboard" style="font-size:9px;color:#fff"></i></div>
              ${connector}
            </div>
            <div class="tl-body-v2">
              <div class="tl-user-v2">${esc(b.criado_por)}</div>
              <div class="tl-briefing-card">
                <div class="tbf-title"><i class="ti ti-clipboard-list"></i> Briefing — passagem ao vendedor</div>
                <div class="tl-br-row"><span class="tbr-label">Veículo</span><span class="tbr-val">${esc(b.veiculo)||'—'}</span></div>
                <div class="tl-br-row"><span class="tbr-label">Entrada</span><span class="tbr-val">${esc(b.entrada)||'Não informado'}</span></div>
                <div class="tl-br-row"><span class="tbr-label">Troca</span><span class="tbr-val">${b.troca?('Sim — '+esc(b.troca_detalhe||'n/i')):'Não'}</span></div>
                <div class="tl-br-row"><span class="tbr-label">Pagamento</span><span class="tbr-val">${esc(b.pagamento)||'—'}</span></div>
                <div class="tl-br-row"><span class="tbr-label">Urgência</span><span class="tbr-val">${esc(urgLabels[b.urgencia]||b.urgencia||'—')}</span></div>
                <div class="tl-br-row"><span class="tbr-label">Objeção</span><span class="tbr-val">${esc(objLabels[b.objecao]||b.objecao||'—')}</span></div>
                ${b.resumo?`<div style="margin-top:7px;padding-top:7px;border-top:.5px solid rgba(91,110,255,.15);font-style:italic;font-size:12px;color:var(--txt2)">${esc(b.resumo)}</div>`:''}
              </div>
              <div class="tl-time-v2"><i class="ti ti-clock" style="font-size:9px"></i>${_timeAgo(ev.ts)}</div>
            </div>
          </div>`;
        } else {
          return `<div class="tl-item-v2">
            <div class="tl-item-left">
              <div class="tl-dot-v2" style="background:var(--ind)"><i class="ti ti-message" style="font-size:9px;color:#fff"></i></div>
              ${connector}
            </div>
            <div class="tl-body-v2">
              <div class="tl-user-v2">${esc(ev.user)}</div>
              <div class="tl-text-v2">${esc(ev.texto)}</div>
              <div class="tl-time-v2"><i class="ti ti-clock" style="font-size:9px"></i>${_timeAgo(ev.ts)}</div>
            </div>
          </div>`;
        }
      }).join('')}</div>`
    : `<div class="tl-empty-state">
        <div class="tl-es-icon"><i class="ti ti-clock"></i></div>
        <div class="tl-es-title">Sem histórico ainda</div>
        <div class="tl-es-sub">Adicione o primeiro registro desta negociação no campo abaixo</div>
      </div>`;

  document.getElementById('tl-appt-id').value = id;
  document.getElementById('ov-timeline').classList.add('on');
}

function closeTimeline() { document.getElementById('ov-timeline').classList.remove('on'); }

async function addTlComment() {
  const id = document.getElementById('tl-appt-id').value;
  const input = document.getElementById('tl-comment-input');
  const texto = (input?.value || '').trim();
  if (!texto || !id) return;
  input.value = '';
  const { error } = await sb.from('eye_comments').insert({ id:uid(), appt_id:id, user_nome:CU.nome, texto, created_at:new Date().toISOString() });
  if (error) { toast('Erro ao salvar', 'err'); return; }
  toast('Comentário adicionado');
  await openLeadTimeline(id);
}

// ─── MODAL NOVO LEAD ──────────────────────────────────────────────────────────
function openLead() {
  ['l-tel','l-cli'].forEach(i=>{document.getElementById(i).value='';});
  document.getElementById('l-orig').value='';
  document.getElementById('ov-lead').classList.add('on');
  setTimeout(()=>document.getElementById('l-tel').focus(),100);
}
function closeLead(){document.getElementById('ov-lead').classList.remove('on');}

async function saveLead() {
  const tel=document.getElementById('l-tel').value.trim(), orig=document.getElementById('l-orig').value;
  if(!tel||!orig){toast('Preencha telefone e origem','err');return;}
  const telNum=tel.replace(/\D/g,'');
  const dup=_apptsCache.find(a=>a.tel&&a.tel.replace(/\D/g,'')===telNum);
  if(dup&&!confirm(`⚠️ Telefone já existe na base (${dup.cli}). Criar mesmo assim?`)) return;
  const cli=document.getElementById('l-cli').value.trim()||tel;
  const today=new Date().toISOString().split('T')[0];
  const now=new Date().toISOString();
  const obj=withUnit({id:uid(),cli,tel,orig,status:'pendente',data:today,criado_por:CU.login,em:now,criado_em:now});
  const{error}=await sb.from('eye_appts').insert(obj);
  if(error){toast('Erro ao criar lead. Tente novamente.','err');return;}
  closeLead(); toast('Lead criado!'); await refreshAll();
}

// ─── MODAL AGENDAMENTO ────────────────────────────────────────────────────────
async function openAppt(id) {
  await getUsers();
  const vnds=vendedores();
  document.getElementById('a-vnd').innerHTML=`<option value="">Selecione…</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  const today=new Date().toISOString().split('T')[0];
  if(id){
    const a=_apptsCache.find(x=>x.id===id);if(!a)return;
    document.getElementById('appt-modal-title').textContent='Editar agendamento';
    document.getElementById('appt-id').value=a.id;
    document.getElementById('a-cli').value=a.cli||'';
    document.getElementById('a-tel').value=a.tel||'';
    document.getElementById('a-data').value=a.data||today;
    document.getElementById('a-hora').value=a.hora||'';
    document.getElementById('a-vnd').value=a.vnd||'';
    document.getElementById('a-orig').value=a.orig||'';
    document.getElementById('a-status').value=a.status||'pendente';
    document.getElementById('a-modelo').value=a.modelo||'';
    document.getElementById('a-valor').value=a.valor||'';
    document.getElementById('a-pgto').value=a.pgto||'';
    document.getElementById('a-obs').value=a.obs||'';
    document.getElementById('a-prox').value=a.prox||'';
    const[logs,comments]=await Promise.all([loadApptLogs(a.id),loadComments(a.id)]);
    drawComments(a.id,comments); drawJourney(a.status,logs);
    const histEl=document.getElementById('appt-history');
    if(histEl) histEl.innerHTML=logs.length?`<div class="sec-divider">Histórico</div><div style="display:flex;flex-direction:column;gap:5px">
      ${logs.map(l=>`<div style="font-size:12px;color:var(--txt2);display:flex;gap:8px;align-items:center">
        <span style="color:var(--txt3);font-size:11px;flex:none">${fmtLogTime(l.created_at)}</span>
        <span style="font-weight:600;color:var(--txt)">${l.user_nome}</span><span>→</span>
        <span class="tag ${fmtStatus(l.para_status).cls}">${fmtStatus(l.para_status).l}</span>
      </div>`).join('')}</div>`:'';
  } else {
    document.getElementById('appt-modal-title').textContent='Novo lead / agendamento';
    document.getElementById('appt-id').value='';
    ['a-cli','a-tel','a-hora','a-modelo','a-valor','a-obs','a-prox'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('a-data').value=today;
    document.getElementById('a-vnd').value=CU.role==='vendedor'?CU.nome:'';
    document.getElementById('a-orig').value='';
    document.getElementById('a-status').value='agendado';
    document.getElementById('a-pgto').value='';
    ['appt-history','appt-comments','appt-journey'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
  }
  document.getElementById('ov-appt').classList.add('on');
}
function closeAppt(){document.getElementById('ov-appt').classList.remove('on');}

async function saveAppt() {
  const cli=document.getElementById('a-cli').value.trim(), data=document.getElementById('a-data').value;
  const vnd=document.getElementById('a-vnd').value,       orig=document.getElementById('a-orig').value;
  if(!cli||!data||!vnd||!orig){toast('Preencha: cliente, data, vendedor e origem','err');return;}
  const eid=document.getElementById('appt-id').value;
  if(!eid){
    const telV=document.getElementById('a-tel').value.trim();
    if(telV){const dup=_apptsCache.find(a=>a.tel&&a.tel.replace(/\D/g,'')=== telV.replace(/\D/g,''));
      if(dup&&!confirm(`⚠️ Telefone já existe na base (${dup.cli}). Criar mesmo assim?`)) return;}
  }
  const nowTs=new Date().toISOString();
  const obj=withUnit({id:eid||uid(),cli,data,tel:document.getElementById('a-tel').value.trim(),hora:document.getElementById('a-hora').value,
    vnd,orig,status:document.getElementById('a-status').value||'agendado',modelo:document.getElementById('a-modelo').value.trim(),
    valor:document.getElementById('a-valor').value.trim(),pgto:document.getElementById('a-pgto').value,
    obs:document.getElementById('a-obs').value.trim(),prox:document.getElementById('a-prox').value.trim(),
    criado_por:CU.login,em:nowTs,...(!eid&&{criado_em:nowTs})});
  let error;
  if(eid){({error}=await sb.from('eye_appts').update(obj).eq('id',eid));}
  else   {({error}=await sb.from('eye_appts').insert(obj));}
  if(error){toast('Erro ao salvar. Tente novamente.','err');return;}
  closeAppt(); toast(eid?'Agendamento atualizado':'Lead criado com sucesso'); await refreshAll();
}

// ─── MODAL NEGOCIAÇÃO ─────────────────────────────────────────────────────────
async function openNeg(id){
  const a=_apptsCache.find(x=>x.id===id);if(!a)return;
  const _negTitleEl = document.getElementById('neg-modal-title');
  _negTitleEl.innerHTML = `<span style="font-size:20px;font-weight:800;letter-spacing:-.4px;display:block;line-height:1.1;color:var(--txt)">${esc(a.cli)}</span>`;
  document.getElementById('neg-id').value=id;
  document.getElementById('n-status').value=a.status||'pendente';
  // Mostrar datas de chegada e agendamento
  const chegEl=document.getElementById('n-criado-em');
  if(chegEl) chegEl.textContent=(a.criado_em?fmtDate(a.criado_em.split('T')[0]):a.data?fmtDate(a.data):'—');
  const dataEl=document.getElementById('n-data-disp');
  if(dataEl) dataEl.textContent=a.data?fmtDate(a.data):'—';
  document.getElementById('n-modelo').value=a.modelo||'';
  document.getElementById('n-valor').value=a.valor||'';
  document.getElementById('n-pgto').value=a.pgto||'';
  document.getElementById('n-obs').value=a.obs||'';
  document.getElementById('n-prox').value=a.prox||'';

  // Campos completos para quem pode editar
  const full = canEdit(a);
  const block = document.getElementById('neg-lead-fields');
  if(block) block.style.display = full ? 'block' : 'none';
  if(full){
    document.getElementById('n-cli').value  = a.cli||'';
    document.getElementById('n-tel').value  = a.tel||'';
    document.getElementById('n-data').value = a.data||'';
    document.getElementById('n-hora').value = a.hora||'';
    await getUsers();
    const vnds = vendedores();
    document.getElementById('n-vnd').innerHTML = `<option value="">Selecione…</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
    document.getElementById('n-vnd').value  = a.vnd||'';
    const orgs = activeOrigins();
    document.getElementById('n-orig').innerHTML = `<option value="">Selecione…</option>${Object.entries(orgs).map(([n,e])=>`<option value="${n}">${e} ${n}</option>`).join('')}`;
    document.getElementById('n-orig').value = a.orig||'';
    const ativs = await getAtivos();
    document.getElementById('n-ativo').innerHTML = `<option value="">Sem ativo vinculado</option>${ativs.map(at=>`<option value="${at.id}">${at.nome}${at.placa?' · '+at.placa:''}</option>`).join('')}`;
    document.getElementById('n-ativo').value = a.ativo_id||'';
    const troca = document.getElementById('n-troca');
    if (troca) troca.value = a.troca||'';
  }
  // Ações rápidas contextuais no modal
  const qaEl=document.getElementById('neg-quick-acts');
  if(qaEl) qaEl.innerHTML=_negQuickActs(a);

  document.getElementById('ov-neg').classList.add('on');
}
function closeNeg(){document.getElementById('ov-neg').classList.remove('on');}

function _negQuickActs(a){
  const st=a.status, id=a.id;
  const acts=[];
  if(st==='pendente'||st==='sem_resposta'){
    acts.push(`<button class="nq-btn b" onclick="negQa('${id}','em_atendimento')"><i class="ti ti-phone"></i> Em atendimento</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','sem_resposta')"><i class="ti ti-phone-off"></i> Sem resposta</button>`);
  } else if(st==='em_atendimento'){
    acts.push(`<button class="nq-btn b" onclick="negQa('${id}','qualificado')"><i class="ti ti-check"></i> Qualificado</button>`);
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','agendado')"><i class="ti ti-calendar-plus"></i> Agendar visita</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','sem_resposta')"><i class="ti ti-phone-off"></i> Sem resposta</button>`);
  } else if(st==='qualificado'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','agendado')"><i class="ti ti-calendar-plus"></i> Agendar visita</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','sem_resposta')"><i class="ti ti-phone-off"></i> Sem resposta</button>`);
  } else if(st==='agendado'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','passado_vendedor')"><i class="ti ti-check"></i> Cliente confirmou</button>`);
    acts.push(`<button class="nq-btn r" onclick="negQa('${id}','sem_resposta')"><i class="ti ti-x"></i> Cancelou</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','agendado')"><i class="ti ti-calendar"></i> Reagendar</button>`);
  } else if(st==='passado_vendedor'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','em_negociacao')"><i class="ti ti-users"></i> Cliente chegou</button>`);
    acts.push(`<button class="nq-btn r" onclick="negQa('${id}','sem_resposta')"><i class="ti ti-calendar-cancel"></i> Não compareceu</button>`);
  } else if(st==='em_negociacao'||st==='test_drive'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','ficha_enviada')"><i class="ti ti-file-text"></i> Ficha enviada</button>`);
    acts.push(`<button class="nq-btn v" onclick="negQa('${id}','test_drive')"><i class="ti ti-car"></i> Test drive</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','ag_retorno')"><i class="ti ti-clock"></i> Ag. retorno</button>`);
  } else if(st==='ficha_enviada'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','credito_aprovado')"><i class="ti ti-check"></i> Crédito aprovado</button>`);
    acts.push(`<button class="nq-btn r" onclick="negQa('${id}','credito_reprovado')"><i class="ti ti-x"></i> Crédito reprovado</button>`);
  } else if(st==='credito_aprovado'){
    acts.push(`<button class="nq-btn g" onclick="negQa('${id}','venda_concluida')"><i class="ti ti-trophy"></i> Venda fechada!</button>`);
    acts.push(`<button class="nq-btn a" onclick="negQa('${id}','ag_retorno')"><i class="ti ti-clock"></i> Ag. retorno</button>`);
  } else if(st==='ag_retorno'){
    acts.push(`<button class="nq-btn b" onclick="negQa('${id}','em_negociacao')"><i class="ti ti-refresh"></i> Retomou negoc.</button>`);
    acts.push(`<button class="nq-btn r" onclick="negQa('${id}','perdido')"><i class="ti ti-trash"></i> Perdido</button>`);
  }
  if(!acts.length) return '';
  return `<div class="neg-qa-wrap"><div class="neg-qa-title">Ação rápida</div><div class="neg-qa-btns">${acts.join('')}</div></div>`;
}

async function negQa(id, newStatus){
  const a=_apptsCache.find(x=>x.id===id); if(!a) return;
  const oldStatus=a.status;
  if(newStatus==='passado_vendedor'){
    _pendingBriefing={source:'neg',apptId:id,upd:{status:newStatus,em:new Date().toISOString()},oldStatus};
    openBriefingModal(id); return;
  }
  const now=new Date().toISOString();
  const{error}=await sb.from('eye_appts').update({status:newStatus,em:now}).eq('id',id);
  if(error){toast('Erro ao atualizar','err');return;}
  if(oldStatus!==newStatus) await logStatus(id,oldStatus,newStatus);
  a.status=newStatus; a.em=now;
  closeNeg(); toast('Status atualizado'); await refreshAll();
}

async function saveNeg(){
  const id=document.getElementById('neg-id').value, newStatus=document.getElementById('n-status').value;
  const a=_apptsCache.find(x=>x.id===id);

  // Coleta todos os campos do formulário antes de qualquer desvio de fluxo
  const upd={status:newStatus,em:new Date().toISOString(),modelo:document.getElementById('n-modelo').value.trim(),valor:document.getElementById('n-valor').value.trim(),
    pgto:document.getElementById('n-pgto').value,obs:document.getElementById('n-obs').value.trim(),prox:document.getElementById('n-prox').value.trim()};
  if(canEdit(a)){
    const cli=document.getElementById('n-cli')?.value.trim();
    if(cli) upd.cli=cli;
    upd.tel      = document.getElementById('n-tel')?.value.trim()||a?.tel||'';
    upd.data     = document.getElementById('n-data')?.value||a?.data||'';
    upd.hora     = document.getElementById('n-hora')?.value||'';
    upd.vnd      = document.getElementById('n-vnd')?.value||a?.vnd||'';
    upd.orig     = document.getElementById('n-orig')?.value||a?.orig||'';
    upd.ativo_id = document.getElementById('n-ativo')?.value||null;
    upd.troca    = document.getElementById('n-troca')?.value.trim()||'';
  }

  // Passado ao vendedor → briefing obrigatório antes de salvar
  if(newStatus==='passado_vendedor'){
    if(!upd.vnd&&!a?.vnd){toast('Selecione o vendedor antes de passar','err');return;}
    _pendingBriefing={source:'neg',apptId:id,upd,oldStatus:a?.status};
    openBriefingModal(id);
    return;
  }

  // Validação normal para outros status
  if(a){
    const merged={...a,...upd};
    const missing=checkGate(merged,newStatus);
    if(missing){toast('Para registrar preencha: '+missing.join(', '),'err');return;}
  }

  const oldStatus=a?.status;
  const{error}=await sb.from('eye_appts').update(upd).eq('id',id);
  if(error){toast('Erro ao salvar. Tente novamente.','err');return;}
  if(oldStatus&&oldStatus!==newStatus) await logStatus(id,oldStatus,newStatus);
  if(newStatus==='agendado'&&upd.data){
    const daysAhead=Math.floor((new Date(upd.data+'T12:00:00')-new Date())/86400000);
    if(daysAhead>=2) createFollowUpTasks(id,upd.data,upd.vnd||a?.vnd,upd.cli||a?.cli);
  }
  closeNeg(); toast('Negociação atualizada'); await refreshAll();
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function delAppt(id){
  if(!confirm('Excluir este agendamento?')) return;
  const{error}=await sb.from('eye_appts').delete().eq('id',id);
  if(error){toast('Erro ao excluir. Tente novamente.','err');return;}
  toast('Agendamento excluído','warn'); await refreshAll();
}

function exportCSV(){
  const appts=CU.role==='vendedor'?_apptsCache.filter(a=>a.vnd===CU.nome):[..._apptsCache];
  const headers=['Nome','Telefone','Data','Horário','Vendedor','Origem','Status','Modelo','Valor','Pagamento','Observações','Próximo passo'];
  const rows=appts.map(a=>[a.cli,a.tel,a.data,a.hora,a.vnd,a.orig,fmtStatus(a.status).l,a.modelo,a.valor,a.pgto,a.obs,a.prox].map(v=>`"${(v||'').replace(/"/g,'""')}"`));
  const csv=[headers.map(h=>`"${h}"`), ...rows].map(r=>r.join(',')).join('\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`eye-leads-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url); toast('Exportado com sucesso!');
}

// ─── COMENTÁRIOS ─────────────────────────────────────────────────────────────
async function loadComments(apptId){
  try{const{data}=await sb.from('eye_comments').select('*').eq('appt_id',apptId).order('created_at');return data||[];}
  catch(e){return[];}
}

function drawComments(apptId,comments){
  const el=document.getElementById('appt-comments');if(!el)return;
  el.innerHTML=`<div class="sec-divider">Comentários</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px" id="comment-list">
      ${comments.length?comments.map(c=>`<div style="background:var(--bg);border-radius:var(--rs);padding:9px 12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:12px;font-weight:700;color:${userColor(c.user_nome)}">${esc(c.user_nome)}</span>
          <span style="font-size:10px;color:var(--txt3)">${fmtLogTime(c.created_at)}</span>
        </div>
        <div style="font-size:13px;color:var(--txt);line-height:1.45">${esc(c.texto)}</div>
      </div>`).join(''):`<div style="font-size:12px;color:var(--txt3);text-align:center;padding:8px">Nenhum comentário ainda</div>`}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="finput" id="comment-input" placeholder="Adicionar comentário…" style="flex:1;margin:0;height:40px"
        onkeydown="if(event.key==='Enter')addComment('${apptId}')">
      <button class="btn-s p" style="height:40px;padding:0 14px" onclick="addComment('${apptId}')"><i class="ti ti-send"></i></button>
    </div>`;
}

async function addComment(apptId){
  const input=document.getElementById('comment-input'), texto=(input?.value||'').trim();
  if(!texto||!apptId)return;
  input.value='';
  const{error}=await sb.from('eye_comments').insert({id:uid(),appt_id:apptId,user_nome:CU.nome,texto,created_at:new Date().toISOString()});
  if(error){toast('Erro ao salvar comentário','err');return;}
  drawComments(apptId, await loadComments(apptId));
}

// ─── LOGS ────────────────────────────────────────────────────────────────────
async function logStatus(apptId,deStatus,paraStatus){
  try{
    await sb.from('eye_logs').insert({id:uid(),appt_id:apptId,user_nome:CU.nome,acao:'status',de_status:deStatus,para_status:paraStatus,created_at:new Date().toISOString()});
    // Registro automático de retrabalho ao mover para status de saída (item 5)
    const EXIT_SDR=['lead_frio','sem_resposta'];
    const EXIT_VND=['perdido','credito_reprovado','ag_retorno'];
    const EXIT_ALL=[...EXIT_SDR,...EXIT_VND];
    if(EXIT_ALL.includes(paraStatus)){
      const a=_apptsCache.find(x=>x.id===apptId);
      const resp=EXIT_VND.includes(paraStatus)?(a?.vnd||'Vendedor'):CU.nome;
      const motivos={lead_frio:'Sem interesse/resposta',perdido:'Lead perdido',sem_resposta:'Sem resposta após tentativas',credito_reprovado:'Crédito reprovado',ag_retorno:'Aguardando retorno'};
      const texto=`🔄 ${fmtStatus(paraStatus).l} · Responsável pelo retrabalho: ${resp} · ${motivos[paraStatus]||''}`;
      await sb.from('eye_comments').insert({id:uid(),appt_id:apptId,user_nome:CU.nome,texto,created_at:new Date().toISOString()});
    }
  }catch(e){}
}
async function loadApptLogs(apptId){
  try{const{data}=await sb.from('eye_logs').select('*').eq('appt_id',apptId).order('created_at');return data||[];}
  catch(e){return[];}
}

// ─── JOURNEY STEPPER V2 ───────────────────────────────────────────────────────
const _CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const _X_SVG = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;

function drawJourney(currentStatus, logs, targetEl) {
  const el = targetEl || document.getElementById('appt-journey'); if (!el) return;
  const steps = [
    {key:'pendente',        label:'Novo Lead'  },
    {key:'em_atendimento',  label:'Atendimento'},
    {key:'qualificado',     label:'Qualificado'},
    {key:'agendado',        label:'Agendado'   },
    {key:'passado_vendedor',label:'Vendedor'   },
    {key:'em_negociacao',   label:'Negociação' },
    {key:'test_drive',      label:'Test Drive' },
    {key:'ficha_enviada',   label:'Ficha'      },
    {key:'credito_aprovado',label:'Crédito'    },
    {key:'venda_concluida', label:'Vendido'    },
  ];
  const badKeys = ['lead_frio','perdido','sem_resposta','credito_reprovado','ag_retorno'];
  const isBad = badKeys.includes(currentStatus);
  const currIdx = steps.findIndex(s => s.key === currentStatus);

  let html = '<div class="sec-divider">Jornada do lead</div><div class="journey-v2">';
  steps.forEach((s, i) => {
    const isPast = currIdx > i;
    const isCurr = !isBad && currIdx === i;
    const nodeClass = isPast ? 'done' : isCurr ? 'curr' : 'future';
    const lblClass  = isPast ? 'done' : isCurr ? 'curr' : '';
    const icon = isPast ? _CHECK_SVG : isCurr ? `<div style="width:7px;height:7px;border-radius:50%;background:#fff"></div>` : '';
    html += `<div class="journey-v2-step">
      <div class="journey-v2-node ${nodeClass}">${icon}</div>
      <div class="journey-v2-label ${lblClass}">${s.label}</div>
    </div>`;
    if (i < steps.length - 1)
      html += `<div class="journey-v2-connector${isPast && !isBad ? ' done' : ''}"></div>`;
  });
  if (isBad) {
    const badLabels = {lead_frio:'Lead Frio',perdido:'Perdido',sem_resposta:'Sem Resposta',credito_reprovado:'Créd. Reprovado',ag_retorno:'Ag. Retorno'};
    html += `<div class="journey-v2-connector"></div>
    <div class="journey-v2-step">
      <div class="journey-v2-node bad">${_X_SVG}</div>
      <div class="journey-v2-label bad">${badLabels[currentStatus]||currentStatus}</div>
    </div>`;
  }
  el.innerHTML = html + '</div>';
}

// ─── BRIEFING MODAL ───────────────────────────────────────────────────────────
function _toggleTrocaField() {
  const fg = document.getElementById('br-troca-detalhe-fg');
  if (fg) fg.style.display = document.getElementById('br-troca')?.value === 'sim' ? 'block' : 'none';
}

async function openBriefingModal(apptId) {
  const a = _apptsCache.find(x => x.id === apptId);
  const existing = await getBriefing(apptId);
  document.getElementById('br-appt-id').value = apptId;
  document.getElementById('br-appt-name').textContent = a?.cli || '';
  document.getElementById('br-veiculo').value    = existing?.veiculo || a?.modelo || '';
  document.getElementById('br-entrada').value    = existing?.entrada || '';
  document.getElementById('br-troca').value      = existing?.troca ? 'sim' : 'nao';
  document.getElementById('br-troca-detalhe').value = existing?.troca_detalhe || a?.troca || '';
  document.getElementById('br-pagamento').value  = existing?.pagamento || a?.pgto || '';
  document.getElementById('br-urgencia').value   = existing?.urgencia || '';
  document.getElementById('br-objecao').value    = existing?.objecao || '';
  document.getElementById('br-resumo').value     = existing?.resumo || a?.obs || '';
  _toggleTrocaField();
  document.getElementById('ov-briefing').classList.add('on');
}

function closeBriefing() {
  document.getElementById('ov-briefing').classList.remove('on');
  _pendingBriefing = null;
}

async function saveBriefing() {
  const apptId   = document.getElementById('br-appt-id').value;
  const veiculo  = document.getElementById('br-veiculo').value.trim();
  const pagamento= document.getElementById('br-pagamento').value;
  const urgencia = document.getElementById('br-urgencia').value;
  const objecao  = document.getElementById('br-objecao').value;
  const resumo   = document.getElementById('br-resumo').value.trim();

  if (!veiculo || !pagamento || !urgencia || !objecao || resumo.length < 5) {
    toast('Preencha todos os campos obrigatórios do briefing', 'err'); return;
  }

  const entrada = document.getElementById('br-entrada').value.trim();
  const troca   = document.getElementById('br-troca').value === 'sim';
  const troca_detalhe = document.getElementById('br-troca-detalhe').value.trim();

  const briefObj = withUnit({ veiculo, entrada, troca, troca_detalhe, pagamento, urgencia, objecao, resumo, appt_id:apptId, criado_por:CU.nome, criado_em:new Date().toISOString() });
  const existing = await getBriefing(apptId);
  if (existing) {
    await sb.from('eye_briefings').update(briefObj).eq('appt_id', apptId);
  } else {
    await sb.from('eye_briefings').insert({ ...briefObj, id: uid() });
  }

  document.getElementById('ov-briefing').classList.remove('on');
  const pending = _pendingBriefing;
  _pendingBriefing = null;
  if (!pending) { toast('Briefing salvo!'); return; }

  if (pending.source === 'kb') {
    const a = _apptsCache.find(x => x.id === pending.apptId);
    if (a) {
      const now = new Date().toISOString(), prev = a.status;
      a.status = 'passado_vendedor'; a.em = now;
      _drawKanban();
      const { error } = await sb.from('eye_appts').update({ status:'passado_vendedor', em:now }).eq('id', pending.apptId);
      if (error) { toast('Erro ao mover lead', 'err'); a.status = prev; _drawKanban(); return; }
      await logStatus(pending.apptId, prev, 'passado_vendedor');
    }
    toast('📋 Lead passado ao vendedor com briefing!');
  } else if (pending.source === 'neg') {
    const { error } = await sb.from('eye_appts').update(pending.upd).eq('id', pending.apptId);
    if (error) { toast('Erro ao salvar. Tente novamente.', 'err'); return; }
    if (pending.oldStatus && pending.oldStatus !== 'passado_vendedor')
      await logStatus(pending.apptId, pending.oldStatus, 'passado_vendedor');
    closeNeg();
    toast('📋 Lead passado ao vendedor com briefing!');
    await refreshAll();
  }
}

// ─── RETRABALHO ───────────────────────────────────────────────────────────────
const _RETRAB_SCRIPTS = {
  lead_frio:        'Oi [nome]! Tudo bem? Sei que faz um tempo — mas acabou de chegar um [modelo] incrível que lembrei de você. Posso te mandar mais detalhes?',
  sem_resposta:     'Oi [nome]! Tentei falar com você anteriormente sobre um veículo de interesse. Ainda tem interesse? Posso ajudar a encontrar a melhor condição.',
  perdido:          'Olá [nome]! Passando para ver se posso ajudar com algo. Nossa equipe tem novas ofertas que talvez se encaixem no seu orçamento.',
  credito_reprovado:'Oi [nome]! Temos alternativas de financiamento que podem funcionar para o seu caso. Posso verificar outras opções com você?',
  ag_retorno:       'Oi [nome]! Estou seguindo nosso combinado de retorno. Conseguiu decidir sobre o veículo? Estou disponível para ajudar.',
};

async function renderRetrab() {
  const el = document.getElementById('v-retrab');
  loading(el);
  const appts = await getAppts();

  const RETRAB_SDR = ['lead_frio','sem_resposta'];
  const RETRAB_VND = ['perdido','credito_reprovado','ag_retorno'];
  const RETRAB_ALL = [...RETRAB_SDR,...RETRAB_VND];

  let leads = appts.filter(a => RETRAB_ALL.includes(a.status));
  if (CU.role === 'vendedor') leads = leads.filter(a => RETRAB_VND.includes(a.status) && a.vnd === CU.nome);
  else if (CU.role === 'sdr') leads = leads.filter(a => RETRAB_SDR.includes(a.status));

  const sdrTotal = leads.filter(a => RETRAB_SDR.includes(a.status)).length;
  const vndTotal = leads.filter(a => RETRAB_VND.includes(a.status)).length;

  if (!leads.length) {
    el.innerHTML = `<div class="stats"><div class="stat-c"><div class="sv" style="color:var(--grn)">0</div><div class="sl">Retrabalho</div></div></div><div class="empty-st"><i class="ti ti-refresh"></i><p>Nenhum lead para retrabalho!<br>Tudo limpo por aqui.</p></div>`;
    return;
  }

  leads.sort((a,b) => (a.em||'') < (b.em||'') ? -1 : 1);

  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv" style="color:var(--red)">${leads.length}</div><div class="sl">Total</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--ind)">${sdrTotal}</div><div class="sl">SDR</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--amb)">${vndTotal}</div><div class="sl">Vendedor</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:0">
      ${leads.map(a => {
        const sm = fmtStatus(a.status);
        const ac = userColor(a.vnd||'?');
        const dias = a.em ? Math.floor((Date.now()-new Date(a.em))/86400000) : '?';
        const script = (_RETRAB_SCRIPTS[a.status]||'').replace('[nome]',a.cli.split(' ')[0]).replace('[modelo]',a.modelo||'veículo');
        return `<div class="rq-card">
          <div class="rq-top">
            <div class="ac-av" style="background:${ac};width:36px;height:36px;font-size:12px;flex:none">${initials(a.vnd||'?')}</div>
            <div class="rq-info">
              <div class="rq-name">${esc(a.cli)}<span class="tag ${sm.cls}" style="margin-left:6px">${sm.l}</span></div>
              <div class="rq-sub">${esc(a.vnd||'—')} · ${dias}d parado${a.tel?` · <a href="tel:${esc(a.tel)}" style="color:var(--ind)">${esc(a.tel)}</a>`:''}</div>
            </div>
            <div style="flex:none;font-size:20px;font-weight:800;color:var(--red);opacity:.5">${dias}d</div>
          </div>
          ${script?`<div class="rq-script"><b>Script:</b> ${esc(script)}</div>`:''}
          <div class="rq-acts">
            ${RETRAB_SDR.includes(a.status)?`<button class="ag-qa-btn g" onclick="agQa('${a.id}','em_atendimento')"><i class="ti ti-phone-check"></i> Retomou contato</button>`:''}
            ${RETRAB_VND.includes(a.status)&&a.status!=='ag_retorno'?`<button class="ag-qa-btn g" onclick="agQa('${a.id}','em_negociacao')"><i class="ti ti-refresh"></i> Retomou negociação</button>`:''}
            ${a.status==='ag_retorno'?`<button class="ag-qa-btn g" onclick="agQa('${a.id}','em_negociacao')"><i class="ti ti-phone-check"></i> Retornou</button>`:''}
            ${(isMgr()||CU.role==='sdr')?`<button class="ag-qa-btn b" style="background:rgba(88,86,214,.12);color:#5856D6" onclick="openRenegoc('${a.id}')"><i class="ti ti-refresh"></i> Renegociar</button>`:''}
            <button class="ag-qa-btn r" onclick="agQa('${a.id}','perdido')"><i class="ti ti-trash"></i> Descartar</button>
            <button class="ag-qa-btn b" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i> Editar</button>
            <button class="btn-s" onclick="openLeadTimeline('${a.id}')"><i class="ti ti-timeline"></i> Histórico</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function openRenegoc(id){
  const a=_apptsCache.find(x=>x.id===id); if(!a) return;
  document.getElementById('rn-appt-id').value=id;
  document.getElementById('rn-lead-name').textContent=a.cli||a.tel||'Lead';
  document.getElementById('rn-prox').value='';
  document.getElementById('rn-abordagem').value='';
  document.getElementById('rn-motivo').value='';
  const vnds=vendedores();
  document.getElementById('rn-vnd').innerHTML=`<option value="">Selecione…</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  document.getElementById('rn-vnd').value=a.vnd||'';
  const sdrs=(await getUsers()).filter(u=>u.role==='sdr');
  document.getElementById('rn-sdr').innerHTML=`<option value="">Nenhum</option>${sdrs.map(s=>`<option value="${s.nome}">${s.nome}</option>`).join('')}`;
  document.getElementById('ov-renegoc').classList.add('on');
}

function closeRenegoc(){document.getElementById('ov-renegoc').classList.remove('on');}

async function saveRenegoc(){
  const id=document.getElementById('rn-appt-id').value;
  const novoVnd=document.getElementById('rn-vnd').value;
  const motivo=document.getElementById('rn-motivo').value;
  if(!novoVnd){toast('Selecione o vendedor','err');return;}
  if(!motivo){toast('Selecione o motivo','err');return;}
  const a=_apptsCache.find(x=>x.id===id); if(!a) return;
  const abordagem=document.getElementById('rn-abordagem').value.trim();
  const prox=document.getElementById('rn-prox').value;
  const now=new Date().toISOString();
  const obs=`🔄 Renegociação: ${motivo}${abordagem?'\nAbordagem: '+abordagem:''}`;
  const upd={status:'em_negociacao',vnd:novoVnd,em:now,obs:(a.obs?a.obs+'\n\n':'')+obs,...(prox&&{prox:'Próx. contato: '+prox})};
  const{error}=await sb.from('eye_appts').update(upd).eq('id',id);
  if(error){toast('Erro ao salvar','err');return;}
  await logStatus(id,a.status,'em_negociacao');
  await sb.from('eye_logs').insert({id:uid(),appt_id:id,user_nome:CU.nome,acao:'renegociacao',de_status:a.status,para_status:'em_negociacao',created_at:now});
  closeRenegoc(); toast('Renegociação iniciada!'); await refreshAll();
}

function checkGate(a, newStatus) {
  if (newStatus === 'passado_vendedor') {
    const req = { cli:'Cliente', tel:'Telefone', vnd:'Vendedor', orig:'Origem', modelo:'Veículo de interesse', pgto:'Forma de pagamento' };
    const missing = Object.entries(req).filter(([k])=>!a[k]).map(([,l])=>l);
    if (!a.obs || a.obs.trim().length < 5) missing.push('Resumo da conversa (obs)');
    return missing.length ? missing : null;
  }
  if (newStatus === 'venda_concluida') {
    const req = { cli:'Cliente', vnd:'Vendedor', orig:'Origem', modelo:'Veículo vendido', valor:'Valor' };
    const missing = Object.entries(req).filter(([k])=>!a[k]).map(([,l])=>l);
    return missing.length ? missing : null;
  }
  return null;
}
