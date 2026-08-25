let _wppPollTimer = null;

function renderConfig() {
  if (CU.role !== 'master') return;
  const el = document.getElementById('v-config');
  const origins = activeOrigins();
  const vnds = vendedores();
  const goals = JSON.parse(localStorage.getItem('eye_goals') || '{}');
  const uid = currentUnitId();

  el.innerHTML = `
    <div class="sec-lbl">Configurações do sistema</div>

    <div class="cfg-section">
      <div class="cfg-section-title">Origens de leads</div>
      <div id="cfg-origins-list">
        ${Object.entries(origins).map(([name,emoji])=>`
          <div class="cfg-origin-row">
            <span class="cfg-origin-emoji">${emoji}</span>
            <span class="cfg-origin-name">${name}</span>
            <button class="btn-s d" onclick="removeOrigin('${name}')"><i class="ti ti-trash"></i></button>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <input class="finput" id="cfg-orig-emoji" placeholder="📌" style="width:56px;margin:0;text-align:center">
        <input class="finput" id="cfg-orig-name" placeholder="Nome da origem" style="flex:1;margin:0">
        <button class="btn-s p" onclick="addOrigin()"><i class="ti ti-plus"></i>Adicionar</button>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-section-title">Meta mensal por vendedor</div>
      ${vnds.length?vnds.map(v=>`
        <div class="cfg-vendor-row">
          <div class="ti-av" style="background:${v.cor};width:30px;height:30px;font-size:10px">${initials(v.nome)}</div>
          <div style="flex:1;font-size:13px;font-weight:600">${v.nome}</div>
          <span style="font-size:12px;color:var(--txt2);margin-right:6px">Meta:</span>
          <input class="cfg-goal-input" type="number" min="1" value="${goals[v.nome]||10}" onchange="saveGoal('${v.nome}',this.value)">
        </div>`).join(''):'<div style="color:var(--txt3);font-size:13px">Nenhum vendedor cadastrado</div>'}
    </div>

    <div class="cfg-section">
      <div class="cfg-section-title">Colunas do CRM</div>
      ${KB_COLS.map(col=>{
        const hidden=(JSON.parse(localStorage.getItem('eye_kb_hidden')||'[]')).includes(col.id);
        return `<div class="cfg-vendor-row">
          <div style="width:10px;height:10px;border-radius:50%;background:${col.color};flex:none"></div>
          <div style="flex:1;font-size:13px;font-weight:600;margin-left:8px">${col.label}</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2);cursor:pointer">
            <input type="checkbox" ${!hidden?'checked':''} onchange="toggleKbCol('${col.id}',this.checked)"> Visível
          </label>
        </div>`;
      }).join('')}
    </div>

    <div class="cfg-section">
      <div class="cfg-section-title" style="display:flex;align-items:center;gap:8px">
        <i class="ti ti-brand-whatsapp" style="color:#25D366;font-size:16px"></i> WhatsApp
        ${uid ? `<span style="font-size:10px;color:var(--txt3);font-weight:400">Unidade: ${uid.slice(0,8)}…</span>` : ''}
      </div>
      ${!uid ? `<div style="font-size:13px;color:var(--txt2)">Selecione uma unidade no menu para configurar o WhatsApp.</div>` : `
      <div id="cfg-wpp-content">
        <div style="text-align:center;padding:20px;color:var(--txt3)">
          <i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:22px;display:block;margin-bottom:8px"></i>
          Verificando conexão…
        </div>
      </div>`}
    </div>`;

  if (uid) _loadWppStatus();
}

function addOrigin(){
  const emoji=document.getElementById('cfg-orig-emoji').value.trim()||'📌';
  const name=document.getElementById('cfg-orig-name').value.trim();
  if(!name){toast('Digite o nome da origem','err');return;}
  localStorage.setItem('eye_origins',JSON.stringify({...activeOrigins(),[name]:emoji}));
  toast('Origem adicionada'); renderConfig();
}

function removeOrigin(name){
  if(!confirm(`Remover origem "${name}"?`)) return;
  const origins={...activeOrigins()}; delete origins[name];
  localStorage.setItem('eye_origins',JSON.stringify(origins));
  toast('Origem removida','warn'); renderConfig();
}

function saveGoal(nome,val){
  const goals=JSON.parse(localStorage.getItem('eye_goals')||'{}');
  goals[nome]=Math.max(1,parseInt(val)||10);
  localStorage.setItem('eye_goals',JSON.stringify(goals)); toast('Meta salva');
}

function toggleKbCol(id,visible){
  let hidden=JSON.parse(localStorage.getItem('eye_kb_hidden')||'[]');
  if(visible) hidden=hidden.filter(x=>x!==id);
  else if(!hidden.includes(id)) hidden.push(id);
  localStorage.setItem('eye_kb_hidden',JSON.stringify(hidden)); toast('CRM atualizado');
}

/* ── WhatsApp connection management ── */
async function _loadWppStatus() {
  const uid = currentUnitId();
  if (!uid) return;
  try {
    const res  = await fetch(`${WPP_SERVER}/status?unidadeId=${uid}`);
    const data = await res.json();
    _renderWppContent({ status: data.status, numero: data.numero || null });
  } catch(e) {
    const { data } = await sb.from('whatsapp_conexoes')
      .select('status, numero_display').eq('unidade_id', uid).maybeSingle();
    _renderWppContent(data
      ? { status: data.status, numero: data.numero_display }
      : { status: 'desconectado' });
  }
}

function _renderWppContent({ status, numero }) {
  const el = document.getElementById('cfg-wpp-content'); if (!el) return;

  if (status === 'conectado') {
    _stopWppPoll();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 4px">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--grn)"></div>
        <span style="font-size:14px;font-weight:600;color:var(--grn)">Conectado</span>
      </div>
      ${numero ? `<p style="font-size:12px;color:var(--txt3);margin:2px 0 14px">Número: ${esc(numero)}</p>` : '<div style="margin-bottom:14px"></div>'}
      <button class="btn-s d" onclick="wppDesconectar()">
        <i class="ti ti-power"></i> Desconectar
      </button>`;

  } else if (status === 'reconectando') {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:12px 0">
        <i class="ti ti-loader-2" style="animation:spin 1s linear infinite;color:var(--amb);font-size:18px"></i>
        <span style="font-size:13px;color:var(--amb)">Reconectando…</span>
      </div>`;
    _startWppPoll();

  } else {
    _stopWppPoll();
    el.innerHTML = `
      <div style="padding:6px 0 14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:var(--red)"></div>
          <span style="font-size:13px;color:var(--txt2)">Número: não conectado</span>
        </div>
        <p style="font-size:12px;color:var(--txt3);margin:0 0 14px;line-height:1.5">
          Conecte o WhatsApp da sua loja para receber<br>e responder leads pelo eye.
        </p>
      </div>
      <button class="btn-prim" style="width:auto;height:44px;padding:0 22px" onclick="wppConectar()">
        <i class="ti ti-brand-whatsapp" style="font-size:16px"></i> Conectar WhatsApp
      </button>`;
  }
}

function _startWppPoll() {
  if (_wppPollTimer) return;
  _wppPollTimer = setInterval(_loadWppStatus, 3000);
}

function _stopWppPoll() {
  if (_wppPollTimer) { clearInterval(_wppPollTimer); _wppPollTimer = null; }
}

async function wppConectar() {
  const uid = currentUnitId();
  if (!uid) { toast('Selecione uma unidade primeiro', 'err'); return; }
  const el = document.getElementById('cfg-wpp-content');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:14px;background:var(--bg2);border-radius:12px;border:1px solid var(--bdr)">
      <p style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--txt1)">
        <i class="ti ti-brand-whatsapp" style="color:#25D366"></i> Conectar via Zernio
      </p>
      <p style="font-size:12px;color:var(--txt2);margin:0 0 12px;line-height:1.5">
        1. Conecte o número no painel <strong>zernio.com</strong><br>
        2. Copie o <strong>Account ID</strong> e cole abaixo
      </p>
      <input class="finput" id="wpp-account-id" placeholder="Account ID do Zernio" style="margin-bottom:8px">
      <input class="finput" id="wpp-numero-display" placeholder="Número (ex: +55 81 99999-9999)" style="margin-bottom:12px">
      <div style="display:flex;gap:8px">
        <button class="btn-prim" style="flex:1;height:40px" onclick="wppSalvarConta()">
          <i class="ti ti-check"></i> Conectar
        </button>
        <button class="btn-s" onclick="_loadWppStatus()">Cancelar</button>
      </div>
    </div>`;
}

async function wppSalvarConta() {
  const uid       = currentUnitId();
  const accountId = document.getElementById('wpp-account-id')?.value.trim();
  const numero    = document.getElementById('wpp-numero-display')?.value.trim();
  if (!accountId) { toast('Insira o Account ID do Zernio', 'err'); return; }
  try {
    const r = await fetch(`${WPP_SERVER}/conectar-unidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidadeId: uid, accountId, numeroDisplay: numero })
    });
    const data = await r.json();
    if (!data.ok) { toast(data.erro || 'Erro ao conectar', 'err'); return; }
    toast('WhatsApp conectado via Zernio');
    _loadWppStatus();
  } catch(e) {
    toast('Erro de conexão com o servidor', 'err');
  }
}

async function wppDesconectar() {
  if (!confirm('Desconectar o WhatsApp desta unidade?')) return;
  try {
    const uid = currentUnitId();
    await fetch(`${WPP_SERVER}/desconectar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidadeId: uid })
    });
    _stopWppPoll();
    _renderWppContent({ status: 'desconectado' });
    toast('WhatsApp desconectado');
  } catch(e) {
    toast('Erro ao desconectar', 'err');
  }
}
