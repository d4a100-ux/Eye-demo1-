const SESSION_HOURS = 12; // sessão expira após 12h

(async () => {
  await initUsers();
  await seedAppts();
  const saved = localStorage.getItem('eye_cu');
  if (saved) {
    try {
      const cu = JSON.parse(saved);
      const age = Date.now() - (cu.loginTs || 0);
      if (cu && age < SESSION_HOURS * 3600000) {
        CU = cu;
        showApp();
        return;
      }
    } catch(e) {}
    localStorage.removeItem('eye_cu');
  }
  show('s-login'); // sempre mostra login se não há sessão válida
})();
