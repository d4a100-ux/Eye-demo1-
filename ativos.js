async function renderAtivos() {
  const el = document.getElementById('v-ativos');
  loading(el);
  const [ativos, appts] = await Promise.all([getAtivos(true), getAppts()]);

  const ativoStats = ativos.map(at => {
    const leads     = appts.filter(a => a.ativo_id === at.id);
    const agendados = leads.filter(a => ['agendado','ag_confirmado','confirmado','realizado'].includes(a.status)).length;
    const vendidos  = leads.filter(a => a.status === 'realizado').length;
    const conv      = leads.length ? Math.round(vendidos / leads.length * 100) : 0;
    return { ...at, leads: leads.length, agendados, vendidos, conv };
  });

  const total       = ativos.length;
  const emUso       = ativos.filter(a => a.status === 'em_uso').length;
  const disponiveis = ativos.filter(a => a.status === 'disponivel').length;
  const vendidos    = ativos.filter(a => a.status === 'vendido').length;

  el.innerHTML = `
    <div class="stats">
      <div class="stat-c"><div class="sv">${total}</div><div class="sl">Total</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--ind)">${emUso}</div><div class="sl">Em uso</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--grn)">${disponiveis}</div><div class="sl">Disponíveis</div></div>
      <div class="stat-c"><div class="sv" style="color:var(--amb)">${vendidos}</div><div class="sl">Vendidos</div></div>
    </div>
    <div class="filters">
      <button class="btn-new" onclick="openAtivo()"><i class="ti ti-car"></i>Novo ativo</button>
    </div>
    <div class="sec-lbl">Ativos cadastrados<span>${total} no total</span></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${ativoStats.length
        ? ativoStats.map(ativoCard).join('')
        : '<div class="empty-st"><i class="ti ti-car-off"></i><p>Nenhum ativo cadastrado.<br>Clique em "Novo ativo" para começar.</p></div>'}
    </div>`;
}

function ativoCard(at) {
  const stCfg = {
    disponivel: { label:'Disponível', color:'var(--grn)'  },
    em_uso:     { label:'Em uso',     color:'var(--ind)'  },
    vendido:    { label:'Vendido',    color:'var(--txt3)' },
  };
  const st = stCfg[at.status] || { label: at.status, color:'var(--txt3)' };
  return `<div class="ac" style="--c:${st.color}">
    <div class="ac-head">
      <div class="ac-av" style="background:${st.color};font-size:18px">🚗</div>
      <div class="ac-info">
        <div class="ac-name">${at.nome}
          <span class="tag" style="background:${st.color}22;color:${st.color};border-radius:5px;padding:2px 7px;font-size:10px">${st.label}</span>
        </div>
        <div class="ac-sub">
          ${at.placa ? `<span><i class="ti ti-id-badge"></i>${at.placa}</span>` : ''}
          ${at.ano   ? `<span><i class="ti ti-calendar"></i>${at.ano}</span>`   : ''}
          ${at.cor   ? `<span><i class="ti ti-palette"></i>${at.cor}</span>`    : ''}
          ${at.vnd   ? `<span><i class="ti ti-user"></i>${at.vnd}</span>`
                     : `<span style="color:var(--txt3)"><i class="ti ti-user-off"></i> Sem vendedor</span>`}
        </div>
      </div>
    </div>
    <div class="ac-fields">
      <div class="af"><div class="afl">Leads</div><div class="afv">${at.leads}</div></div>
      <div class="af"><div class="afl">Agendados</div><div class="afv">${at.agendados}</div></div>
      <div class="af"><div class="afl">Vendidos</div><div class="afv" style="color:var(--grn)">${at.vendidos}</div></div>
      <div class="af"><div class="afl">Conversão</div>
        <div class="afv" style="color:${at.conv>=20?'var(--grn)':at.conv>=10?'var(--amb)':'var(--red)'}">${at.conv}%</div>
      </div>
    </div>
    <div class="ac-acts">
      <button class="btn-s p" onclick="openAtivo('${at.id}')"><i class="ti ti-edit"></i>Editar</button>
      <button class="btn-s d" onclick="delAtivo('${at.id}')"><i class="ti ti-trash"></i></button>
    </div>
  </div>`;
}

async function openAtivo(id) {
  await getUsers();
  const vnds = vendedores();
  const at = id ? (_ativosCache||[]).find(x => x.id === id) : null;
  document.getElementById('ativo-modal-title').textContent = at ? 'Editar ativo' : 'Novo ativo';
  document.getElementById('at-id').value     = at?.id     || '';
  document.getElementById('at-nome').value   = at?.nome   || '';
  document.getElementById('at-placa').value  = at?.placa  || '';
  document.getElementById('at-ano').value    = at?.ano    || '';
  document.getElementById('at-cor').value    = at?.cor    || '';
  document.getElementById('at-status').value = at?.status || 'disponivel';
  document.getElementById('at-vnd').innerHTML = `<option value="">Sem vendedor</option>${vnds.map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}`;
  document.getElementById('at-vnd').value    = at?.vnd    || '';
  document.getElementById('ov-ativo').classList.add('on');
}
function closeAtivo() { document.getElementById('ov-ativo').classList.remove('on'); }

async function saveAtivo() {
  const nome = document.getElementById('at-nome').value.trim();
  if (!nome) { toast('Preencha o nome do ativo', 'err'); return; }
  const eid = document.getElementById('at-id').value;
  const obj = withUnit({
    nome,
    placa:  document.getElementById('at-placa').value.trim()  || null,
    ano:    document.getElementById('at-ano').value.trim()    || null,
    cor:    document.getElementById('at-cor').value.trim()    || null,
    status: document.getElementById('at-status').value        || 'disponivel',
    vnd:    document.getElementById('at-vnd').value           || null,
  });
  let error;
  if (eid) {
    ({ error } = await sb.from('eye_ativos').update(obj).eq('id', eid));
  } else {
    ({ error } = await sb.from('eye_ativos').insert({ id: uid(), ...obj, criado_at: new Date().toISOString() }));
  }
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  _ativosCache = [];
  closeAtivo();
  toast(eid ? 'Ativo atualizado' : 'Ativo criado');
  renderAtivos();
}

async function delAtivo(id) {
  if (!confirm('Excluir este ativo?')) return;
  const { error } = await sb.from('eye_ativos').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  _ativosCache = [];
  toast('Ativo removido', 'warn');
  renderAtivos();
}
