async function renderInicio() {
  const el=document.getElementById('v-inicio');
  loading(el);
  const appts=await getAppts();
  const myAppts=CU.role==='vendedor'?appts.filter(a=>a.vnd===CU.nome):appts;
  const now=new Date(), today=now.toISOString().split('T')[0];
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const todayAppts    =myAppts.filter(a=>a.data===today);
  const realizedMonth =myAppts.filter(a=>a.status==='realizado'&&(a.data||'').startsWith(monthKey));
  const potential     =myAppts.reduce((s,a)=>{const n=parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));return s+(isNaN(n)?0:n);},0);
  const hotLeads      =myAppts.filter(a=>['pendente','agendado'].includes(a.status)&&a.data<=today);
  const confirmedToday=myAppts.filter(a=>a.status==='confirmado'&&a.data===today);
  const realizedToday =myAppts.filter(a=>a.status==='realizado'&&a.data===today);

  const meta=parseInt(localStorage.getItem('eye_meta')||'10');
  const pct=Math.min(100,Math.round(realizedMonth.length/meta*100));
  const funnel=[
    {l:'Leads',     n:myAppts.length,                                                                                           bg:'#007AFF'},
    {l:'Agendados', n:myAppts.filter(a=>['agendado','confirmado','realizado'].includes(a.status)).length,                        bg:'#5B8FF9'},
    {l:'Realizados',n:myAppts.filter(a=>['confirmado','realizado'].includes(a.status)).length,                                   bg:'#34C759'},
    {l:'Vendidos',  n:myAppts.filter(a=>a.status==='realizado').length,                                                          bg:'#FF9F0A'},
  ];
  const ranking=CU.role!=='vendedor'?vendedores().map(v=>{
    const va=appts.filter(a=>a.vnd===v.nome);
    const vendidos=va.filter(a=>a.status==='realizado').length;
    const realizados=va.filter(a=>a.status==='confirmado').length;
    return{nome:v.nome,vendidos,realizados,total:va.length,conv:va.length>0?Math.round(vendidos/va.length*100):0};
  }).filter(v=>v.total>0).sort((a,b)=>b.vendidos-a.vendidos||b.total-a.total):[];

  const h=now.getHours(), grt=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const DAYS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const potFmt=potential>=1000?`R$ ${(potential/1000).toFixed(0)}k`:`R$ ${Math.round(potential)}`;

  el.innerHTML=`
    <div class="dash-greeting">
      <div class="dg-title">${grt}, ${CU.nome} 👋</div>
      <div class="dg-sub">${DAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-c" style="--kc:var(--ind)"><div class="kl">Total de leads</div><div class="kv" style="color:var(--ind)">${myAppts.length}</div></div>
      <div class="kpi-c" style="--kc:var(--amb)"><div class="kl">Agendamentos hoje</div><div class="kv" style="color:var(--amb)">${todayAppts.length}</div></div>
      <div class="kpi-c" style="--kc:var(--grn)"><div class="kl">Vendidos no mês</div><div class="kv" style="color:var(--grn)">${realizedMonth.length}</div></div>
      <div class="kpi-c" style="--kc:#9b59b6"><div class="kl">Potencial R$</div><div class="kv" style="color:#9b59b6;font-size:${potential>=1000?'20':'26'}px">${potFmt}</div></div>
    </div>
    <div class="dash-row">
      <div class="dash-box">
        <div class="dash-box-title">Alertas</div>
        ${hotLeads.length||confirmedToday.length||realizedToday.length?`
          ${hotLeads.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--red)"></div><div class="alert-txt">Leads sem resposta</div><div class="alert-count" style="color:var(--red)">${hotLeads.length}</div></div>`:''}
          ${confirmedToday.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--grn)"></div><div class="alert-txt">Visitas confirmadas</div><div class="alert-count" style="color:var(--grn)">${confirmedToday.length}</div></div>`:''}
          ${realizedToday.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--amb)"></div><div class="alert-txt">Vendidos hoje</div><div class="alert-count" style="color:var(--amb)">${realizedToday.length}</div></div>`:''}
        `:`<div class="alert-empty">✅ Tudo tranquilo hoje</div>`}
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Meta do mês</div>
        <div class="meta-header"><span>Realizados: <b>${realizedMonth.length}</b></span><input class="meta-input" type="number" id="meta-input" value="${meta}" min="1" onchange="saveMeta(this.value)"></div>
        <div class="meta-bar-bg"><div class="meta-bar-fill" style="--w:${pct}%;width:${pct}%"></div></div>
        <div class="meta-label">${pct}% da meta · ${Math.max(0,meta-realizedMonth.length)} restantes</div>
      </div>
    </div>
    <div class="dash-box">
      <div class="dash-box-title">Funil do mês</div>
      <div class="funnel">${funnel.map(f=>`<div class="funnel-seg" style="background:${f.bg}"><div class="fs-n">${f.n}</div><div>${f.l}</div></div>`).join('')}</div>
    </div>
    ${ranking.length?`<div class="dash-box">
      <div class="dash-box-title">Ranking de vendedores</div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${ranking.map((v,i)=>{
          const barW=ranking[0].vendidos>0?Math.round(v.vendidos/ranking[0].vendidos*100):0;
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg);border-radius:var(--rs)">
            <div style="font-size:16px;width:22px;text-align:center">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</div>
            <div class="ti-av" style="background:${userColor(v.nome)};width:30px;height:30px;font-size:10px">${initials(v.nome)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${v.nome}</div>
              <div style="height:4px;background:var(--bg2);border-radius:2px;margin-top:4px;overflow:hidden">
                <div style="height:100%;width:${barW}%;background:var(--grn);border-radius:2px;transition:.4s"></div>
              </div>
            </div>
            <div style="text-align:right;flex:none">
              <div style="font-size:16px;font-weight:800;color:var(--grn)">${v.vendidos}</div>
              <div style="font-size:10px;color:var(--txt3)">${v.realizados} realiz. · ${v.conv}%</div>
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
  const today=new Date().toISOString().split('T')[0];
  const lead=_apptsCache.find(a=>['pendente','agendado'].includes(a.status)&&(CU.role!=='vendedor'||a.vnd===CU.nome));
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

let _leadNotifSub=null;
function startRealtimeLeads(){
  if(_leadNotifSub){try{sb.removeChannel(_leadNotifSub);}catch(e){}}
  _leadNotifSub=sb.channel('eye-leads-rt')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'eye_appts'},payload=>{
      const a=payload.new; if(CU.role==='vendedor') return;
      pushNotif('Novo lead chegou!',`${a.cli||a.tel} · ${a.orig||''}`);
      toast(`Novo lead: ${a.cli||a.tel}`);
    }).subscribe();
}
