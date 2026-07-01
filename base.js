async function renderBase() {
  const el = document.getElementById('v-base');
  loading(el);
  await getAppts();
  const all = CU.role === 'vendedor' ? _apptsCache.filter(a => a.vnd === CU.nome) : _apptsCache;
  const frios = all.filter(a => a.status === 'lead_frio');

  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv" style="color:#8E8E93">${frios.length}</div><div class="sl">Leads frios</div></div>
      <div class="stat-c"><div class="sv">${frios.filter(a=>a.tel).length}</div><div class="sl">Com telefone</div></div>
      <div class="stat-c"><div class="sv">${frios.filter(a=>a.modelo).length}</div><div class="sl">Com modelo</div></div>
    </div>
    <div class="filters" style="margin-bottom:14px">
      <input class="fi fi-search" id="base-q" placeholder="Buscar nome, telefone…" oninput="_filterBase()">
      ${CU.role!=='vendedor'?`<select class="fi fi-sel" id="base-vnd" onchange="_filterBase()">
        <option value="">Todos os vendedores</option>
        ${vendedores().map(v=>`<option>${v.nome}</option>`).join('')}
      </select>`:''}
    </div>
    <div id="base-list"></div>`;
  _filterBase();
}

function _filterBase() {
  let appts = _apptsCache.filter(a => a.status === 'lead_frio');
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const q   = (document.getElementById('base-q')?.value   || '').toLowerCase();
  const vnd =  document.getElementById('base-vnd')?.value || '';
  if (q)   appts = appts.filter(a => (a.cli + ' ' + (a.tel||'')).toLowerCase().includes(q));
  if (vnd) appts = appts.filter(a => a.vnd === vnd);

  const el = document.getElementById('base-list');
  if (!appts.length) {
    el.innerHTML = `<div class="empty-st"><i class="ti ti-snowflake"></i><p>Nenhum lead frio no momento.<br>Ótima notícia!</p></div>`;
    return;
  }
  el.innerHTML = `<div class="appt-list">${appts.sort((a,b)=>a.cli>b.cli?1:-1).map(baseCard).join('')}</div>`;
}

function baseCard(a) {
  const ac = userColor(a.vnd);
  const tel55 = a.tel ? a.tel.replace(/\D/g,'') : '';
  return `<div class="ac" style="--c:#8E8E93">
    <div class="ac-head">
      <div class="ac-av" style="background:${ac}">${initials(a.vnd)}</div>
      <div class="ac-info">
        <div class="ac-name">${a.cli}<span class="tag s-lf">Lead Frio</span></div>
        <div class="ac-sub">
          <span><i class="ti ti-user"></i>${a.vnd}</span>
          ${a.tel ?`<span><i class="ti ti-phone"></i>${a.tel}</span>`:''}
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${a.orig}</span>`:''}
          ${a.data?`<span><i class="ti ti-calendar"></i>${fmtDate(a.data)}</span>`:''}
        </div>
      </div>
    </div>
    ${a.modelo||a.valor?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${a.modelo}</div></div>`:''}
      ${a.valor ?`<div class="af"><div class="afl">Valor</div><div class="afv">${a.valor}</div></div>`:''}
    </div>`:''}
    ${a.obs?`<div class="ac-neg"><div class="neg-lbl">Último contato</div><div>${a.obs}</div></div>`:''}
    <div class="ac-acts">
      ${tel55?`<a href="https://wa.me/55${tel55}" target="_blank" class="btn-s"><i class="ti ti-brand-whatsapp" style="color:#25D366"></i>WhatsApp</a>`:''}
      <button class="btn-s p" onclick="reativarLead('${a.id}')"><i class="ti ti-refresh"></i>Reativar</button>
      <button class="btn-s" onclick="openLeadTimeline('${a.id}')"><i class="ti ti-timeline"></i>Histórico</button>
      ${canDelete()?`<button class="btn-s d" onclick="delAppt('${a.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div>
  </div>`;
}

async function reativarLead(id) {
  if (!confirm('Reativar este lead? Ele voltará para "Novo Lead".')) return;
  const { error } = await sb.from('eye_appts').update({ status:'pendente' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  await logStatus(id, 'lead_frio', 'pendente');
  toast('Lead reativado!');
  await refreshAll();
}
