let CU = null;
let _appLaunched = false;

async function doLogin() {
  const loginVal = document.getElementById('li-user').value.trim();
  const senhaVal = document.getElementById('li-pass').value;
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Entrando…';

  const { data: u } = await sb.from('eye_users').select('*').eq('login', loginVal).maybeSingle();
  if (!u || u.senha !== senhaVal) {
    document.getElementById('li-err').style.display = 'block';
    const card = document.querySelector('.login-card');
    card.classList.remove('login-error'); void card.offsetWidth; card.classList.add('login-error');
    btn.disabled = false; btn.textContent = 'Entrar'; return;
  }
  document.getElementById('li-err').style.display = 'none';
  const eyeSvg = document.querySelector('.login-eye-svg');
  if (eyeSvg) eyeSvg.classList.add('login-success');
  const { senha: _stripped, ...cuSafe } = u;
  CU = { ...cuSafe, loginTs: Date.now() };
  localStorage.setItem('eye_cu', JSON.stringify(CU));
  // Iris fills screen then app appears
  const ov = document.getElementById('iris-overlay');
  if (ov) {
    ov.classList.add('iris-fire');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ov.classList.add('iris-expand');
        setTimeout(() => {
          showApp();
          ov.classList.add('iris-done');
          setTimeout(() => { ov.classList.remove('iris-fire','iris-expand','iris-done'); }, 600);
        }, 520);
      });
    });
  } else {
    setTimeout(showApp, 500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('li-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

function doLogout() {
  CU = null; _usersCache = null; _apptsCache = []; _activeUnit = null; _tasksCache = []; _unidades = []; _appLaunched = false; if(typeof _crmBadgeCount!=='undefined') _crmBadgeCount=0;
  localStorage.removeItem('eye_cu');
  document.getElementById('li-user').value = '';
  document.getElementById('li-pass').value = '';
  document.getElementById('li-err').style.display = 'none';
  document.getElementById('btn-login').disabled = false;
  document.getElementById('btn-login').textContent = 'Entrar';
  show('s-login');
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('on'); s.style.display = 'none'; });
  const el = document.getElementById(id);
  el.classList.add('on'); el.style.display = 'flex';
  if (id === 's-login')  history.replaceState({}, '', '/login');
  if (id === 's-units')  history.replaceState({}, '', '/unidades');
}

async function showApp(initialTab = 'inicio') {
  document.getElementById('top-username').textContent = CU.nome;
  const rb = document.getElementById('top-role-badge');
  rb.textContent = ROLE_LABELS[CU.role] || CU.role;
  rb.className = 'top-role-badge ' + (CU.role === 'master' ? 'rb-mst' : CU.role === 'gerencia' ? 'rb-ger' : CU.role === 'sdr' ? 'rb-sdr' : 'rb-vnd');

  if (CU.role === 'master') {
    show('s-units');
    renderUnitsSelector();
    return;
  }

  show('s-app');
  const unitWrap = document.getElementById('unit-selector-wrap');
  if (CU.unidade_id) {
    const uns = await getUnidades();
    const unit = uns.find(u => u.id === CU.unidade_id);
    if (unit) {
      unitWrap.innerHTML = `<span class="unit-badge">${unit.nome}</span>`;
      unitWrap.style.display = 'flex';
    }
  } else {
    unitWrap.style.display = 'none';
  }
  buildNav();
  goTab(initialTab);
  setTimeout(showHotLeadNotif, 8000);
  setTimeout(checkTomorrowAppts, 14000);
  requestNotifPerm();
  startRealtimeLeads();
}

let _mstPeriod = 'hoje';
let _mstCards  = [];

async function renderUnitsSelector() {
  if (!document.getElementById('eye-master-styles')) {
    const s = document.createElement('style');
    s.id = 'eye-master-styles';
    s.textContent = `
      .mst-controls{display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center}
      .mst-period-btn{border:1.5px solid rgba(91,110,255,.25);background:transparent;color:var(--txt2);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
      .mst-period-btn.on{background:var(--ind);border-color:var(--ind);color:#fff}
      .mst-digest-btn{border:none;background:rgba(255,159,10,.12);color:var(--amb);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px}
      .mst-digest-btn:hover{background:rgba(255,159,10,.22)}
      .usc2-card{background:var(--card);border:1.5px solid var(--brd);border-radius:16px;padding:16px;cursor:pointer;transition:box-shadow .15s;position:relative}
      .usc2-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.12)}
      .usc2-grn{border-left:4px solid var(--grn)}
      .usc2-amb{border-left:4px solid var(--amb)}
      .usc2-red{border-left:4px solid var(--red)}
      .usc2-all{border-left:4px solid var(--ind)}
      .usc2-add{border-style:dashed;border-left:1.5px dashed var(--brd);cursor:pointer}
      .usc2-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
      .usc2-rank{font-size:24px;flex:none;width:32px;text-align:center}
      .usc2-info{flex:1;min-width:0}
      .usc2-name{font-size:15px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .usc2-city{font-size:11px;color:var(--txt3);margin-top:2px;display:flex;align-items:center;gap:3px}
      .usc2-saude{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:8px;padding:3px 8px;flex:none}
      .usc2-saude-grn{background:rgba(52,199,89,.12);color:var(--grn)}
      .usc2-saude-amb{background:rgba(255,159,10,.12);color:var(--amb)}
      .usc2-saude-red{background:rgba(255,59,48,.1);color:var(--red)}
      .usc2-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
      .usc2-kpi{text-align:center}
      .usc2-val{display:block;font-size:18px;font-weight:800;color:var(--txt);letter-spacing:-0.5px}
      .usc2-lbl{display:block;font-size:10px;color:var(--txt3);font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-top:1px}
      .usc2-team{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--txt2);font-weight:500}
      .usc2-team i{margin-right:2px;vertical-align:-1px}
      .mst-digest-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px)}
      .mst-digest-panel{background:var(--card);border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:85vh;overflow-y:auto;padding:24px 20px 32px}
      .mst-digest-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
      .mst-digest-title{font-size:17px;font-weight:800;color:var(--txt)}
      .mst-digest-close{border:none;background:var(--bg2);color:var(--txt2);border-radius:50%;width:32px;height:32px;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .mst-digest-sec{margin-bottom:20px}
      .mst-digest-sec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--txt3);margin-bottom:10px}
      .mst-snapshot-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--brd)}
      .mst-snapshot-row:last-child{border-bottom:none}
      .mst-snap-label{font-size:13px;color:var(--txt2)}
      .mst-snap-val{font-size:13px;font-weight:700;color:var(--txt)}
      .mst-risk-item{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,59,48,.06);border:1px solid rgba(255,59,48,.15);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:background .15s}
      .mst-risk-item:hover{background:rgba(255,59,48,.11)}
      .mst-risk-icon{font-size:16px;flex:none;margin-top:2px}
      .mst-risk-text{flex:1;font-size:12px;color:var(--txt2);line-height:1.5}
      .mst-risk-text b{color:var(--txt);font-weight:700}
      .mst-rank-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--brd);cursor:pointer;transition:opacity .15s}
      .mst-rank-row:last-child{border-bottom:none}
      .mst-rank-row:hover{opacity:.7}
      .mst-rank-medal{font-size:16px;width:24px;text-align:center;flex:none}
      .mst-rank-name{flex:1;font-size:13px;font-weight:600;color:var(--txt)}
      .mst-rank-kpis{font-size:11px;color:var(--txt3);text-align:right}
      @keyframes spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }

  const grid  = document.getElementById('units-grid');
  const subEl = document.getElementById('units-sel-sub');

  grid.innerHTML = '<div class="units-loading">Carregando…</div>';

  const uns   = await getUnidades();
  const users = await getUsers();

  const now  = new Date();
  const hoje = now.toISOString().split('T')[0];
  const startDate = hoje + 'T00:00:00';
  const duasHAtras = new Date(Date.now() - 7200000).toISOString();
  const ACTIVE = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','ficha_enviada'];

  const cards = await Promise.all(uns.map(async u => {
    const [rLeads, rVendas, rAlerts, rAg] = await Promise.all([
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',startDate),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','venda_concluida').gte('criado_em',startDate),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).in('status',ACTIVE).lt('em',duasHAtras),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','agendado').eq('data',hoje),
    ]);
    const leads   = rLeads.count  || 0;
    const vendas  = rVendas.count || 0;
    const alertas = rAlerts.count || 0;
    const agendados = rAg.count   || 0;
    const sdrs = users.filter(u2 => u2.unidade_id === u.id && u2.role === 'sdr').length;
    const vnds = users.filter(u2 => u2.unidade_id === u.id && u2.role === 'vendedor').length;
    const saude = alertas === 0 && (vendas > 0 || leads === 0) ? 'otima'
                : alertas <= 4 ? 'atencao' : 'critico';
    const saudeCor   = saude === 'otima' ? 'grn' : saude === 'atencao' ? 'amb' : 'red';
    const saudeLabel = saude === 'otima' ? 'Saúde ótima' : saude === 'atencao' ? 'Atenção' : 'Crítico';
    return { ...u, leads, vendas, alertas, agendados, sdrs, vnds, saude, saudeCor, saudeLabel };
  }));

  cards.sort((a, b) => b.leads - a.leads);
  _mstCards = cards;

  const totLeads  = cards.reduce((s,c) => s+c.leads,    0);
  const totVendas = cards.reduce((s,c) => s+c.vendas,   0);
  const totAg     = cards.reduce((s,c) => s+c.agendados,0);
  const totAlerts = cards.reduce((s,c) => s+c.alertas,  0);
  if (subEl) subEl.textContent = `${uns.length} unidade${uns.length!==1?'s':''} · ${totLeads} leads`;

  const medals = ['🥇','🥈','🥉'];
  grid.innerHTML = cards.map((u, i) => `
    <div class="usc2-card usc2-${u.saudeCor}" onclick="enterUnit('${u.id}')">
      <div class="usc2-top">
        <div class="usc2-rank">${medals[i] || `#${i+1}`}</div>
        <div class="usc2-info">
          <div class="usc2-name">${esc(u.nome)}</div>
          ${u.cidade ? `<div class="usc2-city"><i class="ti ti-map-pin"></i> ${esc(u.cidade)}</div>` : ''}
        </div>
        <div class="usc2-saude usc2-saude-${u.saudeCor}">${u.saudeLabel}</div>
      </div>
      <div class="usc2-kpis">
        <div class="usc2-kpi"><span class="usc2-val">${u.leads}</span><span class="usc2-lbl">Leads</span></div>
        <div class="usc2-kpi"><span class="usc2-val">${u.agendados}</span><span class="usc2-lbl">Agendados</span></div>
        <div class="usc2-kpi"><span class="usc2-val">${u.vendas}</span><span class="usc2-lbl">Conversões</span></div>
        <div class="usc2-kpi"><span class="usc2-val" style="color:${u.alertas>5?'var(--red)':u.alertas>2?'var(--amb)':'inherit'}">${u.alertas}</span><span class="usc2-lbl">Alertas</span></div>
      </div>
      <div class="usc2-team">
        <span><i class="ti ti-headset"></i> ${u.sdrs} SDR${u.sdrs!==1?'s':''}</span>
        <span><i class="ti ti-user-dollar"></i> ${u.vnds} Vendedor${u.vnds!==1?'es':''}</span>
        ${u.alertas > 0 ? `<span style="color:var(--red);font-weight:700"><i class="ti ti-alert-triangle"></i> ${u.alertas} parado${u.alertas>1?'s':''}</span>` : ''}
      </div>
    </div>`).join('')
  + (uns.length > 1 ? `
    <div class="usc2-card usc2-all" onclick="enterUnit(null)">
      <div class="usc2-top">
        <div class="usc2-rank" style="font-size:20px">📊</div>
        <div class="usc2-info">
          <div class="usc2-name" style="color:var(--ind)">Todas as unidades</div>
          <div class="usc2-city">Visão consolidada</div>
        </div>
      </div>
      <div class="usc2-kpis">
        <div class="usc2-kpi"><span class="usc2-val">${totLeads}</span><span class="usc2-lbl">Leads</span></div>
        <div class="usc2-kpi"><span class="usc2-val">${totAg}</span><span class="usc2-lbl">Agendados</span></div>
        <div class="usc2-kpi"><span class="usc2-val">${totVendas}</span><span class="usc2-lbl">Conversões</span></div>
        <div class="usc2-kpi"><span class="usc2-val" style="color:${totAlerts>5?'var(--red)':totAlerts>0?'var(--amb)':'inherit'}">${totAlerts}</span><span class="usc2-lbl">Alertas</span></div>
      </div>
    </div>` : '')
  + `
    <div class="usc2-card usc2-add" onclick="openNewUnit()">
      <div class="usc2-top">
        <div class="usc2-rank" style="font-size:26px;color:var(--ind)">+</div>
        <div class="usc2-info">
          <div class="usc2-name" style="color:var(--ind)">Nova unidade</div>
          <div class="usc2-city">Adicionar ao sistema</div>
        </div>
      </div>
    </div>`;
}

async function _mstDigest(period) {
  period = period || _mstPeriod || 'hoje';

  document.getElementById('mst-digest-ov')?.remove();
  const ov = document.createElement('div');
  ov.id = 'mst-digest-ov';
  ov.className = 'mst-digest-ov';
  ov.innerHTML = `<div class="mst-digest-panel"><div style="text-align:center;padding:40px 0;color:var(--txt3)"><i class="ti ti-loader" style="font-size:28px;animation:spin 1s linear infinite"></i><p style="margin-top:10px;font-size:13px">Carregando dados…</p></div></div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);

  const uns   = await getUnidades();
  const users = await getUsers();
  const now   = new Date();
  const hoje  = now.toISOString().split('T')[0];
  const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const startDate = period === 'hoje' ? hoje + 'T00:00:00'
    : new Date(Date.now() - (period === '7d' ? 7 : 30) * 86400000).toISOString().split('T')[0] + 'T00:00:00';
  const meia_hora_atras = new Date(Date.now() - 1800000).toISOString();
  const duas_h_atras    = new Date(Date.now() - 7200000).toISOString();
  const ACTIVE = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','ficha_enviada'];

  const cards = await Promise.all(uns.map(async u => {
    const [rLeads, rOntem, rVendas, rAlerts30, rAlerts2h, rAg] = await Promise.all([
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',startDate),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).gte('criado_em',ontem+'T00:00:00').lt('criado_em',hoje+'T00:00:00'),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','venda_concluida').gte('criado_em',startDate),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).in('status',ACTIVE).lt('em',meia_hora_atras),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).in('status',ACTIVE).lt('em',duas_h_atras),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id',u.id).eq('status','agendado').eq('data',hoje),
    ]);
    const leads    = rLeads.count   || 0;
    const ontemN   = rOntem.count   || 0;
    const vendas   = rVendas.count  || 0;
    const alerta30 = rAlerts30.count|| 0;
    const alerta2h = rAlerts2h.count|| 0;
    const agendados= rAg.count      || 0;
    const sdrs = users.filter(u2 => u2.unidade_id === u.id && u2.role === 'sdr').length;
    const vnds = users.filter(u2 => u2.unidade_id === u.id && u2.role === 'vendedor').length;
    return { ...u, leads, ontemN, vendas, alerta30, alerta2h, agendados, sdrs, vnds };
  }));

  cards.sort((a, b) => b.leads - a.leads);
  _mstCards = cards;

  const totLeads   = cards.reduce((s,c) => s+c.leads,   0);
  const totOntem   = cards.reduce((s,c) => s+c.ontemN,  0);
  const totVendas  = cards.reduce((s,c) => s+c.vendas,  0);
  const totAlerts  = cards.reduce((s,c) => s+c.alerta2h,0);
  const totAlerts30= cards.reduce((s,c) => s+c.alerta30,0);
  const totAg      = cards.reduce((s,c) => s+c.agendados,0);
  const taxaGlobal = totLeads > 0 ? Math.round(totVendas / totLeads * 100) : 0;
  const leadsVsOntem = period === 'hoje' && totOntem > 0
    ? (totLeads > totOntem ? `<span style="color:var(--grn);font-size:11px"> ↑ +${totLeads-totOntem} vs ontem</span>`
     : totLeads < totOntem ? `<span style="color:var(--red);font-size:11px"> ↓ -${totOntem-totLeads} vs ontem</span>` : '')
    : '';

  // Risks
  const risks = [];
  const pior2h = [...cards].filter(c => c.alerta2h > 0).sort((a,b) => b.alerta2h - a.alerta2h)[0];
  if (pior2h) risks.push({ icon:'🚨', uid:pior2h.id, text:`<b>${esc(pior2h.nome)}</b> tem <b>${pior2h.alerta2h} lead${pior2h.alerta2h>1?'s':''}</b> parado${pior2h.alerta2h>1?'s':''} há mais de 2h sem ação` });
  const pior30 = [...cards].filter(c => c.alerta30 > 0 && c !== pior2h).sort((a,b) => b.alerta30 - a.alerta30)[0];
  if (pior30 && risks.length < 3) risks.push({ icon:'⏱', uid:pior30.id, text:`<b>${esc(pior30.nome)}</b> tem <b>${pior30.alerta30} lead${pior30.alerta30>1?'s':''}</b> esperando resposta há +30min` });
  const semVendas = [...cards].filter(c => c.leads > 3 && c.vendas === 0).sort((a,b) => b.leads - a.leads)[0];
  if (semVendas && risks.length < 3) risks.push({ icon:'📉', uid:semVendas.id, text:`<b>${esc(semVendas.nome)}</b> tem <b>${semVendas.leads} leads</b> no período mas <b>0 conversões</b>` });
  const semAg = cards.find(c => c.agendados === 0 && c.leads > 0);
  if (semAg && risks.length < 3) risks.push({ icon:'📅', uid:semAg.id, text:`<b>${esc(semAg.nome)}</b> não tem nenhum agendamento para hoje` });
  const semTime = cards.find(c => (c.sdrs + c.vnds) === 0);
  if (semTime && risks.length < 3) risks.push({ icon:'👥', uid:semTime.id, text:`<b>${esc(semTime.nome)}</b> não tem nenhum usuário ativo cadastrado` });

  const hora = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const medals = ['🥇','🥈','🥉'];
  const periodoLabel = period === 'hoje' ? 'Hoje' : period === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias';

  const panel = ov.querySelector('.mst-digest-panel');
  panel.innerHTML = `
    <div class="mst-digest-hd">
      <div>
        <div class="mst-digest-title">☕ Morning Digest</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">Gerado às ${hora}</div>
      </div>
      <button class="mst-digest-close" onclick="document.getElementById('mst-digest-ov').remove()">×</button>
    </div>
    <div class="mst-controls" style="margin-bottom:18px;justify-content:flex-start">
      <button class="mst-period-btn${period==='hoje'?' on':''}" onclick="_mstDigest('hoje')">Hoje</button>
      <button class="mst-period-btn${period==='7d'?' on':''}" onclick="_mstDigest('7d')">7 dias</button>
      <button class="mst-period-btn${period==='30d'?' on':''}" onclick="_mstDigest('30d')">30 dias</button>
    </div>
    <div class="mst-digest-sec">
      <div class="mst-digest-sec-title">📊 Snapshot — ${periodoLabel}</div>
      <div class="mst-snapshot-row">
        <span class="mst-snap-label">Total de leads</span>
        <span class="mst-snap-val">${totLeads}${leadsVsOntem}</span>
      </div>
      <div class="mst-snapshot-row">
        <span class="mst-snap-label">Agendamentos hoje</span>
        <span class="mst-snap-val" style="color:${totAg>0?'var(--txt)':'var(--red)'}">${totAg}</span>
      </div>
      <div class="mst-snapshot-row">
        <span class="mst-snap-label">Conversões</span>
        <span class="mst-snap-val" style="color:${taxaGlobal>=8?'var(--grn)':taxaGlobal>=4?'var(--amb)':'var(--red)'}">${totVendas} <span style="font-weight:500;font-size:12px">(${taxaGlobal}% conversão)</span></span>
      </div>
      <div class="mst-snapshot-row">
        <span class="mst-snap-label">Leads parados >30min</span>
        <span class="mst-snap-val" style="color:${totAlerts30>3?'var(--red)':totAlerts30>0?'var(--amb)':'var(--grn)'}">${totAlerts30}</span>
      </div>
      <div class="mst-snapshot-row">
        <span class="mst-snap-label">Leads parados >2h</span>
        <span class="mst-snap-val" style="color:${totAlerts>2?'var(--red)':totAlerts>0?'var(--amb)':'var(--grn)'}">${totAlerts}</span>
      </div>
    </div>
    <div class="mst-digest-sec">
      <div class="mst-digest-sec-title">🚨 Top Riscos — Ação necessária</div>
      ${risks.length ? risks.map(r => `
        <div class="mst-risk-item" onclick="document.getElementById('mst-digest-ov').remove();enterUnit('${r.uid}')">
          <span class="mst-risk-icon">${r.icon}</span>
          <div class="mst-risk-text">${r.text}<br><span style="color:var(--ind);font-size:11px;font-weight:600">→ Entrar na unidade</span></div>
        </div>`).join('')
      : `<div style="text-align:center;padding:14px;color:var(--grn);font-weight:700;font-size:13px">✓ Nenhum risco crítico agora!</div>`}
    </div>
    <div class="mst-digest-sec">
      <div class="mst-digest-sec-title">👥 Time por unidade</div>
      ${cards.map(u => `
        <div class="mst-snapshot-row" style="cursor:pointer" onclick="document.getElementById('mst-digest-ov').remove();enterUnit('${u.id}')">
          <span class="mst-snap-label">${esc(u.nome)}</span>
          <span class="mst-snap-val" style="font-size:12px;font-weight:500">
            ${u.sdrs} SDR${u.sdrs!==1?'s':''} · ${u.vnds} vendedor${u.vnds!==1?'es':''}
            ${(u.sdrs+u.vnds)===0?'<span style="color:var(--red)"> ⚠</span>':''}
          </span>
        </div>`).join('')}
    </div>
    <div class="mst-digest-sec">
      <div class="mst-digest-sec-title">📈 Ranking — ${periodoLabel}</div>
      ${cards.map((u, i) => `
        <div class="mst-rank-row" onclick="document.getElementById('mst-digest-ov').remove();enterUnit('${u.id}')">
          <span class="mst-rank-medal">${medals[i]||`#${i+1}`}</span>
          <div style="flex:1;min-width:0">
            <div class="mst-rank-name">${esc(u.nome)}</div>
            <div class="mst-rank-kpis">${u.leads} leads · ${u.vendas} conv. · ${u.agendados} ag. hoje · ${u.alerta2h} alertas</div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${u.alerta2h>5?'var(--red)':u.alerta2h>0?'var(--amb)':'var(--grn)'}">${u.alerta2h>0?`⚠ ${u.alerta2h}`:'✓'}</span>
        </div>`).join('')}
    </div>`;
}

async function openNewUnit() {
  const users = await getUsers();
  const mgrs = users.filter(u => u.role === 'gerencia' || u.role === 'master');
  document.getElementById('nu-nome').value = '';
  document.getElementById('nu-cidade').value = '';
  document.getElementById('nu-bairro').value = '';
  document.getElementById('nu-wpp').value = '';
  document.getElementById('nu-end').value = '';
  document.getElementById('nu-gerente').innerHTML =
    '<option value="">Sem gerente definido</option>' +
    mgrs.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  document.getElementById('ov-nova-unidade').classList.add('on');
}

function closeNewUnit() { document.getElementById('ov-nova-unidade').classList.remove('on'); }

async function saveNewUnit() {
  const nome = document.getElementById('nu-nome').value.trim();
  if (!nome) { toast('Informe o nome da unidade', 'err'); return; }
  const payload = {
    id: uid(), nome,
    cidade: document.getElementById('nu-cidade').value.trim() || null,
    bairro: document.getElementById('nu-bairro').value.trim() || null,
    whatsapp: document.getElementById('nu-wpp').value.trim() || null,
    endereco: document.getElementById('nu-end').value.trim() || null,
    gerente_id: document.getElementById('nu-gerente').value || null,
    ativa: true,
  };
  const { error } = await sb.from('eye_unidades').insert(payload);
  if (error) { toast('Erro ao criar unidade. Tente novamente.', 'err'); return; }
  _unidades = [];
  closeNewUnit();
  toast('Unidade criada!');
  renderUnitsSelector();
}

async function enterUnit(unitId) {
  _activeUnit = unitId || null;
  _apptsCache = [];
  show('s-app');

  const unitWrap = document.getElementById('unit-selector-wrap');
  const uns = _unidades.length ? _unidades : await getUnidades();
  unitWrap.innerHTML = `
    <button onclick="show('s-units');renderUnitsSelector()" title="Trocar unidade" class="usc-back-btn"><i class="ti ti-grid-dots"></i></button>
    <select class="fi" style="height:32px;font-size:12px;margin:0" onchange="switchUnit(this.value)">
      <option value="">Todas as unidades</option>
      ${uns.map(u => `<option value="${u.id}" ${u.id === unitId ? 'selected' : ''}>${u.nome}</option>`).join('')}
    </select>
    ${CU.role === 'master' ? `<button onclick="_mstDigest()" title="Morning Digest" style="border:none;background:rgba(255,159,10,.12);color:var(--amb);border-radius:10px;height:32px;padding:0 12px;font-size:13px;cursor:pointer;font-weight:700;white-space:nowrap">☕</button>` : ''}`;
  unitWrap.style.display = 'flex';
  unitWrap.style.gap = '6px';
  unitWrap.style.alignItems = 'center';

  buildNav();
  goTab('inicio');
  if (!_appLaunched) {
    _appLaunched = true;
    setTimeout(showHotLeadNotif, 8000);
    setTimeout(checkTomorrowAppts, 14000);
    requestNotifPerm();
    startRealtimeLeads();
  }
}

async function switchUnit(unitId) {
  _activeUnit = unitId || null;
  _apptsCache = [];
  await getAppts();
  const active = document.querySelector('.view.on');
  if (active) goTab(active.id.replace('v-', ''));
}

function requestNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
function pushNotif(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
}

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────
function canEdit(a)  { return CU.role === 'gerencia' || CU.role === 'sdr' || CU.role === 'master' || a.vnd === CU.nome; }
function isMgr()     { return CU.role === 'gerencia' || CU.role === 'master'; }
function canDelete() { return CU.role === 'gerencia' || CU.role === 'sdr' || CU.role === 'master'; }

// ─── NAV ──────────────────────────────────────────────────────────────────────
function navGroups() {
  const ALL = {
    inicio:  { icon:'ti-home',            label:'Início'       },
    conv:    { icon:'ti-message-2',       label:'Conversas'    },
    crm:     { icon:'ti-layout-kanban',   label:'CRM'          },
    tarefas: { icon:'ti-checkbox',        label:'Tarefas'      },
    agenda:  { icon:'ti-calendar',        label:'Agenda'       },
    cal:     { icon:'ti-calendar-month',  label:'Calendário'   },
    retrab:  { icon:'ti-refresh',         label:'Retrabalho'   },
    negoc:   { icon:'ti-handshake',       label:'Pipeline'     },
    base:    { icon:'ti-database',        label:'Base de Dados'},
    bi:      { icon:'ti-chart-bar',       label:'BI'           },
    ativos:  { icon:'ti-car',             label:'Ativos'       },
    conf:    { icon:'ti-clipboard-list',  label:'Conferência'  },
    users:   { icon:'ti-users-group',     label:'Usuários'     },
    config:  { icon:'ti-settings',        label:'Config'       },
  };
  const mk = id => ({ id, ...ALL[id] });
  const groups = [
    { label:'Atendimento', ids:['inicio','conv','crm','tarefas','cal','retrab'], roles:null },
    { label:'Comercial',   ids:['base'],                                                  roles:['sdr','gerencia','master'] },
    { label:'Gestão',      ids:['negoc','bi','ativos','conf'],                            roles:['gerencia','master'] },
    { label:'Admin',       ids:CU.role==='master'?['users','config']:['users'],           roles:['gerencia','master'] },
  ];
  return groups
    .filter(g => !g.roles || g.roles.includes(CU.role))
    .map(g => ({ label:g.label, tabs:g.ids.filter(id=>ALL[id]).map(mk) }));
}

function buildNav() {
  const groups = navGroups();
  const sb = document.getElementById('tab-nav');
  const collapsed = localStorage.getItem('eye_sb') === '0';
  sb.classList.toggle('sb-collapsed', collapsed);

  const mkTab = t => `<button onclick="goTab('${t.id}')" data-t="${t.id}" title="${t.label}"><i class="ti ${t.icon}"></i><span class="nav-label">${t.label}</span></button>`;
  const mkGrp = g => `<div class="nav-group"><span class="nav-gl">${g.label}</span><div class="nav-tabs">${g.tabs.map(mkTab).join('')}</div></div>`;
  sb.innerHTML =
    `<button class="sb-ham" onclick="toggleSidebar()" title="Menu"><i class="ti ti-menu-2"></i><span class="sb-ham-label">eye</span></button>` +
    groups.map(mkGrp).join('');

  document.getElementById('mob-nav').innerHTML = groups.flatMap(g => g.tabs).map(mkTab).join('');
  setTimeout(refreshTaskBadge, 1500);
}

function toggleSidebar() {
  const sb = document.getElementById('tab-nav');
  const nowCollapsed = !sb.classList.contains('sb-collapsed');
  localStorage.setItem('eye_sb', nowCollapsed ? '0' : '1');
  buildNav();
}

function goTab(id) {
  if (id === 'agenda') id = 'cal';
  if (!_popStateNav) history.pushState({ tab: id }, '', '/' + id);
  _popStateNav = false;
  const logo = document.getElementById('eye-logo');
  if (logo) {
    logo.classList.remove('blink');
    void logo.offsetWidth;
    logo.classList.add('blink');
    logo.addEventListener('animationend', () => logo.classList.remove('blink'), { once: true });
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  const v = document.getElementById('v-' + id);
  if (v) v.classList.add('on');
  document.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  // Breadcrumb no topbar
  const crumb = document.getElementById('top-crumb');
  if (crumb) {
    const names = { inicio:'',conv:'Conversas',crm:'CRM',tarefas:'Tarefas',cal:'Calendário',retrab:'Retrabalho',origem:'Origens',negoc:'Pipeline',base:'Base de Dados',bi:'BI',ativos:'Ativos',conf:'Conferência',users:'Usuários',config:'Config' };
    const label = names[id] || id;
    crumb.textContent = label ? '/ ' + label : '';
    crumb.style.display = label ? 'inline' : 'none';
  }
  const renders = { inicio:renderInicio, conv:renderConv, crm:renderCrm, agenda:renderAgenda, cal:renderCal, origem:renderOrigem, negoc:renderNegoc, base:renderBase, bi:renderBi, ativos:renderAtivos, tarefas:renderTarefas, retrab:renderRetrab, conf:renderConf, users:renderUsers, config:renderConfig };
  if (renders[id]) renders[id]();
}
