const SESSION_HOURS = 12;
let _popStateNav = false;

const _VALID_TABS = ['inicio','conv','crm','tarefas','agenda','cal','retrab','origem','negoc','base','bi','ativos','conf','users','config'];

(async () => {
  await initUsers();
  await seedAppts();

  const rawPath = window.location.pathname.replace(/^\//, '') || 'inicio';
  const saved = localStorage.getItem('eye_cu');

  if (saved) {
    try {
      const cu = JSON.parse(saved);
      const age = Date.now() - (cu.loginTs || 0);
      if (cu && age < SESSION_HOURS * 3600000) {
        CU = cu;
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('wppLead') ? 'crm' : (_VALID_TABS.includes(rawPath) ? rawPath : 'inicio');
        await showApp(tab);
        if (params.get('wppLead')) _openWppLeadModal(params.get('nome'), params.get('tel'));
        return;
      }
    } catch(e) {}
    localStorage.removeItem('eye_cu');
  }
  show('s-login');
})();

async function _openWppLeadModal(nome, tel) {
  await new Promise(r => setTimeout(r, 600));
  await getUsers();
  const vnds = vendedores();
  const today = new Date().toISOString().split('T')[0];
  const nomeDec = decodeURIComponent(nome || '');
  const telDec  = decodeURIComponent(tel  || '');

  document.getElementById('appt-modal-title').textContent = 'Novo lead do WhatsApp';
  document.getElementById('appt-id').value    = '';
  document.getElementById('a-cli').value      = nomeDec;
  document.getElementById('a-tel').value      = telDec;
  document.getElementById('a-data').value     = today;
  document.getElementById('a-orig').value     = 'WhatsApp Direto';
  document.getElementById('a-status').value   = 'em_atendimento';
  document.getElementById('a-vnd').innerHTML  =
    `<option value="">Selecione...</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  document.getElementById('a-vnd').value      = CU.role === 'vendedor' ? CU.nome : '';
  ['a-hora','a-modelo','a-valor','a-obs','a-prox'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('a-pgto').value = '';
  document.getElementById('ov-appt').classList.add('on');
  history.replaceState({}, '', window.location.pathname);
}

window.addEventListener('popstate', () => {
  const path = window.location.pathname.replace(/^\//, '') || 'inicio';
  if (!CU) { show('s-login'); return; }
  if (path === 'login' || path === '') { _popStateNav = true; goTab('inicio'); return; }
  if (path === 'unidades' && CU.role === 'master') { show('s-units'); renderUnitsSelector(); return; }
  if (_VALID_TABS.includes(path)) { _popStateNav = true; goTab(path); }
});