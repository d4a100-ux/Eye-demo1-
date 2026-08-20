let _kbVndFilter  = '';
let _kbDragId     = null;
let _pendingKbDrop = null;

const KB_TRAINING = {
  novo_lead: {
    desc: 'Lead novo que acabou de entrar. Ainda não houve contato.',
    fazer: 'Enviar WhatsApp ou ligar em até 5 minutos. Cada minuto conta!',
    script: 'Oi [nome]! Vi que você tem interesse em veículos. Posso te ajudar a encontrar o carro ideal hoje?',
    erro: 'Deixar passar mais de 30 minutos sem contato — a concorrência vai agir antes.',
  },
  em_contato: {
    desc: 'Lead sendo atendido — em conversa ativa ou aguardando retorno.',
    fazer: 'Qualificar interesse, descobrir modelo e forma de pagamento. Converter em agendamento.',
    script: 'Perfeito [nome]! Pra eu te ajudar melhor: qual modelo você tem mais interesse? Quando poderia vir à loja conhecer pessoalmente?',
    erro: 'Ficar só no WhatsApp sem avançar — lead precisa ser convertido em agendamento.',
  },
  agendado: {
    desc: 'Cliente agendado ou em negociação na loja. Fase decisiva para fechar.',
    fazer: 'Confirmar agendamento no dia anterior. Registrar resultado da visita. Acompanhar negociação até fechamento.',
    script: 'Olá [nome], confirmando sua visita amanhã às [hora]. Estamos te esperando com o [modelo] separado!',
    erro: 'Não confirmar o agendamento — risco alto de no-show sem aviso.',
  },
};

function showKbTraining(colId) {
  const t = KB_TRAINING[colId];
  const col = KB_COLS.find(c => c.id === colId);
  if (!t) return;
  const panel = document.getElementById('kb-train-panel');
  document.getElementById('kbt-title').textContent = col?.label || colId;
  document.getElementById('kbt-col-label').textContent = 'Guia de abordagem';
  document.getElementById('kbt-body').innerHTML = `
    <div class="kbt-section">
      <h5>O que é</h5>
      <p>${t.desc}</p>
    </div>
    <div class="kbt-section">
      <h5>O que fazer agora</h5>
      <p>${t.fazer}</p>
    </div>
    <div class="kbt-section">
      <h5>Script sugerido</h5>
      <p class="kbt-script">"${t.script}"</p>
    </div>
    <div class="kbt-section">
      <h5>Erro comum</h5>
      <p class="kbt-err">⚠ ${t.erro}</p>
    </div>`;
  panel.classList.add('on');
}

function closeKbTraining() {
  document.getElementById('kb-train-panel')?.classList.remove('on');
}

const _ACTIVE_ST = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno'];

function alertClass(a) {
  if (!a.em || !_ACTIVE_ST.includes(a.status)) return '';
  const mins = (Date.now() - new Date(a.em)) / 60000;
  if (a.status === 'pendente') {
    if (mins >= 10) return 'card-dead';
    if (mins >= 3)  return 'card-crit';
    return '';
  }
  const h = mins / 60;
  if (h >= 24) return 'card-dead';
  if (h >= 4)  return 'card-crit';
  if (h >= 2)  return 'card-warn';
  return '';
}

function alertText(a) {
  if (!a.em || !_ACTIVE_ST.includes(a.status)) return '';
  const mins = (Date.now() - new Date(a.em)) / 60000;
  if (a.status === 'pendente') {
    if (mins < 3)  return '';
    if (mins < 60) return `Sem resposta há ${Math.round(mins)}min`;
    return `Sem resposta há ${Math.round(mins/60)}h`;
  }
  const h = mins / 60;
  if (h < 2) return '';
  return `Parado há ${Math.round(h)}h`;
}

async function renderCrm() {
  const el = document.getElementById('v-crm');
  loading(el);
  await getAppts();

  if (CU.role === 'vendedor') { _renderVendedorView(el); return; }

  const vndOpts = `<select class="fi fi-sel" id="kb-vnd-f" onchange="_kbVndFilter=this.value;_drawKanban()" style="height:34px">
      <option value="">Todos os vendedores</option>
      ${vendedores().map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}
     </select>`;
  el.innerHTML = `
    <div class="filters" style="margin-bottom:12px">
      <input class="fi fi-search" style="height:34px" id="kb-q" placeholder="Buscar cliente…" oninput="_drawKanban()">
      ${vndOpts}
    </div>
    <div class="kb-board-wrap"><div id="kb-board"></div></div>`;
  _drawKanban();
}

function _kbOpenWpp(tel, nome) {
  goTab('conv');
  const clean = (tel || '').replace(/\D/g, '');
  if (!clean) return;
  setTimeout(() => { if (typeof openWppConv === 'function') openWppConv(clean, nome); }, 600);
}

let _vndBriefings = {};
let _vndContacts  = {};

/* ── Tela simplificada do Vendedor (mobile-first) ─────────────────────────── */
async function _renderVendedorView(el) {
  if (!document.getElementById('eye-vnd-styles')) {
    const s = document.createElement('style');
    s.id = 'eye-vnd-styles';
    s.textContent = `
      .vnd-card-wrap{display:flex;flex-direction:column;gap:8px}
      .vnd-update-btn{flex:1;height:44px;font-size:14px;font-weight:700;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:6px}
      .vnd-briefing{background:rgba(255,159,10,.08);border:1px solid rgba(255,159,10,.2);border-radius:10px;padding:10px 12px;margin-top:8px;font-size:12px;color:var(--txt2);line-height:1.45}
      .vnd-briefing b{color:var(--amb);font-weight:700}
      .vnd-briefing-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px}
      .vnd-bf-chip{background:rgba(255,159,10,.12);color:var(--amb);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600}
      .kb-wpp-btn{border:none;background:rgba(37,211,102,.12);color:#25D366;border-radius:8px;width:26px;height:22px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;flex:none;transition:background .15s}
      .kb-wpp-btn:hover{background:rgba(37,211,102,.25)}
      .vnd-contacts{margin-top:10px;padding:10px 12px;background:rgba(91,110,255,.07);border-radius:10px}
      .vnd-contacts-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ind);margin-bottom:7px}
      .vnd-contacts-row{display:flex;gap:6px;flex-wrap:wrap}
      .vnd-contact-chip{border:1.5px solid rgba(91,110,255,.3);background:transparent;color:var(--ind);border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s}
      .vnd-contact-chip.done{background:var(--grn);border-color:var(--grn);color:#fff;cursor:default}
      .vnd-visita-prompt{margin-top:10px;padding:12px;background:rgba(255,59,48,.06);border:1px solid rgba(255,59,48,.18);border-radius:10px}
      .vnd-visita-title{font-size:11px;font-weight:700;color:var(--txt2);margin-bottom:8px;display:flex;align-items:center;gap:5px}
      .vnd-visita-acts{display:flex;gap:6px;flex-wrap:wrap}
      .vnd-vq{border:none;border-radius:9px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s}
      .vnd-vq:hover{opacity:.8}
      .vnd-vq.g{background:rgba(52,199,89,.14);color:var(--grn)}
      .vnd-vq.r{background:rgba(255,59,48,.11);color:var(--red)}
    `;
    document.head.appendChild(s);
  }
  const appts = _apptsCache.filter(a => a.vnd === CU.nome);
  _vndBriefings = {};
  _vndContacts  = {};
  if (appts.length) {
    const ids = appts.map(a => a.id);
    const [bfsRes, cmsRes] = await Promise.all([
      sb.from('eye_briefings').select('*').in('appt_id', ids),
      sb.from('eye_comments').select('appt_id,texto').in('appt_id', ids).ilike('texto', '[VND-C_]%')
    ]);
    (bfsRes.data || []).forEach(b => _vndBriefings[b.appt_id] = b);
    (cmsRes.data || []).forEach(c => {
      const m = c.texto.match(/\[VND-C(\d)\]/);
      if (m) {
        if (!_vndContacts[c.appt_id]) _vndContacts[c.appt_id] = new Set();
        _vndContacts[c.appt_id].add(parseInt(m[1]));
      }
    });
  }
  const ACTIVE_ST = ['passado_vendedor','agendado','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno','pendente','em_atendimento'];
  const active         = appts.filter(a => ACTIVE_ST.includes(a.status)).length;
  const visitas        = appts.filter(a => a.status === 'agendado').length;
  const vendas         = appts.filter(a => a.status === 'venda_concluida').length;
  const agendadosTotal = appts.filter(a => ['passado_vendedor','em_negociacao','ficha_enviada','venda_concluida','perdido','ag_retorno'].includes(a.status)).length;
  const compareceTotal = appts.filter(a => ['em_negociacao','ficha_enviada','venda_concluida'].includes(a.status)).length;
  const compareceRate  = agendadosTotal > 0 ? Math.round(compareceTotal / agendadosTotal * 100) : 0;
  const convRate       = compareceTotal  > 0 ? Math.round(vendas / compareceTotal * 100) : 0;
  const cmpColor = compareceRate >= 60 ? 'var(--grn)' : compareceRate >= 40 ? 'var(--amb)' : 'var(--red)';
  const cnvColor = convRate >= 30 ? 'var(--grn)' : convRate >= 15 ? 'var(--amb)' : 'var(--red)';

  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv">${active}</div><div class="sl">Ativos</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--amb)">${visitas}</div><div class="sl">Visitas</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--grn)">${vendas}</div><div class="sl">Vendas</div></div>
      <div class="stat-c"><div class="sv" style="color:${cmpColor}">${compareceRate}%</div><div class="sl">Comparec.</div></div>
      <div class="stat-c"><div class="sv" style="color:${cnvColor}">${convRate}%</div><div class="sl">Conversão</div></div>
    </div>
    <div class="filters" style="margin-bottom:12px">
      <input class="fi fi-search" id="vnd-q" placeholder="Buscar cliente…" oninput="_filterVndView()">
    </div>
    <div id="vnd-list"></div>`;
  _filterVndView();
}

function _filterVndView() {
  const q = (document.getElementById('vnd-q')?.value || '').toLowerCase();
  let appts = _apptsCache.filter(a => a.vnd === CU.nome);
  if (q) appts = appts.filter(a => (a.cli + ' ' + (a.tel||'')).toLowerCase().includes(q));

  const PRIORITY = ['passado_vendedor','agendado','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno','pendente','em_atendimento'];
  const active = appts.filter(a => PRIORITY.includes(a.status))
    .sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status));
  const done = appts.filter(a => ['venda_concluida','perdido','sem_resposta','lead_frio','credito_reprovado'].includes(a.status));

  const el = document.getElementById('vnd-list');
  if (!appts.length) {
    el.innerHTML = `<div class="empty-st"><i class="ti ti-user-off"></i><p>Nenhum lead atribuído a você ainda.</p></div>`;
    return;
  }
  el.innerHTML = `
    ${active.length ? `<div class="sec-lbl">Leads ativos <span>${active.length}</span></div><div class="vnd-card-wrap">${active.map(_vndCard).join('')}</div>` : ''}
    ${done.length  ? `<div class="sec-lbl" style="margin-top:18px">Encerrados <span>${done.length}</span></div><div class="vnd-card-wrap">${done.map(_vndCard).join('')}</div>` : ''}`;
}

async function _vndMarkContact(apptId, n) {
  const btn = document.querySelector(`.vnd-contact-chip[data-appt="${apptId}"][data-n="${n}"]`);
  if (btn) btn.classList.add('done');
  await sb.from('eye_comments').insert({
    id: uid(), appt_id: apptId, user_nome: CU.nome,
    texto: `[VND-C${n}] Contato ${n} realizado`,
    created_at: new Date().toISOString()
  });
  if (!_vndContacts[apptId]) _vndContacts[apptId] = new Set();
  _vndContacts[apptId].add(n);
}

async function _vndQa(apptId, newStatus) {
  const a = _apptsCache.find(x => x.id === apptId);
  if (!a) return;
  const old = a.status;
  const now = new Date().toISOString();
  a.status = newStatus; a.em = now;
  _filterVndView();
  const { error } = await sb.from('eye_appts').update({ status: newStatus, em: now }).eq('id', apptId);
  if (error) { toast('Erro ao atualizar', 'err'); a.status = old; a.em = null; _filterVndView(); return; }
  await logStatus(apptId, old, newStatus);
  toast('Atualizado!');
}

function _vndCard(a) {
  const sm     = fmtStatus(a.status);
  const alertH = _alertHours(a);
  const alertCls = alertH >= 24 ? 'ac-alert-dead' : alertH >= 4 ? 'ac-alert-crit' : alertH >= 2 ? 'ac-alert-warn' : '';
  const bf     = _vndBriefings[a.id];
  const urgLabels = { essa_semana:'⚡ Essa semana', esse_mes:'📅 Esse mês', sem_prazo:'🕐 Sem prazo' };
  const objLabels = { preco:'Preço', pagamento:'Pagamento', modelo:'Modelo', pesquisando:'Pesquisando', nenhuma:'Sem objeção' };
  const briefingHtml = bf ? `
    <div class="vnd-briefing">
      <b>Briefing SDR</b>${bf.resumo ? ` · ${esc(bf.resumo)}` : ''}
      <div class="vnd-briefing-row">
        ${bf.veiculo   ? `<span class="vnd-bf-chip"><i class="ti ti-car"></i> ${esc(bf.veiculo)}</span>` : ''}
        ${bf.urgencia  ? `<span class="vnd-bf-chip">${urgLabels[bf.urgencia]||bf.urgencia}</span>` : ''}
        ${bf.pagamento ? `<span class="vnd-bf-chip">💳 ${esc(bf.pagamento)}</span>` : ''}
        ${bf.objecao && bf.objecao !== 'nenhuma' ? `<span class="vnd-bf-chip">⚠ ${objLabels[bf.objecao]||bf.objecao}</span>` : ''}
      </div>
    </div>` : '';

  // Checklist 4 contatos V+ — aparece para leads passados ao vendedor ou agendados
  const showChecklist = ['passado_vendedor','agendado'].includes(a.status);
  const done = _vndContacts[a.id] || new Set();
  const checklistHtml = showChecklist ? `
    <div class="vnd-contacts">
      <div class="vnd-contacts-title">Protocolo V+ — 4 contatos obrigatórios</div>
      <div class="vnd-contacts-row">
        ${[1,2,3,4].map(n => {
          const isDone = done.has(n);
          const labels = ['1º Boas-vindas','2º Confirmação','3º Véspera','4º Pós-visita'];
          return `<button class="vnd-contact-chip${isDone?' done':''}" data-appt="${a.id}" data-n="${n}"
            ${isDone ? 'disabled' : `onclick="event.stopPropagation();_vndMarkContact('${a.id}',${n})"`}
            title="${labels[n-1]}">${isDone?'✓ ':''} C${n}</button>`;
        }).join('')}
      </div>
    </div>` : '';

  // Prompt de resultado de visita — aparece quando data já passou e ainda está agendado/passado
  const today = new Date().toISOString().slice(0,10);
  const visitaPendente = ['agendado','passado_vendedor'].includes(a.status) && a.data && a.data <= today;
  const visitaHtml = visitaPendente ? `
    <div class="vnd-visita-prompt">
      <div class="vnd-visita-title"><i class="ti ti-flag"></i> Registrar resultado da visita</div>
      <div class="vnd-visita-acts">
        <button class="vnd-vq g" onclick="event.stopPropagation();_vndQa('${a.id}','em_negociacao')">Compareceu — Em Neg.</button>
        <button class="vnd-vq r" onclick="event.stopPropagation();_vndQa('${a.id}','perdido')">Não compareceu</button>
        <button class="vnd-vq" style="background:rgba(142,142,147,.12);color:var(--txt2)" onclick="event.stopPropagation();_vndQa('${a.id}','ag_retorno')">Remarcar</button>
      </div>
    </div>` : '';

  return `<div class="ac${alertCls?' '+alertCls:''}" style="--c:${sm.c}">
    <div class="ac-head">
      <div style="flex:1;min-width:0">
        <div class="ac-name">${esc(a.cli)}<span class="tag ${sm.cls}" style="margin-left:6px">${sm.l}</span>${alertH>=2?`<span class="ac-alert-badge">${alertH>=24?'🔴':'⚠'} ${Math.round(alertH)}h</span>`:''}</div>
        <div class="ac-sub" style="margin-top:4px;flex-wrap:wrap;gap:6px">
          ${a.tel    ? `<span><i class="ti ti-phone"></i>${esc(a.tel)}</span>`    : ''}
          ${a.modelo ? `<span><i class="ti ti-car"></i>${esc(a.modelo)}</span>`   : ''}
          ${a.data   ? `<span><i class="ti ti-calendar"></i>${fmtDate(a.data)}${a.hora?' · '+a.hora:''}</span>` : ''}
        </div>
      </div>
    </div>
    ${briefingHtml}
    ${checklistHtml}
    ${visitaHtml}
    <div class="ac-acts" style="margin-top:10px">
      <button class="btn-s p vnd-update-btn" onclick="openNeg('${a.id}')"><i class="ti ti-refresh"></i> Atualizar</button>
      ${a.tel ? `<button class="btn-s" style="height:44px;padding:0 14px;color:#25D366" onclick="event.stopPropagation();_kbOpenWpp('${a.tel.replace(/\D/g,'')}','${esc(a.cli)}')" title="WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>` : ''}
      <button class="btn-s" style="height:44px;padding:0 14px" onclick="openLeadTimeline('${a.id}')"><i class="ti ti-timeline"></i></button>
    </div>
  </div>`;
}

function _drawKanban() {
  let appts = [..._apptsCache];
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const vf = document.getElementById('kb-vnd-f')?.value || _kbVndFilter;
  const q  = (document.getElementById('kb-q')?.value || '').toLowerCase();
  if (vf) appts = appts.filter(a => a.vnd === vf);
  if (q)  appts = appts.filter(a => (a.cli+' '+(a.tel||'')).toLowerCase().includes(q));

  const hidden = JSON.parse(localStorage.getItem('eye_kb_hidden') || '[]');
  const visibleCols = KB_COLS.filter(col => !hidden.includes(col.id));

  function _colLocked(col) {
    if (CU.role === 'gerencia' || CU.role === 'master') return false;
    if (CU.role === 'sdr') return col.fase === 'vnd';
    if (CU.role === 'vendedor') return col.fase === 'sdr';
    return false;
  }

  let html = '<div class="kb-board">';
  visibleCols.forEach(col => {
    const cards = appts.filter(a => col.statuses.includes(a.status));
    const totalVal = cards.reduce((s, a) => {
      const n = parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    const valStr = totalVal >= 1000 ? `R$${(totalVal/1000).toFixed(1)}k`
                 : totalVal > 0    ? `R$${Math.round(totalVal)}`
                 : '';
    const locked = _colLocked(col);
    html += `
      <div class="kb-col${locked?' kb-locked':''}" data-col="${col.id}"
        ondragover="if(!${locked})event.preventDefault();if(!${locked})this.classList.add('kb-over')"
        ondragleave="this.classList.remove('kb-over')"
        ondrop="if(!${locked})kbDrop(event,'${col.id}')">
        <div class="kb-col-hd" style="border-top:3px solid ${col.color}">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="width:8px;height:8px;border-radius:50%;background:${col.color};flex:none;display:inline-block"></span>
            <span style="font-size:12px;font-weight:700">${col.label}</span>
            ${locked ? `<span style="font-size:9px;background:var(--bg2);color:var(--txt3);padding:1px 6px;border-radius:10px;font-weight:600">🔒</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span class="kb-count">${cards.length}</span>
            ${valStr ? `<span class="kb-val">${valStr}</span>` : ''}
            <button class="kb-train-btn" onclick="event.stopPropagation();showKbTraining('${col.id}')" title="Guia da fase">?</button>
          </div>
        </div>
        <div class="kb-col-body">
          ${cards.length ? cards.map(a => kbCard(a, locked)).join('') : `<div class="kb-empty">Nenhum lead</div>`}
        </div>
      </div>`;
  });
  html += '</div>';
  document.getElementById('kb-board').innerHTML = html;
}

function kbCardBorderColor(a) {
  const al = alertClass(a);
  if (al === 'card-dead' || al === 'card-crit' || al === 'card-warn') return 'var(--amb)';
  if (['venda_concluida','credito_aprovado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada'].includes(a.status)) return 'var(--grn)';
  if (a.status === 'credito_reprovado') return 'var(--red)';
  if (['sem_resposta','ag_retorno'].includes(a.status)) return 'var(--amb)';
  return 'var(--ind)';
}

function kbCardActBtn(a) {
  const tel  = (a.tel||'').replace(/\D/g,'');
  const alertH = a.em ? (Date.now() - new Date(a.em)) / 3600000 : 0;
  if (a.status === 'pendente') {
    if (tel) return `<button class="kb-act-btn kb-act-ind" data-tel="${tel}" data-cli="${esc(a.cli)}" onclick="event.stopPropagation();_kbOpenWpp(this.dataset.tel,this.dataset.cli)"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>`;
    return `<button class="kb-act-btn kb-act-ind" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-phone"></i> Iniciar contato</button>`;
  }
  if (a.status === 'sem_resposta') {
    if (tel) return `<button class="kb-act-btn kb-act-amb" data-tel="${tel}" data-cli="${esc(a.cli)}" onclick="event.stopPropagation();_kbOpenWpp(this.dataset.tel,this.dataset.cli)"><i class="ti ti-refresh"></i> Tentar novamente</button>`;
    return `<button class="kb-act-btn kb-act-amb" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-refresh"></i> Tentar novamente</button>`;
  }
  if (['em_atendimento','qualificado'].includes(a.status)) {
    if (alertH >= 2) return `<button class="kb-act-btn kb-act-amb" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-calendar-check"></i> Confirmar retorno</button>`;
    return `<button class="kb-act-btn kb-act-ind" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-calendar-plus"></i> Agendar</button>`;
  }
  if (['agendado','passado_vendedor'].includes(a.status)) {
    return `<button class="kb-act-btn kb-act-grn" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-check"></i> Confirmar chegada</button>`;
  }
  if (['em_negociacao','test_drive'].includes(a.status)) {
    return `<button class="kb-act-btn kb-act-grn" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-trophy"></i> Venda feita!</button>`;
  }
  if (['ficha_enviada','credito_aprovado'].includes(a.status)) {
    return `<button class="kb-act-btn kb-act-grn" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-file-check"></i> Fechar negócio</button>`;
  }
  if (a.status === 'credito_reprovado') {
    return `<button class="kb-act-btn kb-act-red" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-lifebuoy"></i> Ver alternativas</button>`;
  }
  if (a.status === 'ag_retorno') {
    return `<button class="kb-act-btn kb-act-amb" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-calendar"></i> Remarcar</button>`;
  }
  if (a.status === 'venda_concluida') {
    return `<div class="kb-act-done"><i class="ti ti-check"></i> Concluída</div>`;
  }
  return `<button class="kb-act-btn kb-act-ind" onclick="event.stopPropagation();openNeg('${a.id}')"><i class="ti ti-eye"></i> Ver lead</button>`;
}

function _kbOpenMenu(btn, apptId) {
  document.querySelectorAll('.kb-ctx-menu').forEach(m => m.remove());
  const a = _apptsCache.find(x => x.id === apptId);
  if (!a) return;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'kb-ctx-menu';
  menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;right:${window.innerWidth-rect.right}px;z-index:9000`;
  const tel = (a.tel||'').replace(/\D/g,'');
  menu.innerHTML = `
    <div class="kb-ctx-item" onclick="this.closest('.kb-ctx-menu').remove();openNeg('${apptId}')"><i class="ti ti-edit"></i>Ver / Editar</div>
    <div class="kb-ctx-item" onclick="this.closest('.kb-ctx-menu').remove();openLeadTimeline('${apptId}')"><i class="ti ti-timeline"></i>Histórico</div>
    ${tel ? `<div class="kb-ctx-item" style="color:#25D366" data-tel="${tel}" data-cli="${esc(a.cli)}" onclick="const t=this;t.closest('.kb-ctx-menu').remove();_kbOpenWpp(t.dataset.tel,t.dataset.cli)"><i class="ti ti-brand-whatsapp"></i>WhatsApp</div>` : ''}
    <div class="kb-ctx-sep"></div>
    <div class="kb-ctx-item warn" onclick="this.closest('.kb-ctx-menu').remove();_kbMarkFrio('${apptId}')"><i class="ti ti-snowflake"></i>Lead frio</div>
    <div class="kb-ctx-item danger" onclick="this.closest('.kb-ctx-menu').remove();_kbMarkPerdido('${apptId}')"><i class="ti ti-x"></i>Marcar perdido</div>
    ${canDelete() ? `<div class="kb-ctx-sep"></div><div class="kb-ctx-item danger" onclick="this.closest('.kb-ctx-menu').remove();delAppt('${apptId}')"><i class="ti ti-trash"></i>Deletar</div>` : ''}
  `;
  document.body.appendChild(menu);
  event.stopPropagation();
  setTimeout(() => {
    document.addEventListener('click', () => document.querySelectorAll('.kb-ctx-menu').forEach(m => m.remove()), { once: true });
  }, 10);
}

async function _kbMarkFrio(id) {
  _confirmDialog('Marcar como lead frio? Ele sai do kanban e vai para Base de Dados.', async () => {
    const a = _apptsCache.find(x => x.id === id);
    if (!a) return;
    const old = a.status;
    const { error } = await sb.from('eye_appts').update({ status: 'lead_frio', em: new Date().toISOString() }).eq('id', id);
    if (error) { toast('Erro ao atualizar', 'err'); return; }
    await logStatus(id, old, 'lead_frio');
    _apptsCache = _apptsCache.filter(x => x.id !== id);
    _drawKanban();
    toast('Lead marcado como frio.');
  });
}

async function _kbMarkPerdido(id) {
  _confirmDialog('Marcar como perdido? Ele sai do kanban e vai para Base de Dados.', async () => {
    const a = _apptsCache.find(x => x.id === id);
    if (!a) return;
    const old = a.status;
    const { error } = await sb.from('eye_appts').update({ status: 'perdido', em: new Date().toISOString() }).eq('id', id);
    if (error) { toast('Erro ao atualizar', 'err'); return; }
    await logStatus(id, old, 'perdido');
    _apptsCache = _apptsCache.filter(x => x.id !== id);
    _drawKanban();
    toast('Lead marcado como perdido.');
  });
}

function kbCard(a, locked) {
  const al        = alertClass(a);
  const txt       = alertText(a);
  const st        = fmtStatus(a.status);
  const borderCol = kbCardBorderColor(a);
  const sdrNome   = isMgr() && a.criado_por
    ? ((_usersCache||[]).find(u => u.login === a.criado_por)?.nome || a.criado_por)
    : null;
  const dateStr   = a.data ? `${fmtDate(a.data)}${a.hora ? ' · ' + a.hora : ''}` : '';
  return `
    <div class="kb-card kb-card-v2${al?' '+al:''}" style="border-left-color:${borderCol}" draggable="${!locked}"
      ondragstart="${locked ? 'void 0' : `_kbDragId='${a.id}'`}"
      ondragend="document.querySelectorAll('.kb-col').forEach(c=>c.classList.remove('kb-over'))"
      onclick="${locked ? 'void 0' : `openNeg('${a.id}')`}">
      <div class="kb-card-header">
        <span class="kb-status-chip" style="background:${st.c}22;color:${st.c}">${st.l}</span>
        <span class="kb-card-vnd-nm">${esc(a.vnd||'—')}</span>
      </div>
      <div class="kb-card-name">${esc(a.cli)}</div>
      <div class="kb-card-meta">
        ${a.tel    ? `<span><i class="ti ti-phone"></i>${esc(a.tel)}</span>` : ''}
        ${a.modelo ? `<span><i class="ti ti-car"></i>${esc(a.modelo)}</span>` : ''}
        ${dateStr  ? `<span><i class="ti ti-calendar"></i>${dateStr}</span>` : ''}
      </div>
      ${sdrNome ? `<div class="kb-card-sdr"><i class="ti ti-headset"></i>${esc(sdrNome)}</div>` : ''}
      ${txt ? `<div class="kb-card-alert-row">${al==='card-dead'?'🔴':'⚠'} ${esc(txt)}</div>` : ''}
      <div class="kb-card-acts" onclick="event.stopPropagation()">
        ${locked ? '' : kbCardActBtn(a)}
        ${locked ? '' : `<button class="kb-more-btn" onclick="event.stopPropagation();_kbOpenMenu(this,'${a.id}')">···</button>`}
      </div>
    </div>`;
}

async function kbDrop(event, colId) {
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('.kb-col').forEach(c => c.classList.remove('kb-over'));
  if (!_kbDragId) return;
  const id = _kbDragId;
  _kbDragId = null;
  const a = _apptsCache.find(x => x.id === id);
  if (!a) return;

  const destCol = KB_COLS.find(c => c.id === colId);
  const srcCol  = KB_COLS.find(c => c.statuses.includes(a.status));
  if (!destCol || srcCol?.id === destCol.id) return;

  const isLocked = (CU.role === 'sdr' && destCol.fase === 'vnd') || (CU.role === 'vendedor' && destCol.fase === 'sdr');
  if (isLocked) { toast('Esta fase pertence a outro papel', 'err'); return; }

  const newStatus = destCol.dropStatus;
  const oldStatus = a.status;
  const now = new Date().toISOString();
  a.status = newStatus;
  a.em = now;
  _drawKanban();
  const { error } = await sb.from('eye_appts').update({ status: newStatus, em: now }).eq('id', id);
  if (error) {
    toast('Erro ao mover lead. Tente novamente.', 'err');
    a.status = oldStatus;
    a.em = undefined;
    _drawKanban();
    return;
  }
  if (oldStatus !== newStatus) { await logStatus(id, oldStatus, newStatus); toast('Lead movido!'); }
}
