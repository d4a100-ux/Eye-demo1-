const _biCharts = {};

function _biDestroy() {
  Object.values(_biCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
}

const BI_COLORS = ['#007AFF','#5856D6','#34C759','#FF9F0A','#FF3B30','#2DD4A7','#FF6B35'];

async function renderBi() {
  const el = document.getElementById('v-bi');
  loading(el);
  _biDestroy();
  const appts = await getAppts();
  const mine = CU.role === 'vendedor' ? appts.filter(a => a.vnd === CU.nome) : appts;
  const now = new Date();

  // Funil
  const funnel = [
    { l:'Total de leads',  n: mine.length },
    { l:'Em negociação',   n: mine.filter(a => a.status === 'em_contato').length },
    { l:'Agendados',       n: mine.filter(a => ['agendado','confirmado','realizado'].includes(a.status)).length },
    { l:'Realizados',      n: mine.filter(a => ['confirmado','realizado'].includes(a.status)).length },
    { l:'Vendidos',        n: mine.filter(a => a.status === 'realizado').length },
  ];

  // Tendência 6 meses
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({
      label:  d.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }),
      leads:  mine.filter(a => (a.em||a.data||'').startsWith(key)).length,
      vendas: mine.filter(a => a.status === 'realizado' && (a.data||'').startsWith(key)).length,
    });
  }

  // Por vendedor
  const vnds = vendedores().map(v => {
    const va = mine.filter(a => a.vnd === v.nome);
    return { nome:v.nome, total:va.length, vendidos:va.filter(a=>a.status==='realizado').length };
  }).filter(v => v.total > 0).sort((a,b) => b.vendidos - a.vendidos);

  // Por origem
  const orgs = activeOrigins();
  const byOrig = Object.keys(orgs).map(o => ({
    label: `${orgs[o]} ${o}`,
    count: mine.filter(a => a.orig === o).length
  })).filter(o => o.count > 0).sort((a,b) => b.count - a.count);

  // Frios por vendedor
  const frios = vendedores().map(v => ({
    nome:  v.nome,
    frios: mine.filter(a => a.status === 'lead_frio' && a.vnd === v.nome).length
  })).filter(v => v.frios > 0).sort((a,b) => b.frios - a.frios);

  el.innerHTML = `
    <div class="bi-grid">
      <div class="dash-box bi-full">
        <div class="dash-box-title">Funil de conversão</div>
        <canvas id="bi-funnel" height="70"></canvas>
      </div>
      <div class="dash-box bi-full">
        <div class="dash-box-title">Tendência — últimos 6 meses</div>
        <canvas id="bi-trend" height="90"></canvas>
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Conversão por vendedor</div>
        ${vnds.length?`<canvas id="bi-vendors" height="150"></canvas>`:`<div class="alert-empty">Sem dados de vendedores</div>`}
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Leads por origem</div>
        ${byOrig.length?`<canvas id="bi-origins" height="150"></canvas>`:`<div class="alert-empty">Sem dados de origem</div>`}
      </div>
      ${frios.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">Leads frios por vendedor
          <span style="font-size:10px;color:var(--red);font-weight:500;text-transform:none;letter-spacing:0;margin-left:6px">⚠ leads sendo abandonados</span>
        </div>
        <canvas id="bi-frios" height="60"></canvas>
      </div>`:''}
    </div>`;

  const base = {
    responsive:true, maintainAspectRatio:true,
    plugins:{ legend:{ labels:{ font:{ family:'Inter,system-ui', size:11 }, color:'#8E8E93', boxWidth:12 } } },
  };

  _biCharts.funnel = new Chart(document.getElementById('bi-funnel'), {
    type:'bar',
    data:{
      labels: funnel.map(f=>f.l),
      datasets:[{ data:funnel.map(f=>f.n), backgroundColor:['#007AFF','#5856D6','#007AFF','#34C759','#FF9F0A'], borderRadius:6 }]
    },
    options:{ ...base, indexAxis:'y', plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ color:'rgba(0,0,0,.04)' } }, y:{ grid:{ display:false } } } }
  });

  _biCharts.trend = new Chart(document.getElementById('bi-trend'), {
    type:'line',
    data:{
      labels: months.map(m=>m.label),
      datasets:[
        { label:'Leads',  data:months.map(m=>m.leads),  borderColor:'#007AFF', backgroundColor:'rgba(0,122,255,.08)', fill:true, tension:0.4, pointRadius:4 },
        { label:'Vendas', data:months.map(m=>m.vendas), borderColor:'#34C759', backgroundColor:'rgba(52,199,89,.08)', fill:true, tension:0.4, pointRadius:4 },
      ]
    },
    options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
  });

  if (vnds.length) {
    _biCharts.vendors = new Chart(document.getElementById('bi-vendors'), {
      type:'bar',
      data:{
        labels: vnds.map(v=>v.nome),
        datasets:[
          { label:'Vendidos',    data:vnds.map(v=>v.vendidos), backgroundColor:'#34C759', borderRadius:4 },
          { label:'Total leads', data:vnds.map(v=>v.total),    backgroundColor:'rgba(0,122,255,.15)', borderRadius:4 },
        ]
      },
      options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
    });
  }

  if (byOrig.length) {
    _biCharts.origins = new Chart(document.getElementById('bi-origins'), {
      type:'doughnut',
      data:{
        labels: byOrig.map(o=>o.label),
        datasets:[{ data:byOrig.map(o=>o.count), backgroundColor:BI_COLORS, borderWidth:0 }]
      },
      options:{ ...base, cutout:'60%', plugins:{ legend:{ position:'right', labels:{ font:{ size:11 } } } } }
    });
  }

  if (frios.length) {
    _biCharts.frios = new Chart(document.getElementById('bi-frios'), {
      type:'bar',
      data:{
        labels: frios.map(v=>v.nome),
        datasets:[{ label:'Leads frios', data:frios.map(v=>v.frios), backgroundColor:'rgba(142,142,147,.45)', borderRadius:4 }]
      },
      options:{ ...base, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
    });
  }
}
