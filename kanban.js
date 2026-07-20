let _kbVndFilter = '';
let _kbDragId = null;

function alertClass(a) {
  const activeStatuses = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno'];
  if (!a.em || !activeStatuses.includes(a.status)) return '';
  const h = (Date.now() - new Date(a.em)) / 3600000;
  if (h >= 4) return 'card-crit';
  if (h >= 2) return 'card-warn';
  return '';
}

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
    <div class="kb-board-wrap"><div id="kb-board"></div></div>`;
  _drawKanban();
}

function _drawKanban() {
  let appts = [..._apptsCache];
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const vf = document.getElementById('kb-vnd-f')?.value || _kbVndFilter;
  const q  = (document.getElementById('kb-q')?.value || '').toLowerCase();
  if (vf) appts = appts.filter(a => a.vnd === vf);
  if (q)  appts = appts.filter(a => (a.cli + ' ' + (a.tel||'')).toLowerCase().includes(q));
  const hidden = JSON.parse(localStorage.getItem('eye_kb_hidden') || '[]');
  const visibleCols = KB_COLS.filter(col => !hidden.includes(col.id));

  const phaseLabels = { sdr:'— SDR', vnd:'— Vendedor', exit:'— Saídas' };
  let lastFase = null;
  let html = '<div class="kb-board">';
  visibleCols.forEach(col => {
    if (col.fase !== lastFase) {
      html += `<div class="kb-phase-div"><span>${phaseLabels[col.fase]||col.fase}</span></div>`;
      lastFase = col.fase;
    }
    const cards = appts.filter(a => a.status === col.id);
    const totalVal = cards.reduce((s, a) => {
      const n = parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    const valStr = totalVal >= 1000 ? `R$${(totalVal/1000).toFixed(1)}k`
                 : totalVal > 0    ? `R$${Math.round(totalVal)}`
                 : '';
    html += `
      <div class="kb-col" data-status="${col.id}"
        ondragover="event.preventDefault();this.classList.add('kb-over')"
        ondragleave="this.classList.remove('kb-over')"
        ondrop="kbDrop(event,'${col.id}')">
        <div class="kb-col-hd" style="border-top:3px solid ${col.color}">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="width:8px;height:8px;border-radius:50%;background:${col.color};flex:none;display:inline-block"></span>
            <span style="font-size:12px;font-weight:700">${col.label}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span class="kb-count">${cards.length}</span>
            ${valStr ? `<span class="kb-val">${valStr}</span>` : ''}
          </div>
        </div>
        <div class="kb-col-body">
          ${cards.length ? cards.map(a => kbCard(a)).join('') : `<div class="kb-empty">Nenhum lead</div>`}
        </div>
      </div>`;
  });
  html += '</div>';
  document.getElementById('kb-board').innerHTML = html;
}

function kbCard(a) {
  const ac = userColor(a.vnd);
  const al = alertClass(a);
  return `
    <div class="kb-card${al?' '+al:''}" draggable="true"
      ondragstart="_kbDragId='${a.id}'"
      ondragend="document.querySelectorAll('.kb-col').forEach(c=>c.classList.remove('kb-over'))"
      onclick="openNeg('${a.id}')">
      <div class="kb-card-top">
        <div class="kb-card-av" style="background:${ac}">${initials(a.vnd)}</div>
        <div class="kb-card-info">
          <div class="kb-card-name">${a.cli}</div>
          <div class="kb-card-vnd">${a.vnd||'—'}</div>
        </div>
        ${scoreBadge(a)}
      </div>
      ${a.modelo ? `<div class="kb-card-model"><i class="ti ti-car"></i>${a.modelo}</div>` : ''}
      <div class="kb-card-foot">
        ${a.valor ? `<span class="kb-card-val">${a.valor}</span>` : '<span></span>'}
        ${a.data  ? `<span class="kb-card-date"><i class="ti ti-calendar"></i>${fmtDate(a.data)}</span>` : ''}
      </div>
    </div>`;
}

async function kbDrop(event, newStatus) {
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('.kb-col').forEach(c => c.classList.remove('kb-over'));
  if (!_kbDragId) return;
  const id = _kbDragId;
  _kbDragId = null;
  const a = _apptsCache.find(x => x.id === id);
  if (!a || a.status === newStatus) return;
  const oldStatus = a.status;
  // Atualiza cache local imediatamente — sem esperar o Supabase
  const now = new Date().toISOString();
  a.status = newStatus;
  a.em = now;
  _drawKanban();
  toast('Lead movido!');
  const { error } = await sb.from('eye_appts').update({ status: newStatus, em: now }).eq('id', id);
  if (error) {
    toast('Erro ao mover: ' + error.message, 'err');
    a.status = oldStatus; // rollback
    _drawKanban();
    return;
  }
  if (oldStatus !== newStatus) await logStatus(id, oldStatus, newStatus);
}
