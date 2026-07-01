async function renderUsers() {
  const el=document.getElementById('v-users');
  loading(el);
  const users=await getUsers(true);
  const uns=await getUnidades();
  el.innerHTML=`
    <div class="filters"><button class="btn-new" onclick="openUser()"><i class="ti ti-user-plus"></i>Novo usuário</button></div>
    <div class="sec-lbl">Usuários cadastrados<span>${users.length} no total</span></div>
    <div class="user-table">
      ${users.map(u=>{
        const unitName=uns.find(x=>x.id===u.unidade_id)?.nome||'';
        return `<div class="user-row">
          <div class="ur-av" style="background:${u.cor}">${initials(u.nome)}</div>
          <div class="ur-info">
            <b>${u.nome}</b>
            <div class="ur-login">@${u.login} · <span class="tag ${u.role==='master'?'s-pd':u.role==='gerencia'?'s-rl':u.role==='sdr'?'s-cf':'s-ag'}">${ROLE_LABELS[u.role]||u.role}</span>${unitName?` · <span style="font-size:11px;color:var(--txt3)">${unitName}</span>`:''}</div>
          </div>
          <div class="ur-acts">
            ${u.id!==CU.id?`<button class="btn-s" onclick="openUser('${u.id}')"><i class="ti ti-edit"></i>Editar</button>`:''}
            ${u.id!==CU.id?`<button class="btn-s d" onclick="delUser('${u.id}')"><i class="ti ti-trash"></i></button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function openUser(id) {
  const uns=await getUnidades();
  const unitOpts=`<option value="">Sem unidade específica</option>${uns.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('')}`;
  if(id){
    const u=(_usersCache||[]).find(x=>x.id===id);if(!u)return;
    document.getElementById('user-modal-title').textContent='Editar usuário';
    document.getElementById('u-id').value=u.id;
    document.getElementById('u-nome').value=u.nome;
    document.getElementById('u-login').value=u.login;
    document.getElementById('u-senha').value='';
    document.getElementById('u-role').value=u.role;
    document.getElementById('u-cor').value=u.cor;
    document.getElementById('u-unidade').innerHTML=unitOpts;
    document.getElementById('u-unidade').value=u.unidade_id||'';
  } else {
    document.getElementById('user-modal-title').textContent='Novo usuário';
    ['u-id','u-nome','u-login','u-senha'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('u-role').value='vendedor';
    document.getElementById('u-cor').value='#5B6EFF';
    document.getElementById('u-unidade').innerHTML=unitOpts;
    document.getElementById('u-unidade').value='';
  }
  document.getElementById('ov-user').classList.add('on');
}
function closeUser(){document.getElementById('ov-user').classList.remove('on');}

async function saveUser() {
  const nome=document.getElementById('u-nome').value.trim(), login=document.getElementById('u-login').value.trim();
  const senha=document.getElementById('u-senha').value, role=document.getElementById('u-role').value;
  const cor=document.getElementById('u-cor').value, unidade_id=document.getElementById('u-unidade').value||null;
  if(!nome||!login){toast('Preencha nome e login','err');return;}
  const eid=document.getElementById('u-id').value;
  let error;
  if(eid){
    const upd={nome,login,role,cor,unidade_id};
    if(senha) upd.senha=senha;
    ({error}=await sb.from('eye_users').update(upd).eq('id',eid));
  } else {
    if(!senha){toast('Defina uma senha','err');return;}
    const exists=(_usersCache||[]).find(u=>u.login===login);
    if(exists){toast('Login já existe','err');return;}
    ({error}=await sb.from('eye_users').insert({id:uid(),nome,login,senha,role,cor,unidade_id}));
  }
  if(error){toast('Erro: '+error.message,'err');return;}
  _usersCache=null; closeUser(); toast(eid?'Usuário atualizado':'Usuário criado'); renderUsers();
}

async function delUser(id){
  if(!confirm('Excluir este usuário?')) return;
  const{error}=await sb.from('eye_users').delete().eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return;}
  _usersCache=null; toast('Usuário removido','warn'); renderUsers();
}
