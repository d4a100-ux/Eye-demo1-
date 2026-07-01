function uid()        { return Date.now() + '-' + Math.random().toString(36).slice(2, 6); }
function fmtDate(d)   { if (!d) return '—'; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; }
function initials(n)  { return (n||'?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function userColor(nome) { return (_usersCache||[]).find(x => x.nome === nome)?.cor || '#5B6EFF'; }
function fmtStatus(s) { return STATUS[s] || STATUS.pendente; }
function loading(el)  { el.innerHTML = `<div class="loading-st"><i class="ti ti-loader-2"></i><p>Carregando…</p></div>`; }

function fmtLogTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function getOrigins() {
  try { return JSON.parse(localStorage.getItem('eye_origins')) || null; } catch(e) { return null; }
}
function activeOrigins() { return getOrigins() || ORIGINS; }

function toast(msg, type) {
  const t  = document.getElementById('toast');
  const ic = document.getElementById('toast-ic');
  ic.className   = 'ti ' + (type==='err'?'ti-alert-circle':type==='warn'?'ti-alert-triangle':'ti-circle-check');
  ic.style.color = type==='err'?'var(--red)':type==='warn'?'var(--amb)':'var(--grn)';
  document.getElementById('toast-msg').textContent = msg;
  t.style.display = 'flex';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.display='none', 2800);
}
