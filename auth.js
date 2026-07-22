let CU = null;

async function doLogin() {
  const loginVal = document.getElementById('li-user').value.trim();
  const senhaVal = document.getElementById('li-pass').value;
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Entrando…';

  if (loginVal === 'eye' && senhaVal === 'eye@master2025') {
    CU = { id:'master', nome:'Master', login:'eye', role:'master', cor:'#1C1C1E', unidade_id: null };
    localStorage.setItem('eye_cu', JSON.stringify(CU));
    showApp(); return;
  }
  const users = await getUsers();
  const u = users.find(x => x.login === loginVal && x.senha === senhaVal);
  if (!u) {
    document.getElementById('li-err').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar'; return;
  }
  document.getElementById('li-err').style.display = 'none';
  // Strip senha before storing — never persist credentials in localStorage
  const { senha: _stripped, ...cuSafe } = u;
  CU = cuSafe;
  localStorage.setItem('eye_cu', JSON.stringify(CU));
  showApp();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('li-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

function doLogout() {
  CU = null; _usersCache = null; _apptsCache = []; _activeUnit = null;
  localStorage.removeItem('eye_cu');
  document.getElementById('li-user').value = '';
  document.getElementById('li-pass').value = '';
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
  show('s-app');
  document.getElementById('top-username').textContent = CU.nome;
  const rb = document.getElementById('top-role-badge');
  rb.textContent = ROLE_LABELS[CU.role] || CU.role;
  rb.className = 'top-role-badge ' + (CU.role === 'master' ? 'rb-mst' : CU.role === 'gerencia' ? 'rb-ger' : CU.role === 'sdr' ? 'rb-sdr' : 'rb-vnd');

  const unitWrap = document.getElementById('unit-selector-wrap');
  if (CU.role === 'master') {
    const uns = await getUnidades();
    unitWrap.innerHTML = `<select class="fi" style="height:32px;font-size:12px;margin:0" onchange="switchUnit(this.value)">
        <option value="">Todas as unidades</option>
        ${uns.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
      </select>`;
    unitWrap.style.display = 'flex';
  } else if (CU.unidade_id) {
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
  requestNotifPerm();
  startRealtimeLeads();
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
    inicio:  { icon:'ti-home',           label:'Início'      },
    conv:    { icon:'ti-message-2',      label:'Conversas'   },
    crm:     { icon:'ti-layout-kanban',  label:'CRM'         },
    tarefas: { icon:'ti-checkbox',       label:'Tarefas'     },
    agenda:  { icon:'ti-calendar',       label:'Agenda'      },
    cal:     { icon:'ti-calendar-month', label:'Calendário'  },
    origem:  { icon:'ti-chart-pie',      label:'Origens'     },
    negoc:   { icon:'ti-handshake',      label:'Pipeline'    },
    base:    { icon:'ti-database',       label:'Base de Dados'},
    bi:      { icon:'ti-chart-bar',      label:'BI'          },
    ativos:  { icon:'ti-car',            label:'Ativos'      },
    users:   { icon:'ti-users-group',    label:'Usuários'    },
    config:  { icon:'ti-settings',       label:'Config'      },
  };
  const mk = id => ({ id, ...ALL[id] });
  const groups = [
    { label:'Atendimento', ids:['inicio','conv','crm','tarefas','agenda','cal'], roles:null },
    { label:'Comercial',   ids:['origem','negoc','base'],                        roles:['sdr','gerencia','master'] },
    { label:'Gestão',      ids:['bi','ativos'],                                  roles:['gerencia','master'] },
    { label:'Admin',       ids:CU.role==='master'?['users','config']:['users'],  roles:['gerencia','master'] },
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
    const names = { inicio:'',conv:'Conversas',crm:'CRM',tarefas:'Tarefas',agenda:'Agenda',cal:'Calendário',origem:'Origens',negoc:'Pipeline',base:'Base de Dados',bi:'BI',ativos:'Ativos',users:'Usuários',config:'Config' };
    const label = names[id] || id;
    crumb.textContent = label ? '/ ' + label : '';
    crumb.style.display = label ? 'inline' : 'none';
  }
  const renders = { inicio:renderInicio, conv:renderConv, crm:renderCrm, agenda:renderAgenda, cal:renderCal, origem:renderOrigem, negoc:renderNegoc, base:renderBase, bi:renderBi, ativos:renderAtivos, tarefas:renderTarefas, users:renderUsers, config:renderConfig };
  if (renders[id]) renders[id]();
}
