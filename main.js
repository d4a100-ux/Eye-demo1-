(async () => {
  await initUsers();
  await seedAppts();
  const saved = localStorage.getItem('eye_cu');
  if (saved) {
    try { CU = JSON.parse(saved); showApp(); }
    catch(e) { localStorage.removeItem('eye_cu'); }
  }
})();
