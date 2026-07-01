function renderConfig() {
  if (CU.role !== 'master') return;
  const el = document.getElementById('v-config');
  const origins = activeOrigins();
  const vnds = vendedores();
  const goals = JSON.parse(localStorage.getItem('eye_goals') || '{}');

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
    </div>`;
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
