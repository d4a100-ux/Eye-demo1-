// ─── TAREFAS / FOLLOW-UP ────────────────────────────────────────────────────
const TASK_ICONS  = { ligacao:'ti-phone', whatsapp:'ti-brand-whatsapp', lembrete:'ti-bell', visita:'ti-user-check', outros:'ti-checkbox' };
const TASK_LABELS = { ligacao:'Ligação',  whatsapp:'WhatsApp',          lembrete:'Lembrete',visita:'Visita',        outros:'Outro'       };

async function renderTarefas() {
  const el = document.getElementById('v-tarefas');
  loading(el);
  const [tasks, appts] = await Promise.all([getTasks(true), getAppts()]);
  const today = new Date().toISOString().split('T')[0];

  const open     = tasks.filter(t => !t.concluida);
  const vencidas = open.filter(t => t.vencimento && t.vencimento < today);
  const hoje     = open.filter(t => t.vencimento === today);
  const futuras  = open.filter(t => !t.vencimento || t.vencimento > today);
  const done     = tasks.filter(t => t.concluida).slice(0, 30);

  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv" style="color:var(--red)">${vencidas.length}</div><div class="sl">Vencidas</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--amb)">${hoje.length}</div><div class="sl">Hoje</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--ind)">${futuras.length}</div><div class="sl">Futuras</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--grn)">${done.length}</div><div class="sl">Concluídas</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <button class="btn-new" onclick="openTask()"><i class="ti ti-plus"></i>Nova tarefa</button>
    </div>
    ${vencidas.length ? `
      <div class="sec-lbl" style="color:var(--red)">⚠ Vencidas<span>${vencidas.length}</span></div>
      <div class="task-list">${vencidas.map(t => taskCard(t, appts, 'overdue')).join('')}</div>` : ''}
    ${hoje.length ? `
      <div class="sec-lbl" style="margin-top:16px">Hoje<span>${hoje.length}</span></div>
      <div class="task-list">${hoje.map(t => taskCard(t, appts, 'today')).join('')}</div>` : ''}
    ${futuras.length ? `
      <div class="sec-lbl" style="margin-top:16px">Próximas<span>${futuras.length}</span></div>
      <div class="task-list">${futuras.map(t => taskCard(t, appts, '')).join('')}</div>` : ''}
    ${!open.length ? `<div class="empty-st"><i class="ti ti-checkbox"></i><p>Nenhuma tarefa em aberto!<br>Clique em "Nova tarefa" para criar.</p></div>` : ''}
    ${done.length ? `
      <div class="sec-lbl" style="margin-top:20px;color:var(--txt3)">Concluídas recentes<span>${done.length}</span></div>
      <div class="task-list">${done.map(t => taskCard(t, appts, 'done')).join('')}</div>` : ''}`;
}

function taskCard(t, appts, urgency) {
  const appt = appts.find(a => a.id === t.appt_id);
  const icon  = TASK_ICONS[t.tipo]  || 'ti-checkbox';
  const label = TASK_LABELS[t.tipo] || t.tipo;
  const dateStr = t.vencimento ? fmtDate(t.vencimento) + (t.hora ? ' · ' + t.hora : '') : '—';
  const bc = urgency === 'overdue' ? 'var(--red)' : urgency === 'today' ? 'var(--amb)' : t.concluida ? 'var(--txt3)' : 'var(--ind)';
  return `<div class="task-card${t.concluida ? ' done' : ''}" style="border-left-color:${bc}">
    <button class="task-cb${t.concluida ? ' checked' : ''}" onclick="toggleTask('${t.id}')">
      <i class="ti ${t.concluida ? 'ti-check' : 'ti-square'}"></i>
    </button>
    <div class="task-body">
      <div class="task-header">
        <span class="task-tipo"><i class="ti ${icon}"></i> ${label}</span>
        ${appt ? `<span class="task-lead" onclick="openNeg('${appt.id}')" style="cursor:pointer;color:var(--ind);font-size:12px;font-weight:600">${appt.cli}</span>` : ''}
      </div>
      <div class="task-desc">${t.descricao || '—'}</div>
      <div class="task-foot">
        <span><i class="ti ti-calendar" style="font-size:11px;vertical-align:-1px"></i> ${dateStr}</span>
        ${t.responsavel ? `<span><i class="ti ti-user" style="font-size:11px;vertical-align:-1px"></i> ${t.responsavel}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:5px;flex:none">
      <button class="btn-s" onclick="openTask('${t.id}')"><i class="ti ti-pencil"></i></button>
      <button class="btn-s d" onclick="delTask('${t.id}')"><i class="ti ti-trash"></i></button>
    </div>
  </div>`;
}

async function openTask(id, apptId) {
  const tasks = await getTasks();
  const t = id ? tasks.find(x => x.id === id) : null;
  document.getElementById('task-modal-title').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  document.getElementById('task-id').value        = t?.id || '';
  document.getElementById('task-appt-id').value   = t?.appt_id || apptId || '';
  document.getElementById('task-tipo').value      = t?.tipo || 'ligacao';
  document.getElementById('task-desc').value      = t?.descricao || '';
  document.getElementById('task-venc').value      = t?.vencimento || new Date().toISOString().split('T')[0];
  document.getElementById('task-hora').value      = t?.hora || '';
  document.getElementById('task-resp').value      = t?.responsavel || CU.nome;
  const appts = await getAppts();
  const sel = document.getElementById('task-lead-sel');
  sel.innerHTML = `<option value="">Sem lead vinculado</option>${
    appts.filter(a => !['venda_concluida','perdido','lead_frio'].includes(a.status))
         .map(a => `<option value="${a.id}">${a.cli}${a.vnd ? ' · ' + a.vnd : ''}</option>`).join('')
  }`;
  sel.value = t?.appt_id || apptId || '';
  document.getElementById('ov-task').classList.add('on');
}
function closeTask() { document.getElementById('ov-task').classList.remove('on'); }

async function saveTask() {
  const id        = document.getElementById('task-id').value;
  const apptId    = document.getElementById('task-lead-sel').value || document.getElementById('task-appt-id').value || null;
  const tipo      = document.getElementById('task-tipo').value;
  const descricao = document.getElementById('task-desc').value.trim();
  const vencimento= document.getElementById('task-venc').value;
  const hora      = document.getElementById('task-hora').value || null;
  const responsavel = document.getElementById('task-resp').value.trim();
  if (!tipo || !vencimento) { toast('Preencha tipo e data', 'err'); return; }
  const obj = withUnit({ tipo, descricao, vencimento, hora, responsavel, appt_id: apptId || null, criado_por: CU.login });
  let error;
  if (id) {
    ({ error } = await sb.from('eye_tasks').update(obj).eq('id', id));
  } else {
    ({ error } = await sb.from('eye_tasks').insert({ ...obj, id: uid(), concluida: false, created_at: new Date().toISOString() }));
  }
  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }
  _tasksCache = [];
  closeTask();
  toast(id ? 'Tarefa atualizada' : 'Tarefa criada');
  if (document.querySelector('#v-tarefas.on')) renderTarefas();
}

async function toggleTask(id) {
  const tasks = await getTasks();
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const { error } = await sb.from('eye_tasks').update({ concluida: !t.concluida }).eq('id', id);
  if (error) { toast('Erro', 'err'); return; }
  _tasksCache = [];
  renderTarefas();
}

async function delTask(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  await sb.from('eye_tasks').delete().eq('id', id);
  _tasksCache = [];
  toast('Tarefa excluída', 'warn');
  if (document.querySelector('#v-tarefas.on')) renderTarefas();
}

// Cria sequência automática de follow-up quando lead é agendado 3+ dias à frente
async function createFollowUpTasks(apptId, apptDate, vnd, cli) {
  const today = new Date().toISOString().split('T')[0];
  const daysAhead = Math.floor((new Date(apptDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
  if (daysAhead < 2) return;

  // Evita criar duplicatas
  const existing = (await getTasks()).filter(t => t.appt_id === apptId && !t.concluida);
  if (existing.length >= 2) return;

  const d = new Date(apptDate + 'T12:00:00');
  const seq = [
    { tipo:'whatsapp', descricao:`Confirmar presença de ${cli} · data do agendamento se aproxima`, vencimento:shiftDate(d,-2), responsavel:CU.nome },
    { tipo:'ligacao',  descricao:`Lembrete final: visita de ${cli} amanhã`,                        vencimento:shiftDate(d,-1), responsavel:CU.nome },
    { tipo:'visita',   descricao:`Acompanhar visita / test drive: ${cli}`,                         vencimento:apptDate,        responsavel:vnd||CU.nome },
    { tipo:'ligacao',  descricao:`Follow-up pós-visita: ${cli} — feedback e próximos passos`,      vencimento:shiftDate(d, 1), responsavel:vnd||CU.nome },
  ];

  const rows = seq.map(t => withUnit({ ...t, id:uid(), appt_id:apptId, concluida:false, criado_por:CU.login, created_at:new Date().toISOString() }));
  const { error } = await sb.from('eye_tasks').insert(rows);
  if (!error) { _tasksCache = []; toast('Sequência de follow-up criada! 📋'); }
}

function shiftDate(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r.toISOString().split('T')[0];
}

// Badge de tarefas pendentes no ícone da aba
async function refreshTaskBadge() {
  const tasks = await getTasks(true);
  const today = new Date().toISOString().split('T')[0];
  const pending = tasks.filter(t => !t.concluida && t.vencimento <= today).length;
  const btn = document.querySelector('[data-t="tarefas"]');
  if (!btn) return;
  const old = btn.querySelector('.task-badge');
  if (old) old.remove();
  if (pending > 0) btn.insertAdjacentHTML('beforeend', `<span class="task-badge">${pending}</span>`);
}
