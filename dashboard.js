function _renderFunnelSVG(funnel) {
  const W = 640, H = 130, PAD_BOT = 52, SVG_H = H + PAD_BOT;
  const n = funnel.length;
  const segW = W / n;
  const maxN = Math.max(...funnel.map(f => f.n), 1);
  const MIN_H = 16, MAX_H = H - 10;
  const colors = ['#5B6EFF','#8B9DFF','#FF9F0A','#34C759'];

  const hs = funnel.map(f => Math.round(MIN_H + (f.n / maxN) * (MAX_H - MIN_H)));

  const defs = funnel.map((f, i) => {
    const c = colors[i] || '#5B6EFF';
    return `<linearGradient id="fg${i}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${c}" stop-opacity=".92"/>
      <stop offset="100%" stop-color="${c}" stop-opacity=".72"/>
    </linearGradient>`;
  }).join('');

  const segs = funnel.map((f, i) => {
    const x = i * segW;
    const h1 = hs[i];
    const h2 = i < n - 1 ? hs[i + 1] : Math.round(hs[i] * 0.62);
    const y1t = (H - h1) / 2, y1b = y1t + h1;
    const y2t = (H - h2) / 2, y2b = y2t + h2;
    const cx = x + segW / 2;
    const pct = i === 0 ? 100 : (funnel[0].n > 0 ? Math.round(f.n / funnel[0].n * 100) : 0);
    const txtY = H / 2 + 4;
    return `<path d="M${x},${y1t} L${x+segW},${y2t} L${x+segW},${y2b} L${x},${y1b}Z" fill="url(#fg${i})"/>
      <text x="${cx}" y="${txtY}" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,.95)" letter-spacing=".2">${pct}%</text>
      <text x="${cx}" y="${H + 22}" text-anchor="middle" font-family="Inter,sans-serif" font-size="26" font-weight="800" fill="#1C1C1E" letter-spacing="-1">${f.n}</text>
      <text x="${cx}" y="${H + 42}" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#8E8E93" letter-spacing=".4">${f.l.toUpperCase()}</text>`;
  }).join('');

  return `<div class="funnel-svg-wrap"><svg viewBox="0 0 ${W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%"><defs>${defs}</defs>${segs}</svg></div>`;
}

async function _mstQuickFetch() {
  const uns  = await getUnidades();
  const hoje = new Date().toISOString().split('T')[0];
  const ontem = new Date(Date.now()-86400000).toISOString().split('T')[0];
  const duas_h = new Date(Date.now()-7200000).toISOString();
  const ACTIVE = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','ficha_enviada'];
  const cards = await Promise.all(uns.map(async u => {
    const [rL,rO,rV,rA,rAg] = await Promise.all([
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',hoje+'T00:00:00'),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',ontem+'T00:00:00').lt('criado_em',hoje+'T00:00:00'),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','venda_concluida').gte('criado_em',hoje+'T00:00:00'),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).in('status',ACTIVE).lt('em',duas_h),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','agendado').eq('data',hoje),
    ]);
    return { ...u, leads:rL.count||0, ontem:rO.count||0, vendas:rV.count||0, alertas:rA.count||0, agendados:rAg.count||0 };
  }));
  cards.sort((a,b) => b.leads - a.leads);
  if (typeof _mstCards !== 'undefined') _mstCards = cards;
  return cards;
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

  // Master: cross-unit data. Others: tasks assigned to this user
  let mstCards = [];
  let myTasks = { vencidas:[], hoje:[], futuras:[] };
  if (CU.role === 'master') {
    mstCards = await _mstQuickFetch();
  } else {
    const allTasks = await getTasks();
    const myT = allTasks.filter(t => !t.concluida && t.responsavel === CU.nome);
    myTasks.vencidas = myT.filter(t => t.vencimento && t.vencimento < today);
    myTasks.hoje     = myT.filter(t => t.vencimento === today);
    myTasks.futuras  = myT.filter(t => !t.vencimento || t.vencimento > today);
  }
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
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Total de leads</div><div class="kpi-icon">📋</div></div><div class="kv">${myAppts.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Agendamentos hoje</div><div class="kpi-icon">📅</div></div><div class="kv">${todayAppts.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Vendas no mês</div><div class="kpi-icon">✅</div></div><div class="kv">${realizedMonth.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Leads parados</div><div class="kpi-icon">⚠️</div></div><div class="kv${hotLeads.length>0?' alert':''}">${hotLeads.length}</div></div>
    </div>
    ${CU.role === 'master' ? (() => {
      const hora = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const tL   = mstCards.reduce((s,c)=>s+c.leads,   0);
      const tO   = mstCards.reduce((s,c)=>s+c.ontem,   0);
      const tV   = mstCards.reduce((s,c)=>s+c.vendas,  0);
      const tA   = mstCards.reduce((s,c)=>s+c.alertas, 0);
      const tAg  = mstCards.reduce((s,c)=>s+c.agendados,0);
      const taxa = tL>0 ? Math.round(tV/tL*100) : 0;
      const trendV = tL>tO ? `<span style="color:var(--grn);font-size:10px"> ↑ +${tL-tO}</span>` : tL<tO ? `<span style="color:var(--red);font-size:10px"> ↓ -${tO-tL}</span>` : '';
      const medals = ['🥇','🥈','🥉'];
      return `<div class="dash-row">
        <div class="dash-box">
          <div class="dash-box-title" style="display:flex;align-items:center;justify-content:space-between">
            Snapshot
            <button onclick="_mstDigest()" style="border:none;background:rgba(255,159,10,.12);color:var(--amb);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">☕ Digest</button>
          </div>
          <div style="font-size:11px;color:var(--txt3);margin-bottom:10px">Todas as unidades · ${hora}</div>
          <div class="alert-item"><div class="alert-dot" style="background:var(--ind)"></div><div class="alert-txt">Leads hoje</div><div class="alert-count">${tL}${trendV}</div></div>
          <div class="alert-item"><div class="alert-dot" style="background:var(--amb)"></div><div class="alert-txt">Agendamentos hoje</div><div class="alert-count">${tAg}</div></div>
          <div class="alert-item"><div class="alert-dot" style="background:var(--grn)"></div><div class="alert-txt">Conversões hoje</div><div class="alert-count" style="color:${taxa>=8?'var(--grn)':taxa>=4?'var(--amb)':'var(--red)'}">${tV} (${taxa}%)</div></div>
          <div class="alert-item"><div class="alert-dot" style="background:var(--red)"></div><div class="alert-txt">Alertas ativos >2h</div><div class="alert-count" style="color:${tA>3?'var(--red)':tA>0?'var(--amb)':'var(--grn)'}">${tA}</div></div>
        </div>
        <div class="dash-box">
          <div class="dash-box-title">Ranking de unidades</div>
          ${mstCards.length ? mstCards.map((u,i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bdr);cursor:pointer" onclick="switchUnit('${u.id}')" title="Ir para ${esc(u.nome)}">
              <span style="font-size:15px;flex:none;width:22px;text-align:center">${medals[i]||`<span style='font-size:11px;color:var(--txt3)'>#${i+1}</span>`}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.nome)}</div>
                <div style="font-size:11px;color:var(--txt3)">${u.leads} leads · ${u.vendas} conv. · ${u.agendados} ag.</div>
              </div>
              <span style="font-size:11px;font-weight:700;flex:none;color:${u.alertas>3?'var(--red)':u.alertas>0?'var(--amb)':'var(--grn)'}">${u.alertas>0?`⚠ ${u.alertas}`:'✓'}</span>
            </div>`).join('')
          : `<div class="alert-empty">Nenhuma unidade encontrada</div>`}
        </div>
      </div>`;
    })() : `<div class="dash-row">
      <div class="dash-box">
        <div class="dash-box-title" style="display:flex;align-items:center;justify-content:space-between">
          Minhas Tarefas
          <button onclick="goTab('tarefas')" style="border:none;background:transparent;color:var(--ind);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;padding:0">Ver todas →</button>
        </div>
        ${myTasks.vencidas.length||myTasks.hoje.length||myTasks.futuras.length?`
          ${myTasks.vencidas.slice(0,2).map(t=>`
            <div class="alert-item" onclick="goTab('tarefas')" style="cursor:pointer">
              <div class="alert-dot" style="background:var(--red)"></div>
              <div class="alert-txt" style="color:var(--red);font-weight:600"><i class="ti ${TASK_ICONS[t.tipo]||'ti-checkbox'}" style="font-size:11px;margin-right:2px"></i>${esc(t.descricao||TASK_LABELS[t.tipo]||'Tarefa')}</div>
              <div class="alert-count" style="color:var(--red);font-size:10px">${fmtDate(t.vencimento)}</div>
            </div>`).join('')}
          ${myTasks.vencidas.length>2?`<div class="alert-item"><div class="alert-dot" style="background:var(--red)"></div><div class="alert-txt" style="color:var(--red)">+${myTasks.vencidas.length-2} vencida${myTasks.vencidas.length-2!==1?'s':''}</div></div>`:''}
          ${myTasks.hoje.slice(0,2).map(t=>`
            <div class="alert-item" onclick="goTab('tarefas')" style="cursor:pointer">
              <div class="alert-dot" style="background:var(--amb)"></div>
              <div class="alert-txt"><i class="ti ${TASK_ICONS[t.tipo]||'ti-checkbox'}" style="font-size:11px;margin-right:2px"></i>${esc(t.descricao||TASK_LABELS[t.tipo]||'Tarefa')}</div>
              <div class="alert-count" style="color:var(--amb)">Hoje${t.hora?' · '+t.hora:''}</div>
            </div>`).join('')}
          ${myTasks.hoje.length>2?`<div class="alert-item"><div class="alert-dot" style="background:var(--amb)"></div><div class="alert-txt" style="color:var(--amb)">+${myTasks.hoje.length-2} para hoje</div></div>`:''}
          ${myTasks.futuras.length?`<div class="alert-item"><div class="alert-dot" style="background:var(--ind)"></div><div class="alert-txt">${myTasks.futuras.length} próxima${myTasks.futuras.length!==1?'s':''}</div><div class="alert-count" style="color:var(--txt3)">futuras</div></div>`:''}
        `:`<div class="alert-empty">✅ Nenhuma tarefa pendente</div>`}
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Meta pessoal do mês</div>
        <div class="meta-header"><span>Realizadas: <b>${realizedMonth.length}</b></span><input class="meta-input" type="number" id="meta-input" value="${meta}" min="1" onchange="saveMeta(this.value)"></div>
        <div class="meta-bar-bg"><div class="meta-bar-fill" style="--w:${pct}%;width:${pct}%"></div></div>
        <div class="meta-label">${pct}% da meta · ${Math.max(0,meta-realizedMonth.length)} restantes</div>
      </div>
    </div>`}
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

// ─── BI CROSS-UNIT (master: todas as unidades) ────────────────────────────────
let _mstBiPeriod = '7d';

async function renderMstBi() {
  const el = document.getElementById('v-mst-bi');
  if (!el) return;
  loading(el);

  if (!document.getElementById('eye-mst-bi-styles')) {
    const s = document.createElement('style');
    s.id = 'eye-mst-bi-styles';
    s.textContent = `
      .mst-bi-table{width:100%;border-collapse:collapse;font-size:13px}
      .mst-bi-table th{text-align:left;padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--txt3);border-bottom:2px solid var(--bdr);white-space:nowrap}
      .mst-bi-table td{padding:10px 12px;border-bottom:1px solid var(--bdr);vertical-align:middle}
      .mst-bi-table tr:last-child td{border-bottom:none}
      .mst-bi-table td:first-child{font-size:12px;color:var(--txt2);font-weight:500;white-space:nowrap}
      .mst-bi-hl td{background:rgba(91,110,255,.04)}
      .mst-bi-trend{font-size:10px;font-weight:700;margin-left:5px;padding:1px 6px;border-radius:4px;display:inline-block}
      .mst-bi-trend.up{color:var(--grn);background:rgba(52,199,89,.1)}
      .mst-bi-trend.dn{color:var(--red);background:rgba(255,59,48,.08)}
    `;
    document.head.appendChild(s);
  }

  const uns  = await getUnidades();
  const now  = new Date();
  const hoje = now.toISOString().split('T')[0];
  const days = _mstBiPeriod === 'hoje' ? 1 : _mstBiPeriod === '7d' ? 7 : 30;
  const startTs = new Date(Date.now() - days * 86400000).toISOString().split('T')[0] + 'T00:00:00';
  const prevTs  = new Date(Date.now() - days * 2 * 86400000).toISOString().split('T')[0] + 'T00:00:00';
  const duas_h  = new Date(Date.now() - 7200000).toISOString();
  const ACTIVE  = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','ficha_enviada'];

  const unData = await Promise.all(uns.map(async u => {
    const [rAppts, rPrev, rAlerts] = await Promise.all([
      sb.from('eye_appts').select('id,status,criado_em').eq('unidade_id',u.id).gte('criado_em',startTs),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',prevTs).lt('criado_em',startTs),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).in('status',ACTIVE).lt('em',duas_h),
    ]);
    const appts  = rAppts.data || [];
    const leads  = appts.length;
    const vendas = appts.filter(a => a.status === 'venda_concluida').length;
    const agnd   = appts.filter(a => ['agendado','passado_vendedor','em_negociacao','ficha_enviada','venda_concluida'].includes(a.status)).length;
    const taxaAg = leads > 0 ? Math.round(agnd/leads*100) : 0;
    const taxaCv = leads > 0 ? Math.round(vendas/leads*100) : 0;
    const prev   = rPrev.count || 0;
    const trend  = prev > 0 ? Math.round((leads-prev)/prev*100) : null;
    const byDay  = {};
    appts.forEach(a => { const d=(a.criado_em||'').slice(0,10); if(d) byDay[d]=(byDay[d]||0)+1; });
    return { ...u, leads, vendas, agnd, taxaAg, taxaCv, alertas:rAlerts.count||0, trend, byDay, prev };
  }));

  unData.sort((a,b) => b.leads - a.leads);

  const dates = Array.from({length:days},(_,i) => {
    const d = new Date(Date.now()-(days-1-i)*86400000);
    return d.toISOString().split('T')[0];
  });

  const UC  = ['#007AFF','#34C759','#FF9F0A','#5856D6','#FF3B30','#2DD4A7'];
  const medals = ['🥇','🥈','🥉'];
  const periodoLabel = _mstBiPeriod==='hoje'?'Hoje':_mstBiPeriod==='7d'?'Últimos 7 dias':'Últimos 30 dias';
  const totLeads  = unData.reduce((s,u)=>s+u.leads,0);
  const totVendas = unData.reduce((s,u)=>s+u.vendas,0);
  const totAlerts = unData.reduce((s,u)=>s+u.alertas,0);
  const taxaGlobal = totLeads>0 ? Math.round(totVendas/totLeads*100) : 0;

  el.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--txt);letter-spacing:-.5px">BI · Todas as unidades</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:2px">${periodoLabel} · ${uns.length} unidade${uns.length!==1?'s':''}</div>
      </div>
      <div class="bi-tabs">
        <button class="bi-tab${_mstBiPeriod==='hoje'?' on':''}" onclick="_mstBiSetPeriod('hoje')">Hoje</button>
        <button class="bi-tab${_mstBiPeriod==='7d'?' on':''}" onclick="_mstBiSetPeriod('7d')">7 dias</button>
        <button class="bi-tab${_mstBiPeriod==='30d'?' on':''}" onclick="_mstBiSetPeriod('30d')">30 dias</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Total leads</div><div class="kpi-icon">📋</div></div><div class="kv">${totLeads}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Conversões</div><div class="kpi-icon">✅</div></div><div class="kv" style="color:var(--grn)">${totVendas}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Taxa global</div><div class="kpi-icon">📈</div></div><div class="kv" style="color:${taxaGlobal>=8?'var(--grn)':taxaGlobal>=4?'var(--amb)':'var(--red)'}">${taxaGlobal}%</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Alertas ativos</div><div class="kpi-icon">⚠️</div></div><div class="kv${totAlerts>0?' alert':''}">${totAlerts}</div></div>
    </div>

    <div class="dash-box" style="overflow-x:auto;margin-bottom:16px">
      <div class="dash-box-title">Comparativo de unidades</div>
      <table class="mst-bi-table">
        <thead><tr>
          <th>Métrica</th>
          ${unData.map((u,i)=>`<th style="color:${UC[i%UC.length]}">${esc(u.nome)}</th>`).join('')}
        </tr></thead>
        <tbody>
          <tr class="mst-bi-hl">
            <td>Leads</td>
            ${unData.map((u,i)=>`<td style="font-weight:800;font-size:15px;color:${UC[i%UC.length]}">${u.leads}${u.trend!==null?`<span class="mst-bi-trend ${u.trend>=0?'up':'dn'}">${u.trend>0?'+':''}${u.trend}%</span>`:''}</td>`).join('')}
          </tr>
          <tr>
            <td>Agendados</td>
            ${unData.map(u=>`<td>${u.agnd} <span style="font-size:10px;color:var(--txt3)">${u.taxaAg}%</span></td>`).join('')}
          </tr>
          <tr class="mst-bi-hl">
            <td>Conversões</td>
            ${unData.map(u=>`<td style="font-weight:700;color:${u.taxaCv>=8?'var(--grn)':u.taxaCv>=4?'var(--amb)':'var(--red)'}">${u.vendas} <span style="font-size:10px;font-weight:500">${u.taxaCv}%</span></td>`).join('')}
          </tr>
          <tr>
            <td>Alertas ativos</td>
            ${unData.map(u=>`<td style="font-weight:600;color:${u.alertas>3?'var(--red)':u.alertas>0?'var(--amb)':'var(--grn)'}">${u.alertas>0?'⚠ '+u.alertas:'✓ 0'}</td>`).join('')}
          </tr>
          <tr>
            <td>Período anterior</td>
            ${unData.map(u=>`<td style="font-size:12px;color:var(--txt3)">${u.prev} leads</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>

    ${days > 1 ? `
    <div class="dash-box" style="margin-bottom:16px">
      <div class="dash-box-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        Leads por dia
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${unData.map((u,i)=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2)"><span style="width:12px;height:3px;background:${UC[i%UC.length]};display:inline-block;border-radius:2px"></span>${esc(u.nome)}</span>`).join('')}
        </div>
      </div>
      ${_mstBiLineChart(dates, unData, UC)}
    </div>` : ''}

    <div class="dash-box" style="margin-bottom:16px">
      <div class="dash-box-title">Taxa de conversão por unidade</div>
      ${unData.map((u,i)=>{
        const maxCv = Math.max(...unData.map(x=>x.taxaCv),1);
        const barW  = Math.round(u.taxaCv/maxCv*100);
        return `<div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font-size:14px">${medals[i]||`<span style="font-size:11px;color:var(--txt3);font-weight:600">#${i+1}</span>`}</span>
              <span style="font-size:13px;font-weight:600;color:var(--txt)">${esc(u.nome)}</span>
            </div>
            <span style="font-size:14px;font-weight:800;color:${u.taxaCv>=8?'var(--grn)':u.taxaCv>=4?'var(--amb)':'var(--red)'}">${u.taxaCv}%</span>
          </div>
          <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${UC[i%UC.length]};border-radius:4px;transition:.6s cubic-bezier(.34,1.56,.64,1)"></div>
          </div>
          <div style="font-size:11px;color:var(--txt3);margin-top:3px">${u.vendas} conversão${u.vendas!==1?'ões':''} de ${u.leads} leads</div>
        </div>`;
      }).join('')}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${unData.map((u,i)=>`
        <button onclick="switchUnit('${u.id}')" style="border:1.5px solid ${UC[i%UC.length]};background:transparent;border-radius:10px;padding:7px 14px;font-size:12px;font-weight:600;color:${UC[i%UC.length]};cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px">
          <i class="ti ti-login" style="font-size:13px"></i>${esc(u.nome)}
        </button>`).join('')}
    </div>`;
}

function _mstBiSetPeriod(p) {
  _mstBiPeriod = p;
  renderMstBi();
}

function _mstBiLineChart(dates, units, colors) {
  if (!dates || dates.length < 2) return '';
  const W=600, H=130, pt=8, pr=12, pb=28, pl=28;
  const cW=W-pl-pr, cH=H-pt-pb;
  const maxVal = Math.max(...units.flatMap(u=>dates.map(d=>u.byDay[d]||0)), 1);
  const xS = i => pl + (i/Math.max(dates.length-1,1))*cW;
  const yS = v => pt + cH - (v/maxVal)*cH;
  const gridVals = [0, Math.round(maxVal/2), maxVal];
  const grid = gridVals.map(v=>`<line x1="${pl}" y1="${yS(v).toFixed(1)}" x2="${W-pr}" y2="${yS(v).toFixed(1)}" stroke="rgba(142,142,147,.15)" stroke-width="1"/>`).join('');
  const yLbl = gridVals.map(v=>`<text x="${pl-4}" y="${(yS(v)+4).toFixed(1)}" text-anchor="end" font-family="Inter,sans-serif" font-size="9" fill="rgba(142,142,147,.7)">${v}</text>`).join('');
  const xIdx = [0, Math.floor(dates.length/2), dates.length-1];
  const xLbl = xIdx.map(i=>`<text x="${xS(i).toFixed(1)}" y="${H-4}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="rgba(142,142,147,.7)">${dates[i].slice(5).replace('-','/')}</text>`).join('');
  const lines = units.map((u,ui)=>{
    const color = colors[ui%colors.length];
    const pts   = dates.map((d,i)=>`${xS(i).toFixed(1)},${yS(u.byDay[d]||0).toFixed(1)}`).join(' ');
    const dots  = dates.map((d,i)=>{ const v=u.byDay[d]||0; return v?`<circle cx="${xS(i).toFixed(1)}" cy="${yS(v).toFixed(1)}" r="2.5" fill="${color}"/>`:'' }).join('');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>${dots}`;
  }).join('');
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;min-width:260px">${grid}${yLbl}${xLbl}${lines}</svg></div>`;
}

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
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Leads hoje</div><div class="kpi-icon">📥</div></div><div class="kv">${receivedToday.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Respondidos</div><div class="kpi-icon">💬</div></div><div class="kv">${respondedToday.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Sem contato +30min</div><div class="kpi-icon">⚠️</div></div><div class="kv${noContact.length>0?' alert':''}">${noContact.length}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Agend. hoje</div><div class="kpi-icon">📅</div></div><div class="kv">${agendados.length}</div></div>
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
