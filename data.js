let _usersCache = null;
let _apptsCache = [];
let _unidades   = [];
let _activeUnit = null; // master pode trocar

// ─── UNIT HELPERS ──────────────────────────────────────────────────────────────
function currentUnitId() {
  if (!CU) return null;
  if (CU.role === 'master') return _activeUnit;
  return CU.unidade_id || null;
}

function applyUnitFilter(query) {
  const id = currentUnitId();
  return id ? query.eq('unidade_id', id) : query;
}

function withUnit(obj) {
  const id = currentUnitId();
  return id ? { ...obj, unidade_id: id } : obj;
}

function vendedores() {
  const id = currentUnitId();
  return (_usersCache||[]).filter(u => {
    if (u.role !== 'vendedor') return false;
    if (!id) return true;
    return !u.unidade_id || u.unidade_id === id;
  });
}

// ─── FETCH ────────────────────────────────────────────────────────────────────
async function getUnidades() {
  if (_unidades.length) return _unidades;
  const { data } = await sb.from('eye_unidades').select('*').eq('ativa', true).order('nome');
  _unidades = data || [];
  return _unidades;
}

async function getUsers(force = false) {
  if (_usersCache && !force) return _usersCache;
  const { data, error } = await sb.from('eye_users').select('*');
  if (error) { console.error('getUsers:', error); return []; }
  _usersCache = data || [];
  return _usersCache;
}

async function getAppts() {
  let q = sb.from('eye_appts').select('*').order('data').order('hora');
  q = applyUnitFilter(q);
  const { data, error } = await q;
  if (error) { console.error('getAppts:', error); return []; }
  _apptsCache = data || [];
  return _apptsCache;
}

async function refreshAll() {
  await getAppts();
  const active = document.querySelector('.view.on');
  if (!active) return;
  const id = active.id.replace('v-', '');
  const renders = { inicio:renderInicio, conv:renderConv, agenda:renderAgenda, cal:renderCal, origem:renderOrigem, negoc:renderNegoc };
  if (id === 'crm') _drawKanban();
  else if (renders[id]) await renders[id]();
  if (id === 'agenda') _filterAgenda();
}

// ─── SEED (só roda se banco estiver vazio) ────────────────────────────────────
async function initUsers() {
  const users = await getUsers();
  if (users.length > 0) return;
  const seed = [
    { id:'u1', nome:'Daniel',     login:'daniel',   senha:'daniel123',   role:'gerencia', cor:'#F5A623' },
    { id:'u2', nome:'Sabrina',    login:'sabrina',  senha:'sabrina123',  role:'sdr',      cor:'#2DD4A7' },
    { id:'u3', nome:'Sandro',     login:'sandro',   senha:'sandro123',   role:'vendedor', cor:'#5B6EFF' },
    { id:'u4', nome:'Sabrina V.', login:'sabrinav', senha:'sabrinav123', role:'vendedor', cor:'#d4537e' },
    { id:'u5', nome:'Amanda',     login:'amanda',   senha:'amanda123',   role:'vendedor', cor:'#ba7517' },
    { id:'u6', nome:'Jamila',     login:'jamila',   senha:'jamila123',   role:'vendedor', cor:'#9b59b6' },
  ];
  const { error } = await sb.from('eye_users').insert(seed);
  if (!error) _usersCache = seed;
}

async function seedAppts() {
  const { count } = await sb.from('eye_appts').select('*', { count:'exact', head:true });
  if (count > 0) return;
  const today = new Date().toISOString().split('T')[0];
  const tom   = new Date(Date.now() + 864e5).toISOString().split('T')[0];
  const seed = [
    { id:uid(), cli:'Marcos Tavares', tel:'(81) 9 8801-2233', data:today, hora:'10:00', vnd:'Sandro',     orig:'Meta Ads',           modelo:'HR-V EXL 2022',         valor:'R$ 95.000',  pgto:'À vista',              status:'confirmado', obs:'Cliente muito interessado.', prox:'Preparar carro às 9h30.', criado_por:'daniel' },
    { id:uid(), cli:'Camila Nunes',   tel:'(81) 9 9845-1100', data:today, hora:'16:00', vnd:'Sabrina V.', orig:'Meta Ads',           modelo:'Compass Longitude 2023',valor:'R$ 128.000', pgto:'Troca + financiamento', status:'agendado',   obs:'', prox:'Confirmar no WhatsApp às 14h.', criado_por:'daniel' },
    { id:uid(), cli:'Juliana Pires',  tel:'(81) 9 9912-4567', data:tom,   hora:'09:30', vnd:'Sabrina V.', orig:'Instagram Orgânico', modelo:'Corolla XEI 2022',      valor:'R$ 110.000', pgto:'Financiamento',         status:'agendado',   obs:'Perguntou sobre entrada mínima.', prox:'Preparar simulação.', criado_por:'daniel' },
    { id:uid(), cli:'Rafael Souza',   tel:'(81) 9 9700-8890', data:tom,   hora:'11:00', vnd:'Sandro',     orig:'WhatsApp Direto',   modelo:'Onix LT 2021',          valor:'R$ 72.900',  pgto:'',                      status:'pendente',   obs:'', prox:'Ligar para confirmar.', criado_por:'daniel'  },
    { id:uid(), cli:'Patrícia Melo',  tel:'(81) 9 9521-7788', data:tom,   hora:'14:00', vnd:'Amanda',     orig:'Indicação',         modelo:'T-Cross Highline 2022', valor:'R$ 88.500',  pgto:'Financiamento',         status:'agendado',   obs:'Tem entrada (~R$25k).', prox:'Separar versão prata e cinza.', criado_por:'daniel' },
  ];
  await sb.from('eye_appts').insert(seed);
}
