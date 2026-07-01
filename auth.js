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
  CU = u;
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
function tabs() {
  const base = [
    { id:'inicio', icon:'ti-home',           label:'Início'      },
    { id:'conv',   icon:'ti-message-2',      label:'Conversas'   },
    { id:'crm',    icon:'ti-layout-kanban',  label:'CRM'         },
    { id:'agenda', icon:'ti-calendar',       label:'Agenda'      },
    { id:'cal',    icon:'ti-calendar-month', label:'Calendário'  },
  ];
  if (['gerencia','sdr','master'].includes(CU.role)) {
    base.push(
      { id:'origem', icon:'ti-chart-pie', label:'Origens'      },
      { id:'negoc',  icon:'ti-handshake', label:'Pipeline'     },
      { id:'base',   icon:'ti-database',  label:'Base de Dados'},
    );
  }
  if (['gerencia','master'].includes(CU.role)) base.push({ id:'users',  icon:'ti-users-group', label:'Usuários' });
  if (CU.role === 'master')                    base.push({ id:'config', icon:'ti-settings',    label:'Config'   });
  return base;
}

function buildNav() {
  const ts = tabs();
  const mk = t => `<button onclick="goTab('${t.id}')" data-t="${t.id}"><i class="ti ${t.icon}"></i>${t.label}</button>`;
  document.getElementById('tab-nav').innerHTML = ts.map(mk).join('');
  document.getElementById('mob-nav').innerHTML = ts.map(mk).join('');
}

function goTab(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  const v = document.getElementById('v-' + id);
  if (v) v.classList.add('on');
  document.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  const renders = { inicio:renderInicio, conv:renderConv, crm:renderCrm, agenda:renderAgenda, cal:renderCal, origem:renderOrigem, negoc:renderNegoc, base:renderBase, users:renderUsers, config:renderConfig };
  if (renders[id]) renders[id]();
}
