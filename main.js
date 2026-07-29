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
        const tab = _VALID_TABS.includes(rawPath) ? rawPath : 'inicio';
        showApp(tab);
        return;
      }
    } catch(e) {}
    localStorage.removeItem('eye_cu');
  }
  show('s-login');
})();

window.addEventListener('popstate', () => {
  const path = window.location.pathname.replace(/^\//, '') || 'inicio';
  if (!CU) { show('s-login'); return; }
  if (path === 'login' || path === '') { _popStateNav = true; goTab('inicio'); return; }
  if (path === 'unidades' && CU.role === 'master') { show('s-units'); renderUnitsSelector(); return; }
  if (_VALID_TABS.includes(path)) { _popStateNav = true; goTab(path); }
});
