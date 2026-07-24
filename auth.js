let CU = null;
let _appLaunched = false;

async function doLogin() {
  const loginVal = document.getElementById('li-user').value.trim();
  const senhaVal = document.getElementById('li-pass').value;
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Entrando…';

  // Conta de recuperação master
  if (loginVal === 'eye' && senhaVal === 'eye@master2025') {
    CU = { id:'master', nome:'Master', login:'eye', role:'master', cor:'#1C1C1E', unidade_id: null, loginTs: Date.now() };
    localStorage.setItem('eye_cu', JSON.stringify(CU));
    showApp(); return;
  }

  // Busca apenas o usuário solicitado — não carrega senhas de todos para memória
  const { data: u } = await sb.from('eye_users').select('*').eq('login', loginVal).maybeSingle();
  if (!u || u.senha !== senhaVal) {
    document.getElementById('li-err').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar'; return;
  }
  document.getElementById('li-err').style.display = 'none';
  const { senha: _stripped, ...cuSafe } = u;
  CU = { ...cuSafe, loginTs: Date.now() };
  localStorage.setItem('eye_cu', JSON.stringify(CU));
  showApp();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('li-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

function doLogout() {
  CU = null; _usersCache = null; _apptsCache = []; _activeUnit = null; _tasksCache = []; _unidades = []; _appLaunched = false;
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
}

async function showApp() {
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
  goTab('inicio');
  setTimeout(showHotLeadNotif, 8000);
  setTimeout(checkTomorrowAppts, 14000);
  requestNotifPerm();
  startRealtimeLeads();
}

async function renderUnitsSelector() {
  const grid = document.getElementById('units-grid');
  const subEl = document.getElementById('units-sel-sub');
  grid.innerHTML = '<div class="units-loading">Carregando…</div>';

  const uns = await getUnidades();
  if (subEl) subEl.textContent = uns.length + ' unidade' + (uns.length !== 1 ? 's' : '');

  const hoje = new Date().toISOString().split('T')[0];
  const duasHAtras = new Date(Date.now() - 7200000).toISOString();
  const ACTIVE = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado'];

  const cards = await Promise.all(uns.map(async u => {
    const [r1, r2, r3] = await Promise.all([
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id', u.id).gte('criado_em', hoje + 'T00:00:00'),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id', u.id).eq('status','agendado').eq('data', hoje),
      sb.from('eye_appts').select('*',{count:'exact',head:true}).eq('unidade_id', u.id).in('status', ACTIVE).lt('em', duasHAtras),
    ]);
    const alertas = r3.count || 0;
    return { ...u, leadsHoje: r1.count||0, agendados: r2.count||0, alertas, cor: alertas>3?'red':alertas>0?'amb':'grn' };
  }));

  const totLeads = cards.reduce((s,c) => s+c.leadsHoje, 0);
  const totAg    = cards.reduce((s,c) => s+c.agendados, 0);

  grid.innerHTML = cards.map(u => `
    <div class="unit-sel-card u-${u.cor}" onclick="enterUnit('${u.id}')">
      <div class="usc-dot usc-dot-${u.cor}"></div>
      <div class="usc-name">${u.nome}</div>
      ${u.cidade ? `<div class="usc-city"><i class="ti ti-map-pin"></i> ${u.cidade}</div>` : '<div class="usc-city"></div>'}
      <div class="usc-kpis">
        <div class="usc-kpi"><span class="usc-val">${u.leadsHoje}</span><span class="usc-lbl">hoje</span></div>
        <div class="usc-kpi"><span class="usc-val">${u.agendados}</span><span class="usc-lbl">agendados</span></div>
        <div class="usc-kpi"><span class="usc-val">${u.alertas}</span><span class="usc-lbl">alertas</span></div>
      </div>
      ${u.alertas > 0 ? `<div class="usc-alert-tag">⚠ ${u.alertas} parado${u.alertas>1?'s':''}</div>` : ''}
    </div>`).join('') + (uns.length > 1 ? `
    <div class="unit-sel-card u-all" onclick="enterUnit(null)">
      <div class="usc-dot" style="background:var(--ind)"></div>
      <div class="usc-name" style="color:var(--ind)">Todas as unidades</div>
      <div class="usc-city">Visão consolidada</div>
      <div class="usc-kpis">
        <div class="usc-kpi"><span class="usc-val">${totLeads}</span><span class="usc-lbl">hoje</span></div>
        <div class="usc-kpi"><span class="usc-val">${totAg}</span><span class="usc-lbl">agendados</span></div>
      </div>
    </div>` : '');
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
    </select>`;
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
    origem:  { icon:'ti-chart-pie',       label:'Origens'      },
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
    { label:'Atendimento', ids:['inicio','conv','crm','tarefas','agenda','cal','retrab'], roles:null },
    { label:'Comercial',   ids:['origem','negoc','base'],                                 roles:['sdr','gerencia','master'] },
    { label:'Gestão',      ids:['bi','ativos','conf'],                                    roles:['gerencia','master'] },
    { label:'Admin',       ids:CU.role==='master'?['users','config']:['users'],           roles:['gerencia','master'] },
  ];
  return groups
    .filter(g => !g.roles || g.roles.includes(CU.role))
    .map(g => ({ label:g.label, tabs:g.ids.map(mk) }));
}

function buildNav() {
  const groups = navGroups();
  const mkTab  = t => `<button onclick="goTab('${t.id}')" data-t="${t.id}"><i class="ti ${t.icon}"></i>${t.label}</button>`;
  const mkGrp  = g => `<div class="nav-group"><span class="nav-gl">${g.label}</span><div class="nav-tabs">${g.tabs.map(mkTab).join('')}</div></div>`;
  document.getElementById('tab-nav').innerHTML  = groups.map(mkGrp).join('');
  document.getElementById('mob-nav').innerHTML  = groups.flatMap(g => g.tabs).map(mkTab).join('');
  setTimeout(refreshTaskBadge, 1500);
}

function goTab(id) {
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
    const names = { inicio:'',conv:'Conversas',crm:'CRM',tarefas:'Tarefas',agenda:'Agenda',cal:'Calendário',retrab:'Retrabalho',origem:'Origens',negoc:'Pipeline',base:'Base de Dados',bi:'BI',ativos:'Ativos',conf:'Conferência',users:'Usuários',config:'Config' };
    const label = names[id] || id;
    crumb.textContent = label ? '/ ' + label : '';
    crumb.style.display = label ? 'inline' : 'none';
  }
  const renders = { inicio:renderInicio, conv:renderConv, crm:renderCrm, agenda:renderAgenda, cal:renderCal, origem:renderOrigem, negoc:renderNegoc, base:renderBase, bi:renderBi, ativos:renderAtivos, tarefas:renderTarefas, retrab:renderRetrab, conf:renderConf, users:renderUsers, config:renderConfig };
  if (renders[id]) renders[id]();
}
