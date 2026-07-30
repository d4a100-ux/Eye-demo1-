function _renderFunnelSVG(funnel) {
  const W = 600, H = 180, pad = 10;
  const n = funnel.length;
  const segW = (W - pad * (n - 1)) / n;
  const colors = ['#5B6EFF','#8A98FF','#FF9F0A','#34C759'];
  const maxN = Math.max(...funnel.map(f => f.n), 1);

  const segs = funnel.map((f, i) => {
    const x = i * (segW + pad);
    const fillH = Math.max(28, Math.round((f.n / maxN) * (H - 60)));
    const barY = H - 36 - fillH;
    const c = colors[i] || '#5B6EFF';
    const pct = maxN > 0 ? Math.round(f.n / funnel[0].n * 100) : 0;
    return `<g>
      <rect x="${x}" y="${H-36}" width="${segW}" height="${fillH}" rx="0" ry="0" fill="${c}" opacity=".10" transform="translate(0,${fillH}) scale(1,-1) translate(0,-${H-36+fillH})"/>
      <rect x="${x}" y="${barY}" width="${segW}" height="${fillH}" rx="8" ry="8" fill="${c}" opacity=".18"/>
      <rect x="${x}" y="${barY}" width="${segW}" height="4" rx="2" ry="2" fill="${c}"/>
      <text x="${x + segW/2}" y="${H-20}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="700" fill="#1C1C1E" letter-spacing="-0.8">${f.n}</text>
      <text x="${x + segW/2}" y="${H-6}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="500" fill="#C7C7CC" letter-spacing="0.4">${f.l.toUpperCase()}</text>
      ${i > 0 && funnel[0].n > 0 ? `<text x="${x + segW/2}" y="${barY - 6}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="600" fill="${c}">${pct}%</text>` : ''}
    </g>`;
  }).join('');

  const arrows = funnel.slice(0,-1).map((_,i) => {
    const ax = (i+1) * (segW + pad) - pad/2;
    return `<text x="${ax}" y="${H-20}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="12" fill="#C7C7CC">›</text>`;
  }).join('');

  return `<div class="funnel-svg-wrap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${segs}${arrows}</svg></div>`;
}

async function renderInicio() {
  const el=document.getElementById('v-inicio');
  loading(el);
  const appts=await getAppts();
  const myAppts=CU.role==='vendedor'?appts.filter(a=>a.vnd===CU.nome):appts;
  const now=new Date(), today=now.toISOString().split('T')[0];
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const todayAppts    =myAppts.filter(a=>a.data===today);
  const realizedMonth =myAppts.filter(a=>a.status==='venda_concluida'&&(a.data||'').startsWith(monthKey));
  const potential     =myAppts.reduce((s,a)=>{const n=parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));return s+(isNaN(n)?0:n);},0);
  const hotLeads      =myAppts.filter(a=>['pendente','em_atendimento','sem_resposta'].includes(a.status)&&a.em&&Math.floor((Date.now()-new Date(a.em))/86400000)>=1);
  const confirmedToday=myAppts.filter(a=>a.status==='passado_vendedor'&&a.data===today);
  const realizedToday =myAppts.filter(a=>a.status==='venda_concluida'&&a.data===today);

  const meta=parseInt(localStorage.getItem('eye_meta')||'10');
  const pct=Math.min(100,Math.round(realizedMonth.length/meta*100));
  const funnel=[
    {l:'Leads',        n:myAppts.length,                                                                                                                                              bg:'#007AFF'},
    {l:'Agendados',    n:myAppts.filter(a=>['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length,bg:'#5856D6'},
    {l:'Com vendedor', n:myAppts.filter(a=>['em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length,                              bg:'#FF9F0A'},
    {l:'Vendidos',     n:myAppts.filter(a=>a.status==='venda_concluida').length,                                                                                                       bg:'#34C759'},
  ];
  const ranking=CU.role!=='vendedor'?vendedores().map(v=>{
    const va=appts.filter(a=>a.vnd===v.nome);
    const vendidos=va.filter(a=>a.status==='venda_concluida').length;
    const passados=va.filter(a=>a.status==='passado_vendedor').length;
    return{nome:v.nome,vendidos,realizados:passados,total:va.length,conv:va.length>0?Math.round(vendidos/va.length*100):0};
  }).filter(v=>v.total>0).sort((a,b)=>b.vendidos-a.vendidos||b.total-a.total):[];

  const h=now.getHours(), grt=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const DAYS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const potFmt=potential>=1000?`R$ ${(potential/1000).toFixed(0)}k`:`R$ ${Math.round(potential)}`;

  // Módulos disponíveis por role
  const allMods = [
    { id:'crm',    icon:'ti-layout-kanban',  label:'CRM',           sub:'Pipeline de leads',    color:'#007AFF', roles:null },
    { id:'tarefas',icon:'ti-checkbox',       label:'Tarefas',        sub:'Follow-ups e alertas', color:'#5856D6', roles:null },
    { id:'agenda', icon:'ti-calendar',       label:'Agenda',         sub:'Agendamentos',         color:'#2DD4A7', roles:null },
    { id:'conv',   icon:'ti-message-2',      label:'Conversas',      sub:'Histórico de leads',   color:'#FF9F0A', roles:null },
    { id:'negoc',  icon:'ti-handshake',      label:'Pipeline',       sub:'Leads em negociação',  color:'#5856D6', roles:['gerencia','master'] },
    { id:'bi',     icon:'ti-chart-bar',      label:'BI',             sub:'Relatórios e dados',   color:'#FF3B30', roles:['gerencia','master'] },
    { id:'ativos',  icon:'ti-car',             label:'Ativos',       sub:'Gestão de veículos',  color:'#FF9F0A', roles:['gerencia','master'] },
    { id:'retrab',  icon:'ti-refresh',         label:'Retrabalho',   sub:'Leads para reconquistar',color:'#FF3B30', roles:null },
    { id:'conf',    icon:'ti-clipboard-list',  label:'Conferência',  sub:'Dashboard diário',    color:'#5856D6', roles:['gerencia','master'] },
  ];
  const mods = allMods.filter(m => !m.roles || m.roles.includes(CU.role));

  el.innerHTML=`
    <div class="dash-greeting">
      <div class="dg-title">${grt}, ${CU.nome} 👋</div>
      <div class="dg-sub">${DAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}</div>
    </div>

    <div class="kpi-grid" style="margin-top:8px">
      <div class="kpi-c" style="--kc:var(--ind)"><div class="kl">Total de leads</div><div class="kv" style="color:var(--ind)">${myAppts.length}</div></div>
      <div class="kpi-c" style="--kc:var(--amb)"><div class="kl">Agendamentos hoje</div><div class="kv" style="color:var(--amb)">${todayAppts.length}</div></div>
      <div class="kpi-c" style="--kc:var(--grn)"><div class="kl">Vendas no mês</div><div class="kv" style="color:var(--grn)">${realizedMonth.length}</div></div>
      <div class="kpi-c" style="--kc:var(--red)"><div class="kl">Leads parados</div><div class="kv" style="color:var(--red)">${hotLeads.length}</div></div>
    </div>
    <div class="dash-row">
      <div class="dash-box">
        <div class="dash-box-title">Alertas</div>
        ${hotLeads.length||confirmedToday.length||realizedToday.length?`
          ${hotLeads.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--red)"></div><div class="alert-txt">Leads parados (+1 dia)</div><div class="alert-count" style="color:var(--red)">${hotLeads.length}</div></div>`:''}
          ${confirmedToday.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--amb)"></div><div class="alert-txt">Passados ao vendedor hoje</div><div class="alert-count" style="color:var(--amb)">${confirmedToday.length}</div></div>`:''}
          ${realizedToday.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--grn)"></div><div class="alert-txt">Vendidos hoje</div><div class="alert-count" style="color:var(--grn)">${realizedToday.length}</div></div>`:''}
        `:`<div class="alert-empty">✅ Tudo tranquilo hoje</div>`}
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Meta do mês</div>
        <div class="meta-header"><span>Vendidos: <b>${realizedMonth.length}</b></span><input class="meta-input" type="number" id="meta-input" value="${meta}" min="1" onchange="saveMeta(this.value)"></div>
        <div class="meta-bar-bg"><div class="meta-bar-fill" style="--w:${pct}%;width:${pct}%"></div></div>
        <div class="meta-label">${pct}% da meta · ${Math.max(0,meta-realizedMonth.length)} restantes</div>
      </div>
    </div>
    <div class="dash-box">
      <div class="dash-box-title">Funil do mês</div>
      ${_renderFunnelSVG(funnel)}
    </div>
    ${ranking.length?`<div class="dash-box">
      <div class="dash-box-title">Ranking de vendedores</div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${ranking.map((v,i)=>{
          const barW=ranking[0].vendidos>0?Math.round(v.vendidos/ranking[0].vendidos*100):0;
          const medals=['🥇','🥈','🥉'];
          return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--bg2);border-radius:var(--radius-lg);transition:.2s" onmouseover="this.style.background='rgba(91,110,255,.06)'" onmouseout="this.style.background='var(--bg2)'">
            <div style="font-size:15px;width:22px;text-align:center;flex:none">${medals[i]||('<span style="font-size:11px;color:var(--txt3);font-weight:600">#'+(i+1)+'</span>')}</div>
            <div style="width:32px;height:32px;border-radius:var(--rs);background:${userColor(v.nome)};display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;font-weight:700;font-size:10px;color:#fff;flex:none">${initials(v.nome)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--txt)">${esc(v.nome)}</div>
              <div style="height:4px;background:var(--bdr);border-radius:4px;margin-top:5px;overflow:hidden">
                <div style="height:100%;width:${barW}%;background:var(--grn);border-radius:4px;transition:.5s cubic-bezier(.34,1.56,.64,1)"></div>
              </div>
            </div>
            <div style="text-align:right;flex:none">
              <div style="font-size:18px;font-weight:800;color:var(--grn);letter-spacing:-.5px;line-height:1">${v.vendidos}</div>
              <div style="font-size:10px;color:var(--txt3);margin-top:2px">${v.conv}% conv.</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}
    <div class="dash-box">
      <div class="dash-box-title">Hoje · ${todayAppts.length} agendamento${todayAppts.length!==1?'s':''}</div>
      ${todayAppts.length?`<div class="today-list">
        ${todayAppts.sort((a,b)=>(a.hora||'')>(b.hora||'')?1:-1).map(a=>{
          const sm=fmtStatus(a.status);
          return `<div class="today-item" onclick="openNeg('${a.id}')">
            <div class="ti-av" style="background:${userColor(a.vnd)}">${initials(a.vnd)}</div>
            <div class="ti-info"><div class="ti-name">${a.cli}</div><div class="ti-sub">${a.hora||'—'} · ${a.vnd}</div></div>
            <span class="tag ${sm.cls}">${sm.l}</span>
          </div>`;
        }).join('')}
      </div>`:`<div class="alert-empty" style="padding:16px 0">Nenhum agendamento para hoje</div>`}
    </div>`;
}

function saveMeta(val){localStorage.setItem('eye_meta',Math.max(1,parseInt(val)||10));renderInicio();}

// ─── HOT LEAD NOTIFICATION ────────────────────────────────────────────────────
function showHotLeadNotif(){
  const lead=_apptsCache.find(a=>['pendente','em_atendimento'].includes(a.status)&&(CU.role!=='vendedor'||a.vnd===CU.nome));
  if(!lead) return;
  document.getElementById('hl-sub').textContent=[lead.cli,lead.modelo,lead.orig].filter(Boolean).join(' · ')+' · aguardando atendimento';
  const bar=document.getElementById('hl-bar');
  bar.style.animation='none'; void bar.offsetHeight;
  bar.style.cssText='animation:drain 8s linear forwards;';
  const notif=document.getElementById('hl-notif');
  notif.classList.remove('hide'); notif.classList.add('show');
  clearTimeout(notif._t); notif._t=setTimeout(closeHotLead,8000);
}
function closeHotLead(){
  const notif=document.getElementById('hl-notif');
  clearTimeout(notif._t); notif.classList.remove('show'); notif.classList.add('hide');
}

// ─── CONFIRMAÇÃO DE AGENDAMENTOS AMANHÃ (item 6) ─────────────────────────────
async function checkTomorrowAppts() {
  const appts = await getAppts();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  const tomStr = tom.toISOString().split('T')[0];
  const pending = appts.filter(a =>
    a.status === 'agendado' &&
    a.data === tomStr &&
    (CU.role !== 'vendedor' || a.vnd === CU.nome)
  );
  if (!pending.length) return;
  const names = pending.slice(0,2).map(a=>`${a.cli}${a.hora?' às '+a.hora:''}`).join(' · ');
  const more  = pending.length > 2 ? ` e mais ${pending.length-2}` : '';
  const el  = document.getElementById('tomorrow-notif');
  const sub = document.getElementById('tn-sub');
  if (!el || !sub) return;
  sub.textContent = names + more + ' · Confirmar presença!';
  el.classList.remove('hide'); el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(closeTomorrowNotif, 12000);
}
function closeTomorrowNotif() {
  const el = document.getElementById('tomorrow-notif');
  if (!el) return;
  clearTimeout(el._t); el.classList.remove('show'); el.classList.add('hide');
}

// ─── DASHBOARD DE CONFERÊNCIA DIÁRIA (item 3) ─────────────────────────────────
let _confRefreshTimer = null;

async function renderConf() {
  const el = document.getElementById('v-conf');
  if (!el.querySelector('.dash-greeting')) loading(el);
  if (_confRefreshTimer) clearTimeout(_confRefreshTimer);

  _apptsCache = [];
  const appts = await getAppts();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const ACTIVE_ST = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno'];
  const receivedToday  = appts.filter(a => (a.criado_em||a.em||'').startsWith(today));
  const respondedToday = appts.filter(a => a.em?.startsWith(today) && a.status !== 'pendente');
  const noContact      = appts.filter(a => a.status==='pendente' && a.em && (Date.now()-new Date(a.em))/60000>30);
  const agendados      = appts.filter(a => ['agendado','passado_vendedor','em_negociacao','test_drive'].includes(a.status) && a.data===today);
  const stopped2h      = appts.filter(a => a.em && ACTIVE_ST.includes(a.status) && (Date.now()-new Date(a.em))/3600000>=2)
                              .sort((a,b) => new Date(a.em)-new Date(b.em));
  const meta           = parseInt(localStorage.getItem('eye_meta')||'10');
  const vendidos       = appts.filter(a => a.status==='venda_concluida' && (a.data||'').startsWith(monthKey));
  const pct            = Math.min(100,Math.round(vendidos.length/meta*100));
  const todayAppts     = appts.filter(a=>a.data===today).sort((a,b)=>(a.hora||'')>(b.hora||'')?1:-1);

  const tsStr = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  el.innerHTML = `
    <div class="dash-greeting" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div class="dg-title">📋 Conferência diária</div>
        <div class="dg-sub">${today.split('-').reverse().join('/')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="conf-refresh-badge" id="conf-ts">Atualizado às ${tsStr}</span>
        <button class="btn-s" onclick="renderConf()"><i class="ti ti-refresh"></i>Atualizar</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-c" style="--kc:var(--ind)"><div class="kl">Leads hoje</div><div class="kv" style="color:var(--ind)">${receivedToday.length}</div></div>
      <div class="kpi-c" style="--kc:var(--grn)"><div class="kl">Respondidos</div><div class="kv" style="color:var(--grn)">${respondedToday.length}</div></div>
      <div class="kpi-c" style="--kc:var(--red)"><div class="kl">Sem contato +30min</div><div class="kv" style="color:var(--red)">${noContact.length}</div></div>
      <div class="kpi-c" style="--kc:var(--amb)"><div class="kl">Agend. hoje</div><div class="kv" style="color:var(--amb)">${agendados.length}</div></div>
    </div>

    <div class="dash-box" style="margin-top:20px">
      <div class="dash-box-title">🚨 Leads parados (${stopped2h.length})</div>
      ${stopped2h.length ? stopped2h.slice(0,10).map(a=>{
        const h=Math.round((Date.now()-new Date(a.em))/3600000);
        const sm=fmtStatus(a.status);
        const col=h>=24?'var(--red)':h>=4?'var(--red)':'var(--amb)';
        return `<div class="alert-item" onclick="openNeg('${a.id}')" style="cursor:pointer">
          <div class="alert-dot" style="background:${col}"></div>
          <div class="alert-txt">${esc(a.cli)} · ${esc(a.vnd||'—')} · <span class="tag ${sm.cls}" style="font-size:10px">${sm.l}</span></div>
          <div class="alert-count" style="color:${col}">${h}h</div>
        </div>`;
      }).join('')+(stopped2h.length>10?`<div style="font-size:12px;color:var(--txt3);text-align:center;padding:6px">e mais ${stopped2h.length-10}</div>`:'')
      :`<div class="alert-empty">✅ Nenhum lead parado acima de 2h</div>`}
    </div>

    <div class="dash-row" style="margin-top:16px">
      <div class="dash-box">
        <div class="dash-box-title">Meta do mês</div>
        <div class="meta-header"><span>Vendidos: <b>${vendidos.length}</b> / Meta: <b>${meta}</b></span><input class="meta-input" type="number" id="conf-meta-input" value="${meta}" min="1" onchange="saveMeta(this.value)"></div>
        <div class="meta-bar-bg"><div class="meta-bar-fill" style="--w:${pct}%;width:${pct}%"></div></div>
        <div class="meta-label">${pct}% · faltam ${Math.max(0,meta-vendidos.length)}</div>
      </div>
      <div class="dash-box">
        <div class="dash-box-title">⏱ Sem contato (${noContact.length})</div>
        ${noContact.length?noContact.slice(0,6).map(a=>{
          const m=Math.round((Date.now()-new Date(a.em))/60000);
          return `<div class="alert-item" onclick="openNeg('${a.id}')" style="cursor:pointer">
            <div class="alert-dot" style="background:var(--red)"></div>
            <div class="alert-txt">${esc(a.cli)} · ${esc(a.orig||'—')}</div>
            <div class="alert-count" style="color:var(--red)">${m}min</div>
          </div>`;
        }).join(''):`<div class="alert-empty">✅ Todos respondidos</div>`}
      </div>
    </div>

    <div class="dash-box" style="margin-top:16px">
      <div class="dash-box-title">📅 Agenda de hoje · ${todayAppts.length} agend.</div>
      ${todayAppts.length?`<div class="today-list">${todayAppts.map(a=>{
        const sm=fmtStatus(a.status);
        return `<div class="today-item" onclick="openNeg('${a.id}')">
          <div class="ti-av" style="background:${userColor(a.vnd)}">${initials(a.vnd)}</div>
          <div class="ti-info"><div class="ti-name">${esc(a.cli)}</div><div class="ti-sub">${a.hora||'—'} · ${esc(a.vnd)}</div></div>
          <span class="tag ${sm.cls}">${sm.l}</span>
        </div>`;
      }).join('')}</div>`:`<div class="alert-empty">Sem agendamentos para hoje</div>`}
    </div>`;

  // Auto-refresh a cada 2 minutos se a aba estiver ativa
  _confRefreshTimer = setTimeout(() => {
    const active = document.querySelector('.view.on');
    if (active && active.id === 'v-conf') renderConf();
  }, 120000);
}

let _leadNotifSub=null;
let _crmBadgeCount=0;

function showVndPassNotif(a){
  const sub=`${esc(a.cli||a.tel)} · ${a.modelo?esc(a.modelo)+' · ':''}Briefing disponível`;
  const el=document.getElementById('vnd-pass-notif');
  const subEl=document.getElementById('vpn-sub');
  if(!el||!subEl) return;
  subEl.textContent=`${a.cli||a.tel}${a.modelo?' · '+a.modelo:''}`;
  el.classList.remove('hide'); el.classList.add('show');
  // Sound
  try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator();const g=ctx.createGain();osc.connect(g);g.connect(ctx.destination);osc.frequency.setValueAtTime(880,ctx.currentTime);g.gain.setValueAtTime(.18,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.start();osc.stop(ctx.currentTime+.35);}catch(e){}
  // Badge
  _crmBadgeCount++;
  _updateCrmBadge();
  // Auto-hide
  const bar=document.getElementById('vpn-bar');
  if(bar){bar.style.animation='none';bar.style.width='100%';void bar.offsetWidth;bar.style.transition='width 7s linear';bar.style.width='0%';}
  setTimeout(()=>closeVndNotif(),7200);
}

function closeVndNotif(){
  const el=document.getElementById('vnd-pass-notif');
  if(el){el.classList.remove('show');el.classList.add('hide');}
}

function _updateCrmBadge(){
  const btn=document.querySelector('#tab-nav button[onclick*="crm"]');
  if(!btn) return;
  let b=btn.querySelector('.crm-badge');
  if(_crmBadgeCount<=0){if(b)b.remove();return;}
  if(!b){b=document.createElement('span');b.className='crm-badge';btn.appendChild(b);}
  b.textContent=_crmBadgeCount;
}

function startRealtimeLeads(){
  if(_leadNotifSub){try{sb.removeChannel(_leadNotifSub);}catch(e){}}
  _leadNotifSub=sb.channel('eye-leads-rt2')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'eye_appts'},payload=>{
      const a=payload.new;
      if(CU.role==='vendedor') return;
      pushNotif('Novo lead chegou!',`${a.cli||a.tel} · ${a.orig||''}`);
      toast(`Novo lead: ${a.cli||a.tel}`);
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'eye_appts'},payload=>{
      const a=payload.new, old=payload.old;
      // Notifica vendedor quando lead é passado para ele
      if(CU.role==='vendedor'&&a.status==='passado_vendedor'&&old.status!=='passado_vendedor'&&a.vnd===CU.nome){
        showVndPassNotif(a);
        pushNotif('Lead passado para você!',`${a.cli||a.tel}${a.modelo?' · '+a.modelo:''}`);
        // Atualiza cache local
        const idx=_apptsCache.findIndex(x=>x.id===a.id);
        if(idx>=0) _apptsCache[idx]={..._apptsCache[idx],...a};
        else _apptsCache.push(a);
      } else if(CU.role!=='vendedor'&&a.status!==old.status){
        // Atualiza cache para gerência/sdr
        const idx=_apptsCache.findIndex(x=>x.id===a.id);
        if(idx>=0) _apptsCache[idx]={..._apptsCache[idx],...a};
      }
    })
    .subscribe();
}
