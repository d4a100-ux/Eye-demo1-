let _baseCache = [];
let _basePeriod = 'todos'; // 'todos' | 'YYYY-MM'

async function renderBase() {
  const el = document.getElementById('v-base');
  loading(el);

  // Busca TODOS os leads históricos (sem filtro de mês)
  let q = sb.from('eye_appts').select('*').order('criado_em', {ascending:false});
  q = applyUnitFilter(q);
  if (CU.role === 'vendedor') q = q.eq('vnd', CU.nome);
  const { data } = await q;
  _baseCache = data || [];

  // Monta lista de meses disponíveis
  const meses = [...new Set(_baseCache.map(a => (a.criado_em||'').slice(0,7)).filter(Boolean))].sort().reverse();
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const mesLabel = m => { const [y,mo] = m.split('-'); return `${MONTHS[parseInt(mo)-1]}/${y}`; };

  // Stats globais
  const total   = _baseCache.length;
  const vendas  = _baseCache.filter(a => a.status === 'venda_concluida').length;
  const frios   = _baseCache.filter(a => a.status === 'lead_frio').length;
  const taxa    = total > 0 ? Math.round(vendas/total*100) : 0;

  el.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:20px;font-weight:800;color:var(--txt);letter-spacing:-.5px">Base de dados</div>
      <div style="font-size:12px;color:var(--txt3);margin-top:2px">Histórico completo de leads · todos os meses</div>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Total histórico</div><div class="kpi-icon">📋</div></div><div class="kv">${total}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Conversões</div><div class="kpi-icon">✅</div></div><div class="kv" style="color:var(--grn)">${vendas}</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Taxa histórica</div><div class="kpi-icon">📈</div></div><div class="kv" style="color:${taxa>=8?'var(--grn)':taxa>=4?'var(--amb)':'var(--red)'}">${taxa}%</div></div>
      <div class="kpi-c"><div class="kpi-top"><div class="kl">Leads frios</div><div class="kpi-icon">❄️</div></div><div class="kv" style="color:var(--txt2)">${frios}</div></div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <input class="fi fi-search" id="base-q" placeholder="Buscar nome, telefone…" oninput="_filterBase()" style="flex:1;min-width:160px">
      <select class="fi fi-sel" id="base-status" onchange="_filterBase()">
        <option value="">Todos os status</option>
        <option value="venda_concluida">Vendas concluídas</option>
        <option value="lead_frio">Lead frio</option>
        <option value="perdido">Perdido</option>
        <option value="descartado">Descartado</option>
        <option value="pendente">Pendente</option>
        <option value="agendado">Agendado</option>
        <option value="em_negociacao">Em negociação</option>
      </select>
      ${CU.role !== 'vendedor' ? `<select class="fi fi-sel" id="base-vnd" onchange="_filterBase()">
        <option value="">Todos os vendedores</option>
        ${vendedores().map(v=>`<option>${esc(v.nome)}</option>`).join('')}
      </select>` : ''}
      <select class="fi fi-sel" id="base-mes" onchange="_basePeriod=this.value;_filterBase()">
        <option value="todos">Todos os meses</option>
        ${meses.map(m=>`<option value="${m}">${mesLabel(m)}</option>`).join('')}
      </select>
    </div>

    <div id="base-list"></div>`;

  _filterBase();
}

function _filterBase() {
  let appts = [..._baseCache];

  const q      = (document.getElementById('base-q')?.value     || '').toLowerCase();
  const status = document.getElementById('base-status')?.value || '';
  const vnd    = document.getElementById('base-vnd')?.value    || '';
  const mes    = document.getElementById('base-mes')?.value    || 'todos';

  if (q)      appts = appts.filter(a => `${a.cli||''} ${a.tel||''} ${a.modelo||''}`.toLowerCase().includes(q));
  if (status) appts = appts.filter(a => a.status === status);
  if (vnd)    appts = appts.filter(a => a.vnd === vnd);
  if (mes !== 'todos') appts = appts.filter(a => (a.criado_em||'').startsWith(mes));

  const el = document.getElementById('base-list');
  if (!el) return;
  if (!appts.length) {
    el.innerHTML = `<div class="empty-st"><i class="ti ti-database-off"></i><p>Nenhum lead encontrado<br>com esses filtros.</p></div>`;
    return;
  }
  el.innerHTML = `<div style="font-size:11px;color:var(--txt3);margin-bottom:10px;font-weight:500">${appts.length} lead${appts.length!==1?'s':''} encontrado${appts.length!==1?'s':''}</div><div class="appt-list">${appts.map(baseCard).join('')}</div>`;
}

function baseCard(a) {
  const ac  = userColor(a.vnd);
  const st  = fmtStatus(a.status);
  const tel55 = a.tel ? '55' + a.tel.replace(/\D/g,'') : '';
  const mes = a.criado_em ? (() => {
    const d = new Date(a.criado_em);
    return d.toLocaleDateString('pt-BR',{month:'short',year:'numeric'});
  })() : '';
  const canReativar = ['lead_frio','perdido','descartado'].includes(a.status);
  return `<div class="ac" style="--c:${st.c||'#8E8E93'}">
    <div class="ac-head">
      <div class="ac-av" style="background:${ac}">${initials(a.vnd)}</div>
      <div class="ac-info">
        <div class="ac-name">${esc(a.cli||'—')}<span class="tag ${st.cls}">${st.l}</span></div>
        <div class="ac-sub">
          ${a.vnd ?`<span><i class="ti ti-user"></i>${esc(a.vnd)}</span>`:''}
          ${isMgr()&&a.criado_por?`<span style="color:var(--txt3)"><i class="ti ti-headset"></i>${esc((_usersCache||[]).find(u=>u.login===a.criado_por)?.nome||a.criado_por)}</span>`:''}
          ${a.tel ?`<span><i class="ti ti-phone"></i>${a.tel}</span>`:''}
          ${a.orig?`<span><i class="ti ti-map-pin"></i>${esc(a.orig)}</span>`:''}
          ${mes   ?`<span><i class="ti ti-calendar"></i>${mes}</span>`:''}
        </div>
      </div>
    </div>
    ${a.modelo||a.valor?`<div class="ac-fields">
      ${a.modelo?`<div class="af"><div class="afl">Modelo</div><div class="afv">${esc(a.modelo)}</div></div>`:''}
      ${a.valor ?`<div class="af"><div class="afl">Valor</div><div class="afv">${esc(a.valor)}</div></div>`:''}
    </div>`:''}
    ${a.obs?`<div class="ac-neg"><div class="neg-lbl">Obs.</div><div>${esc(a.obs)}</div></div>`:''}
    <div class="ac-acts">
      ${tel55?`<a href="https://wa.me/${tel55}" target="_blank" class="btn-s"><i class="ti ti-brand-whatsapp" style="color:#25D366"></i>WhatsApp</a>`:''}
      ${canReativar?`<button class="btn-s p" onclick="reativarLead('${a.id}')"><i class="ti ti-refresh"></i>Reativar</button>`:''}
      <button class="btn-s" onclick="openNeg('${a.id}')"><i class="ti ti-eye"></i>Ver</button>
      ${canDelete()?`<button class="btn-s d" onclick="delAppt('${a.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div>
  </div>`;
}

async function reativarLead(id) {
  _confirmDialog('Reativar este lead? Ele voltará para "Pendente" no mês atual.', async () => {
    const { error } = await sb.from('eye_appts').update({ status:'pendente' }).eq('id', id);
    if (error) { toast('Erro: ' + error.message, 'err'); return; }
    await logStatus(id, 'lead_frio', 'pendente');
    toast('Lead reativado!');
    await renderBase();
  });
}
