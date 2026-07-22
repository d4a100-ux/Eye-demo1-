// ─── APPT CARD ────────────────────────────────────────────────────────────────
function apptCard(a, opts = {}) {
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);
  const hasNeg = a.modelo || a.valor || a.pgto;
  const hasObs = a.obs || a.prox;
  return `<div class="ac" style="--c:${sm.c}">
    <div class="ac-head">
      <div class="ac-av" style="background:${ac}">${initials(a.vnd)}</div>
      <div class="ac-info">
        <div class="ac-name">${a.cli}<span class="tag ${sm.cls}">${sm.l}</span></div>
        <div class="ac-sub">
          <span><i class="ti ti-calendar"></i>${fmtDate(a.data)}${a.hora?' · '+a.hora:''}</span>
          <span><i class="ti ti-user"></i>${a.vnd||'—'}</span>
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${a.orig}</span>`:''}
          ${a.tel ?`<span><i class="ti ti-phone"></i>${a.tel}</span>` :''}
        </div>
      </div>
    </div>
    ${hasNeg?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${a.modelo}</div></div>`:''}
      ${a.valor ?`<div class="af"><div class="afl">Valor</div><div class="afv" style="color:var(--grn)">${a.valor}</div></div>`:''}
      ${a.pgto  ?`<div class="af"><div class="afl">Pagamento</div><div class="afv">${a.pgto}</div></div>`:''}
    </div>`:''}
    ${hasObs?`<div class="ac-neg">
      <div class="neg-lbl">Negociação</div>
      ${a.obs ?`<div>${a.obs}</div>`:''}
      ${a.prox?`<div class="next"><i class="ti ti-arrow-right" style="font-size:12px;vertical-align:-1px"></i> ${a.prox}</div>`:''}
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
    <div class="appt-list">${arr.map(a=>apptCard(a)).join('')}</div>`).join('');
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
        <div class="ac-name">${a.cli}<span class="tag ${sm.cls}">${sm.l}</span></div>
        <div class="ac-sub">
          <span><i class="ti ti-user"></i>${a.vnd}</span>
          ${a.tel?`<span><i class="ti ti-phone"></i>${a.tel}</span>`:''}
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${a.orig}</span>`:''}
        </div>
      </div>
    </div>
    ${a.modelo||a.valor?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${a.modelo}</div></div>`:''}
      ${a.valor?`<div class="af"><div class="afl">Valor</div><div class="afv" style="color:var(--grn)">${a.valor}</div></div>`:''}
      ${a.pgto?`<div class="af"><div class="afl">Pagamento</div><div class="afv">${a.pgto}</div></div>`:''}
    </div>`:''}
    ${a.obs?`<div class="ac-neg"><div class="neg-lbl">Negociação</div><div>${a.obs}</div>${a.prox?`<div class="next"><i class="ti ti-arrow-right" style="font-size:12px;vertical-align:-1px"></i> ${a.prox}</div>`:''}</div>`:''}
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
  const [logs, comments] = await Promise.all([loadApptLogs(id), loadComments(id)]);
  const sm = fmtStatus(a.status);
  const ac = userColor(a.vnd);

  const events = [
    ...logs.map(l => ({ type:'status', ts:l.created_at, user:l.user_nome, de:l.de_status, para:l.para_status })),
    ...comments.map(c => ({ type:'comment', ts:c.created_at, user:c.user_nome, texto:c.texto }))
  ].sort((a,b) => a.ts < b.ts ? -1 : 1);

  document.getElementById('tl-title').textContent = a.cli;
  document.getElementById('tl-status').innerHTML = `<span class="tag ${sm.cls}">${sm.l}</span>`;
  document.getElementById('tl-info').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:0.5px solid var(--bdr);margin-bottom:14px">
      <div class="ac-av" style="background:${ac};width:40px;height:40px;font-size:14px">${initials(a.vnd)}</div>
      <div>
        <div style="font-weight:700;font-size:15px">${a.cli}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:3px">${[a.vnd,a.tel,a.orig].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
    ${a.modelo||a.valor?`<div class="ac-fields" style="margin-bottom:14px">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${a.modelo}</div></div>`:''}
      ${a.valor?`<div class="af"><div class="afl">Valor</div><div class="afv" style="color:var(--grn)">${a.valor}</div></div>`:''}
      ${a.pgto?`<div class="af"><div class="afl">Pagamento</div><div class="afv">${a.pgto}</div></div>`:''}
    </div>`:''}`;

  drawJourney(a.status, logs, document.getElementById('tl-journey'));

  document.getElementById('tl-timeline').innerHTML = events.length
    ? events.map(ev => {
        if (ev.type === 'status') {
          const from = fmtStatus(ev.de), to = fmtStatus(ev.para);
          return `<div class="tl-item">
            <div class="tl-dot" style="background:${to.c}"><i class="ti ti-arrow-right" style="font-size:10px;color:#fff"></i></div>
            <div class="tl-body">
              <div class="tl-user">${ev.user}</div>
              <div class="tl-action">
                <span class="tag ${from.cls}" style="font-size:10px">${from.l}</span>
                <i class="ti ti-chevron-right" style="font-size:11px;color:var(--txt3)"></i>
                <span class="tag ${to.cls}" style="font-size:10px">${to.l}</span>
              </div>
              <div class="tl-time">${fmtLogTime(ev.ts)}</div>
            </div>
          </div>`;
        } else {
          return `<div class="tl-item">
            <div class="tl-dot" style="background:var(--ind)"><i class="ti ti-message" style="font-size:10px;color:#fff"></i></div>
            <div class="tl-body">
              <div class="tl-user">${ev.user}</div>
              <div class="tl-text">${ev.texto}</div>
              <div class="tl-time">${fmtLogTime(ev.ts)}</div>
            </div>
          </div>`;
        }
      }).join('')
    : `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px">Nenhuma movimentação registrada ainda.</div>`;

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
  if(error){toast('Erro ao criar lead: '+error.message,'err');return;}
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
  if(error){toast('Erro ao salvar: '+error.message,'err');return;}
  closeAppt(); toast(eid?'Agendamento atualizado':'Lead criado com sucesso'); await refreshAll();
}

// ─── MODAL NEGOCIAÇÃO ─────────────────────────────────────────────────────────
async function openNeg(id){
  const a=_apptsCache.find(x=>x.id===id);if(!a)return;
  document.getElementById('neg-modal-title').textContent='Negociação · '+a.cli;
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
  document.getElementById('ov-neg').classList.add('on');
}
function closeNeg(){document.getElementById('ov-neg').classList.remove('on');}

async function saveNeg(){
  const id=document.getElementById('neg-id').value, newStatus=document.getElementById('n-status').value;
  const a=_apptsCache.find(x=>x.id===id);
  if(a){
    const merged={...a,status:newStatus,modelo:document.getElementById('n-modelo').value.trim()||a.modelo,valor:document.getElementById('n-valor').value.trim()||a.valor};
    const missing=checkGate(merged,newStatus);
    if(missing){
      const msg = newStatus==='passado_vendedor' ? `Briefing obrigatório. Preencha: ${missing.join(', ')}` : `Para registrar preencha: ${missing.join(', ')}`;
      toast(msg,'err'); return;
    }
  }
  const upd={status:newStatus,em:new Date().toISOString(),modelo:document.getElementById('n-modelo').value.trim(),valor:document.getElementById('n-valor').value.trim(),
    pgto:document.getElementById('n-pgto').value,obs:document.getElementById('n-obs').value.trim(),prox:document.getElementById('n-prox').value.trim()};
  if(canEdit(a)){
    const cli=document.getElementById('n-cli')?.value.trim();
    if(cli) upd.cli=cli;
    upd.tel  = document.getElementById('n-tel')?.value.trim()||a?.tel||'';
    upd.data = document.getElementById('n-data')?.value||a?.data||'';
    upd.hora = document.getElementById('n-hora')?.value||'';
    upd.vnd  = document.getElementById('n-vnd')?.value||a?.vnd||'';
    upd.orig     = document.getElementById('n-orig')?.value||a?.orig||'';
    upd.ativo_id = document.getElementById('n-ativo')?.value||null;
    upd.troca    = document.getElementById('n-troca')?.value.trim()||'';
  }
  const oldStatus=a?.status;
  const{error}=await sb.from('eye_appts').update(upd).eq('id',id);
  if(error){toast('Erro ao salvar: '+error.message,'err');return;}
  if(oldStatus&&oldStatus!==newStatus) await logStatus(id,oldStatus,newStatus);
  // Auto follow-up: se ficou agendado com data 2+ dias à frente
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
  if(error){toast('Erro: '+error.message,'err');return;}
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
          <span style="font-size:12px;font-weight:700;color:${userColor(c.user_nome)}">${c.user_nome}</span>
          <span style="font-size:10px;color:var(--txt3)">${fmtLogTime(c.created_at)}</span>
        </div>
        <div style="font-size:13px;color:var(--txt);line-height:1.45">${c.texto}</div>
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
  try{await sb.from('eye_logs').insert({id:uid(),appt_id:apptId,user_nome:CU.nome,acao:'status',de_status:deStatus,para_status:paraStatus,created_at:new Date().toISOString()});}
  catch(e){}
}
async function loadApptLogs(apptId){
  try{const{data}=await sb.from('eye_logs').select('*').eq('appt_id',apptId).order('created_at');return data||[];}
  catch(e){return[];}
}

// ─── JOURNEY STEPPER ──────────────────────────────────────────────────────────
function drawJourney(currentStatus, logs, targetEl) {
  const el = targetEl || document.getElementById('appt-journey'); if (!el) return;
  const steps=[
    {key:'pendente',        icon:'🔔',label:'Novo Lead'  },
    {key:'em_atendimento',  icon:'📞',label:'Atendimento'},
    {key:'qualificado',     icon:'⭐',label:'Qualificado'},
    {key:'agendado',        icon:'📅',label:'Agendado'   },
    {key:'passado_vendedor',icon:'🤝',label:'Vendedor'   },
    {key:'em_negociacao',   icon:'💬',label:'Negociação' },
    {key:'test_drive',      icon:'🚗',label:'Test Drive' },
    {key:'ficha_enviada',   icon:'📋',label:'Ficha'      },
    {key:'credito_aprovado',icon:'✅',label:'Crédito'    },
    {key:'venda_concluida', icon:'🏆',label:'Vendido'    },
  ];
  const badKeys=['lead_frio','perdido','sem_resposta','credito_reprovado','ag_retorno'];
  const isBad=badKeys.includes(currentStatus);
  const currIdx=steps.findIndex(s=>s.key===currentStatus);
  const logMap={};
  (logs||[]).forEach(l=>{logMap[l.para_status]=l.created_at;});
  let html='<div class="sec-divider">Jornada do lead</div><div class="journey">';
  steps.forEach((s,i)=>{
    const isDone=currIdx>i||(!isBad&&s.key===currentStatus);
    const isCurr=!isBad&&s.key===currentStatus;
    const cls=isCurr?'curr':isDone?'done':'';
    const ts=logMap[s.key]?`<div style="font-size:8px;color:var(--txt3);margin-top:1px">${fmtLogTime(logMap[s.key]).split(' ')[0]}</div>`:'';
    html+=`<div class="journey-step"><div class="journey-dot ${cls}">${isCurr||isDone?s.icon:''}</div><div class="journey-lbl ${cls}">${s.label}${ts}</div></div>`;
    if(i<steps.length-1) html+=`<div class="journey-line ${currIdx>i&&!isBad?'done':''}"></div>`;
  });
  if(isBad){
    const badLabels={lead_frio:'Lead Frio',perdido:'Perdido',sem_resposta:'Sem Resposta',credito_reprovado:'Créd. Reprovado',ag_retorno:'Ag. Retorno'};
    const badIcons={lead_frio:'🥶',perdido:'❌',sem_resposta:'😶',credito_reprovado:'🚫',ag_retorno:'⏸'};
    html+=`<div class="journey-line"></div><div class="journey-step"><div class="journey-dot bad">${badIcons[currentStatus]||'❌'}</div><div class="journey-lbl bad">${badLabels[currentStatus]||currentStatus}</div></div>`;
  }
  el.innerHTML=html+'</div>';
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
