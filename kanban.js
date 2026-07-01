let _kbVndFilter = '';

async function renderCrm() {
  const el = document.getElementById('v-crm');
  loading(el);
  await getAppts();
  const vndOpts = CU.role !== 'vendedor'
    ? `<select class="fi fi-sel" id="kb-vnd-f" onchange="_kbVndFilter=this.value;_drawKanban()" style="height:34px">
        <option value="">Todos os vendedores</option>
        ${vendedores().map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}
       </select>` : '';
  el.innerHTML = `
    <div class="filters" style="margin-bottom:12px">
      <input class="fi fi-search" style="height:34px" id="kb-q" placeholder="Buscar cliente…" oninput="_drawKanban()">
      ${vndOpts}
    </div>
    <div id="kb-board"></div>`;
  _drawKanban();
}

function _drawKanban() {
  let appts = [..._apptsCache];
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const vf = document.getElementById('kb-vnd-f')?.value || _kbVndFilter;
  const q  = (document.getElementById('kb-q')?.value || '').toLowerCase();
  if (vf) appts = appts.filter(a => a.vnd === vf);
  if (q)  appts = appts.filter(a => (a.cli+' '+(a.tel||'')).toLowerCase().includes(q));
  const hidden    = JSON.parse(localStorage.getItem('eye_kb_hidden')    || '[]');
  const collapsed = JSON.parse(localStorage.getItem('eye_kb_collapsed') || '[]');
  const visibleCols = KB_COLS.filter(col => !hidden.includes(col.id));

  let html = '<div class="kb-list-board">';
  visibleCols.forEach(col => {
    const cards = appts.filter(a => a.status === col.id);
    const totalVal = cards.reduce((s,a) => {
      const n = parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));
      return s + (isNaN(n)?0:n);
    }, 0);
    const valStr = totalVal > 0
      ? (totalVal >= 1000 ? `R$${(totalVal/1000).toFixed(0)}k` : `R$${Math.round(totalVal)}`)
      : '';
    const isCollapsed = collapsed.includes(col.id);
    html += `<div class="kb-list-section">
      <div class="kb-list-header" onclick="toggleKbSection('${col.id}')" style="--kh-c:${col.color}">
        <div class="kb-list-header-left">
          <div class="kb-list-dot" style="background:${col.color}"></div>
          <span class="kb-list-label">${col.label}</span>
          <span class="kb-count">${cards.length}${valStr?' · <span style="color:var(--grn)">'+valStr+'</span>':''}</span>
        </div>
        <i class="ti ti-chevron-${isCollapsed?'right':'down'}" style="color:var(--txt3);font-size:16px"></i>
      </div>
      ${!isCollapsed?`<div class="kb-list-body">
        ${cards.length ? cards.map(a=>kbListRow(a,col.color)).join('') : '<div class="kb-empty">Sem leads nesta etapa</div>'}
      </div>`:''}
    </div>`;
  });
  html += '</div>';
  document.getElementById('kb-board').innerHTML = html;
}

function kbListRow(a, colColor) {
  const ac = userColor(a.vnd);
  const origEmoji = (activeOrigins()||{})[a.orig] || '';
  return `<div class="kb-list-row" style="--kc:${colColor}">
    <div class="kb-list-av" style="background:${ac}">${initials(a.vnd||'?')}</div>
    <div class="kb-list-info">
      <div class="kb-list-name">${a.cli}${a.modelo?` <span style="color:var(--txt3);font-weight:400;font-size:11px">· ${a.modelo}</span>`:''}</div>
      <div class="kb-list-sub">
        ${a.tel  ?`<span><i class="ti ti-phone"></i>${a.tel}</span>`:''}
        ${a.data ?`<span><i class="ti ti-calendar"></i>${fmtDate(a.data)}${a.hora?' · '+a.hora:''}</span>`:''}
        ${a.vnd  ?`<span style="color:${ac};font-weight:600"><i class="ti ti-user"></i>${a.vnd}</span>`:''}
        ${a.orig ?`<span>${origEmoji} ${a.orig}</span>`:''}
        ${a.valor?`<span style="color:var(--grn);font-weight:700">${a.valor}</span>`:''}
      </div>
    </div>
    ${canEdit(a)?`<div class="kb-list-acts">
      <button class="kc-btn p" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i></button>
      ${CU.role!=='vendedor'?`<button class="kc-btn" onclick="openAppt('${a.id}')"><i class="ti ti-edit"></i></button>`:''}
    </div>`:''}
  </div>`;
}

function toggleKbSection(id) {
  let collapsed = JSON.parse(localStorage.getItem('eye_kb_collapsed') || '[]');
  if (collapsed.includes(id)) collapsed = collapsed.filter(x => x !== id);
  else collapsed.push(id);
  localStorage.setItem('eye_kb_collapsed', JSON.stringify(collapsed));
  _drawKanban();
}
