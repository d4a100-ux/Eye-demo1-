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
    { l:'Agendados',       n: mine.filter(a => ['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length },
    { l:'Com vendedor',    n: mine.filter(a => ['em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length },
    { l:'Crédito aprovado',n: mine.filter(a => ['credito_aprovado','venda_concluida'].includes(a.status)).length },
    { l:'Vendidos',        n: mine.filter(a => a.status === 'venda_concluida').length },
  ];

  // Tendência 6 meses
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({
      label:  d.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }),
      leads:  mine.filter(a => (a.em||a.data||'').startsWith(key)).length,
      vendas: mine.filter(a => a.status === 'venda_concluida' && (a.data||'').startsWith(key)).length,
    });
  }

  // Por vendedor
  const vnds = vendedores().map(v => {
    const va = mine.filter(a => a.vnd === v.nome);
    return { nome:v.nome, total:va.length, vendidos:va.filter(a=>a.status==='venda_concluida').length };
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

  // Health Check — leads ativos parados há 7+ dias
  const ACTIVE_ST = ['pendente','em_atendimento','qualificado','agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','ag_retorno'];
  const stuck = mine.filter(a => {
    if (!ACTIVE_ST.includes(a.status)) return false;
    const days = a.em ? Math.floor((Date.now() - new Date(a.em)) / 86400000) : 999;
    return days >= 7;
  }).map(a => ({
    ...a,
    dias: a.em ? Math.floor((Date.now() - new Date(a.em)) / 86400000) : '?'
  })).sort((a,b) => b.dias - a.dias);

  // Relatório detalhado por vendedor (mês atual)
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const vndReport = vendedores().map(v => {
    const va = mine.filter(a => a.vnd === v.nome);
    const doMes = va.filter(a => (a.em||a.data||'').startsWith(mesAtual));
    const agendados = va.filter(a => ['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length;
    const vendidos  = va.filter(a => a.status === 'venda_concluida').length;
    const stuckVnd  = stuck.filter(a => a.vnd === v.nome).length;
    const tickets   = va.filter(a=>a.status==='venda_concluida'&&a.valor).map(a=>parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'))).filter(n=>!isNaN(n));
    const ticketMedio = tickets.length ? Math.round(tickets.reduce((s,n)=>s+n,0)/tickets.length) : 0;
    const conv = va.length ? Math.round(vendidos/va.length*100) : 0;
    return { nome:v.nome, total:va.length, doMes:doMes.length, agendados, vendidos, conv, ticketMedio, stuckVnd, score: leadScore({orig:'', em:null, tel:true}) };
  }).filter(v => v.total > 0).sort((a,b) => b.vendidos - a.vendidos);

  const ativos = await getAtivos();

  // Leads por hora (0–23)
  const byHour = Array.from({length:24}, (_,h) => ({
    h, n: mine.filter(a => {
      const dt = a.criado_em || a.em;
      if (!dt) return false;
      return new Date(dt).getHours() === h;
    }).length
  }));
  const maxHour = Math.max(...byHour.map(x=>x.n), 1);

  // Semana atual vs semana anterior
  const todayDt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = todayDt.getDay(); // 0=Sun
  const startThisWeek = new Date(todayDt); startThisWeek.setDate(todayDt.getDate() - (dayOfWeek===0?6:dayOfWeek-1));
  const startLastWeek = new Date(startThisWeek); startLastWeek.setDate(startThisWeek.getDate() - 7);
  const weekDays = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const thisWeek = weekDays.map((_,i) => {
    const d = new Date(startThisWeek); d.setDate(d.getDate()+i);
    const key = d.toISOString().split('T')[0];
    return mine.filter(a=>(a.criado_em||a.em||'').startsWith(key)).length;
  });
  const lastWeek = weekDays.map((_,i) => {
    const d = new Date(startLastWeek); d.setDate(d.getDate()+i);
    const key = d.toISOString().split('T')[0];
    return mine.filter(a=>(a.criado_em||a.em||'').startsWith(key)).length;
  });

  // SDR performance
  const users = await getUsers();
  const sdrUsers = users.filter(u=>u.role==='sdr');
  const sdrReport = sdrUsers.map(s => {
    const sa = mine.filter(a=>a.criado_por===s.login || a.sdr===s.login);
    const total = sa.length;
    const agendados = sa.filter(a=>['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length;
    const passados  = sa.filter(a=>['passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length;
    return {nome:s.nome, total, agendados, passados, conv: total ? Math.round(passados/total*100) : 0};
  }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);

  // Taxa de comparecimento
  const agendTotal = mine.filter(a=>['passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','ag_retorno','venda_concluida','perdido','lead_frio'].includes(a.status)).length;
  const compareceTotal = mine.filter(a=>['em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length;
  const compareceRate = agendTotal>0 ? Math.round(compareceTotal/agendTotal*100) : 0;

  // Relatório - dados por período (injetado via JS depois do render)
  function _biRepData(period) {
    const now2 = new Date();
    let start;
    if (period === 'hoje') {
      start = now2.toISOString().split('T')[0];
      const apptsPeriod = mine.filter(a => (a.criado_em||a.em||'').startsWith(start));
      return { appts: apptsPeriod, label:'Hoje' };
    } else if (period === 'semana') {
      const s = new Date(startThisWeek);
      const apptsPeriod = mine.filter(a => {
        const d = a.criado_em||a.em||''; return d >= s.toISOString();
      });
      return { appts: apptsPeriod, label:'Esta semana' };
    } else {
      const apptsPeriod = mine.filter(a => (a.criado_em||a.em||'').startsWith(mesAtual));
      return { appts: apptsPeriod, label:'Este mês' };
    }
  }
  window._biRepData = _biRepData;
  window._biRepPeriod = 'mes';

  el.innerHTML = `
    <div class="bi-tabs">
      <button class="bi-tab on" onclick="biTab('geral',this)">Visão Geral</button>
      <button class="bi-tab" onclick="biTab('pessoas',this)">Performance</button>
      <button class="bi-tab" onclick="biTab('origens',this)">Origens</button>
      <button class="bi-tab" onclick="biTab('estoque',this)">Estoque</button>
      <button class="bi-tab" onclick="biTab('tendencias',this)">Tendências</button>
      <button class="bi-tab" onclick="biTab('relatorios',this)">Relatórios</button>
    </div>

    <!-- VISÃO GERAL -->
    <div class="bi-section on" id="bi-s-geral">
    <div class="bi-grid">
      <div class="dash-box bi-full">
        <div class="dash-box-title">Funil de conversão</div>
        <canvas id="bi-funnel" height="70"></canvas>
      </div>
      <!-- HEALTH CHECK inline na visão geral -->
      ${stuck.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">🚨 Health Check — parados há 7+ dias
          <span style="font-size:10px;color:var(--red);font-weight:500;text-transform:none;letter-spacing:0;margin-left:6px">${stuck.length} lead${stuck.length>1?'s':''}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto">
          ${stuck.slice(0,8).map(a=>{
            const sm=STATUS[a.status]||{l:a.status,cls:'s-pd'};
            const ac=userColor(a.vnd);
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:var(--rs);border-left:3px solid var(--red)">
              <div style="width:32px;height:32px;border-radius:50%;background:${ac};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex:none">${initials(a.vnd)}</div>
              <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px">${esc(a.cli)}</div>
              <div style="font-size:11px;color:var(--txt3)">${esc(a.vnd||'—')} · <span class="tag ${sm.cls}" style="font-size:10px">${sm.l}</span></div></div>
              <div style="text-align:right;flex:none"><div style="font-size:13px;font-weight:700;color:var(--red)">${a.dias}d</div></div>
              <button class="btn-s p" style="flex:none" onclick="openNeg('${a.id}')"><i class="ti ti-pencil"></i></button>
            </div>`;
          }).join('')}
        </div>
      </div>`:''}
    </div>
    </div><!-- /bi-s-geral -->

    <!-- PERFORMANCE POR PESSOA -->
    <div class="bi-section" id="bi-s-pessoas">
    <div class="bi-grid">
      <div class="dash-box bi-full">
        <div class="dash-box-title">Conversão por vendedor</div>
        ${vnds.length?`<canvas id="bi-vendors" height="120"></canvas>`:`<div class="alert-empty">Sem dados de vendedores</div>`}
      </div>
      ${frios.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">Leads frios por vendedor <span style="font-size:10px;color:var(--red);font-weight:500;text-transform:none;letter-spacing:0;margin-left:6px">⚠ sendo abandonados</span></div>
        <canvas id="bi-frios" height="60"></canvas>
      </div>`:''}
      ${vndReport.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">Relatório — mês atual</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="color:var(--txt3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">
            <th style="text-align:left;padding:7px 10px;font-weight:600">Vendedor</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Total</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Vendidos</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Conversão</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Ticket médio</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Travados</th>
          </tr></thead><tbody>
          ${vndReport.map((v,i)=>`<tr style="border-top:0.5px solid var(--bdr);${i%2===0?'background:rgba(0,0,0,.015)':''}">
            <td style="padding:9px 10px;font-weight:600">${esc(v.nome)}</td>
            <td style="text-align:center;padding:9px 8px;color:var(--txt2)">${v.total}</td>
            <td style="text-align:center;padding:9px 8px;color:var(--grn);font-weight:700">${v.vendidos}</td>
            <td style="text-align:center;padding:9px 8px"><span style="font-weight:700;color:${v.conv>=20?'var(--grn)':v.conv>=10?'var(--amb)':'var(--red)'}">${v.conv}%</span></td>
            <td style="text-align:center;padding:9px 8px;color:var(--txt2)">${v.ticketMedio?'R$'+v.ticketMedio.toLocaleString('pt-BR'):'—'}</td>
            <td style="text-align:center;padding:9px 8px"><span style="color:${v.stuckVnd>0?'var(--red)':'var(--txt3)'};font-weight:${v.stuckVnd>0?700:400}">${v.stuckVnd>0?'⚠ '+v.stuckVnd:'0'}</span></td>
          </tr>`).join('')}
          </tbody></table></div>
      </div>`:''}
      <div class="dash-box bi-full">
        <div class="dash-box-title">Taxa de comparecimento
          <span style="font-size:10px;color:var(--txt3);text-transform:none;letter-spacing:0;margin-left:6px">agendado → em negociação</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;padding:8px 0">
          <div style="flex:1;height:12px;background:var(--bg2);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${compareceRate}%;background:linear-gradient(90deg,var(--ind),var(--grn));border-radius:6px;transition:width .8s ease"></div>
          </div>
          <span style="font-size:20px;font-weight:800;font-family:'Inter',sans-serif;color:${compareceRate>=50?'var(--grn)':compareceRate>=30?'var(--amb)':'var(--red)'};min-width:50px;text-align:right">${compareceRate}%</span>
        </div>
        <div style="font-size:12px;color:var(--txt3);margin-top:4px">${compareceTotal} de ${agendTotal} leads agendados compareceram</div>
      </div>
      ${sdrReport.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">Performance SDR</div>
        <canvas id="bi-sdr-perf" height="80"></canvas>
      </div>
      <div class="dash-box bi-full">
        <div class="dash-box-title">SDR — detalhado</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="color:var(--txt3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">
            <th style="text-align:left;padding:7px 10px;font-weight:600">SDR</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Leads</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Agendados</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Passados VND</th>
            <th style="text-align:center;padding:7px 8px;font-weight:600">Conversão</th>
          </tr></thead><tbody>
          ${sdrReport.map((s,i)=>`<tr style="border-top:0.5px solid var(--bdr);${i%2===0?'background:rgba(0,0,0,.015)':''}">
            <td style="padding:9px 10px;font-weight:600">${esc(s.nome)}</td>
            <td style="text-align:center;padding:9px 8px;color:var(--txt2)">${s.total}</td>
            <td style="text-align:center;padding:9px 8px;color:var(--ind);font-weight:700">${s.agendados}</td>
            <td style="text-align:center;padding:9px 8px;color:var(--grn);font-weight:700">${s.passados}</td>
            <td style="text-align:center;padding:9px 8px"><span style="font-weight:700;color:${s.conv>=20?'var(--grn)':s.conv>=10?'var(--amb)':'var(--red)'}">${s.conv}%</span></td>
          </tr>`).join('')}
          </tbody></table></div>
      </div>`:''}
    </div>
    </div><!-- /bi-s-pessoas -->

    <!-- ANÁLISE DE ORIGENS -->
    <div class="bi-section" id="bi-s-origens">
    <div class="bi-grid">
      <div class="dash-box">
        <div class="dash-box-title">Distribuição de leads</div>
        ${byOrig.length?`<canvas id="bi-origins" height="180"></canvas>`:`<div class="alert-empty">Sem dados de origem</div>`}
      </div>
      <div class="dash-box">
        <div class="dash-box-title">Leads por origem</div>
        ${byOrig.map(o=>{
          const pct=mine.length>0?Math.round(o.count/mine.length*100):0;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--bdr)">
            <div style="flex:1;font-size:13px;font-weight:500">${esc(o.label)}</div>
            <div style="font-size:13px;font-weight:700;color:var(--ind)">${o.count}</div>
            <div style="font-size:11px;color:var(--txt3);min-width:34px;text-align:right">${pct}%</div>
          </div>`;
        }).join('')||`<div class="alert-empty">Sem dados</div>`}
      </div>
    </div>
    </div><!-- /bi-s-origens -->

    <!-- ESTOQUE -->
    <div class="bi-section" id="bi-s-estoque">
    <div class="bi-grid">
      <div class="dash-box bi-full">
        <div class="dash-box-title">Status do estoque</div>
        <div class="stats" style="margin-bottom:0">
          <div class="stat-c"><div class="sv" style="color:var(--grn)">${ativos.filter(a=>a.status==='disponivel').length}</div><div class="sl">Disponíveis</div></div>
          <div class="stat-c"><div class="sv" style="color:var(--amb)">${ativos.filter(a=>a.status==='em_uso').length}</div><div class="sl">Em uso</div></div>
          <div class="stat-c"><div class="sv" style="color:var(--txt3)">${ativos.filter(a=>a.status==='vendido').length}</div><div class="sl">Vendidos</div></div>
          <div class="stat-c"><div class="sv" style="color:var(--ind)">${ativos.length}</div><div class="sl">Total</div></div>
        </div>
      </div>
      ${ativos.length?`<div class="dash-box bi-full">
        <div class="dash-box-title">Ativos cadastrados</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${ativos.map(a=>{
            const sc=a.status==='disponivel'?'var(--grn)':a.status==='em_uso'?'var(--amb)':'var(--txt3)';
            const sl=a.status==='disponivel'?'Disponível':a.status==='em_uso'?'Em uso':'Vendido';
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:var(--rs);border-left:3px solid ${sc}">
              <i class="ti ti-car" style="color:${sc};font-size:18px;flex:none"></i>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${esc(a.nome||a.modelo||'Veículo')}</div>
                <div style="font-size:11px;color:var(--txt3)">${[a.placa,a.ano,a.cor].filter(Boolean).join(' · ')||'—'}</div>
              </div>
              <span style="font-size:11px;font-weight:600;color:${sc};background:${sc}22;padding:2px 8px;border-radius:10px">${sl}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`:`<div class="dash-box bi-full"><div class="alert-empty">Nenhum ativo cadastrado ainda</div></div>`}
    </div>
    </div><!-- /bi-s-estoque -->

    <!-- TENDÊNCIAS -->
    <div class="bi-section" id="bi-s-tendencias">
    <div class="bi-grid">
      <div class="dash-box bi-full">
        <div class="dash-box-title">Leads por hora do dia</div>
        <div class="bi-hour-grid">
          ${byHour.map(h=>{
            const pct=maxHour>0?Math.round(h.n/maxHour*100):0;
            const bg=h.n===0?'rgba(0,0,0,.06)':`rgba(0,122,255,${(.12+.88*(h.n/maxHour)).toFixed(2)})`;
            return `<div class="bi-hour-cell" style="background:${bg}" title="${h.h.toString().padStart(2,'0')}h · ${h.n} lead${h.n!==1?'s':''}">${h.n||''}</div>`;
          }).join('')}
        </div>
        <div class="bi-hour-labels">
          ${byHour.slice(0,12).map(h=>`<div class="bi-hour-label">${h.h}h</div>`).join('')}
        </div>
        <div class="bi-hour-labels" style="margin-top:4px">
          ${byHour.slice(12).map(h=>`<div class="bi-hour-label">${h.h}h</div>`).join('')}
        </div>
      </div>
      <div class="dash-box bi-full">
        <div class="dash-box-title">Leads e vendas — últimos 6 meses</div>
        <canvas id="bi-trend" height="90"></canvas>
      </div>
      <div class="dash-box bi-full">
        <div class="dash-box-title">Crescimento mês a mês</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${months.map((m,i)=>{
            if(i===0) return '';
            const prev=months[i-1];
            const diffL=m.leads-prev.leads, diffV=m.vendas-prev.vendas;
            const colL=diffL>0?'var(--grn)':diffL<0?'var(--red)':'var(--txt3)';
            const colV=diffV>0?'var(--grn)':diffV<0?'var(--red)':'var(--txt3)';
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg);border-radius:var(--rs)">
              <div style="font-size:13px;font-weight:600;min-width:60px">${m.label}</div>
              <div style="flex:1"><span style="font-size:12px;color:var(--txt2)">Leads: </span><b>${m.leads}</b> <span style="font-size:11px;color:${colL}">${diffL>0?'+':''}${diffL}</span></div>
              <div style="flex:1"><span style="font-size:12px;color:var(--txt2)">Vendas: </span><b>${m.vendas}</b> <span style="font-size:11px;color:${colV}">${diffV>0?'+':''}${diffV}</span></div>
            </div>`;
          }).filter(Boolean).join('')}
        </div>
      </div>
      <div class="dash-box bi-full">
        <div class="dash-box-title">Semana atual vs semana anterior</div>
        <canvas id="bi-weekly" height="80"></canvas>
      </div>
    </div>
    </div><!-- /bi-s-tendencias -->

    <!-- LEADS POR HORA (no final de Tendências) embeds em secção separada
         Fica aqui para facilitar o lazy render -->

    <!-- RELATÓRIOS -->
    <div class="bi-section" id="bi-s-relatorios">
    <div class="bi-report-period">
      <button class="bi-rp-btn" onclick="biRepPeriod('hoje',this)">Hoje</button>
      <button class="bi-rp-btn" onclick="biRepPeriod('semana',this)">Esta semana</button>
      <button class="bi-rp-btn on" onclick="biRepPeriod('mes',this)">Este mês</button>
      <button class="bi-rp-btn" onclick="window.print()" style="margin-left:auto"><i class="ti ti-printer" style="font-size:13px"></i> Exportar</button>
    </div>
    <div id="bi-rep-content">
      <!-- populado por biRepPeriod() -->
    </div>
    </div><!-- /bi-s-relatorios -->
  `;

  const base = {
    responsive:true, maintainAspectRatio:true,
    plugins:{ legend:{ labels:{ font:{ family:'Inter,system-ui', size:11 }, color:'#8E8E93', boxWidth:12 } } },
  };

  // Charts render after tab switch (only if canvas is in DOM)
  function _drawBiCharts() {
    const funnelEl = document.getElementById('bi-funnel');
    if (funnelEl && !_biCharts.funnel) {
      _biCharts.funnel = new Chart(funnelEl, {
        type:'bar',
        data:{ labels:funnel.map(f=>f.l), datasets:[{ data:funnel.map(f=>f.n), backgroundColor:['#007AFF','#5856D6','#FF9F0A','#34C759','#34C759'], borderRadius:6 }] },
        options:{ ...base, indexAxis:'y', plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ color:'rgba(0,0,0,.04)' } }, y:{ grid:{ display:false } } } }
      });
    }
    const trendEl = document.getElementById('bi-trend');
    if (trendEl && !_biCharts.trend) {
      _biCharts.trend = new Chart(trendEl, {
        type:'line',
        data:{ labels:months.map(m=>m.label), datasets:[
          { label:'Leads',  data:months.map(m=>m.leads),  borderColor:'#007AFF', backgroundColor:'rgba(0,122,255,.08)', fill:true, tension:0.4, pointRadius:4 },
          { label:'Vendas', data:months.map(m=>m.vendas), borderColor:'#34C759', backgroundColor:'rgba(52,199,89,.08)', fill:true, tension:0.4, pointRadius:4 },
        ]},
        options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
      });
    }
    const vndEl = document.getElementById('bi-vendors');
    if (vndEl && !_biCharts.vendors && vnds.length) {
      _biCharts.vendors = new Chart(vndEl, {
        type:'bar',
        data:{ labels:vnds.map(v=>v.nome), datasets:[
          { label:'Vendidos',    data:vnds.map(v=>v.vendidos), backgroundColor:'#34C759', borderRadius:4 },
          { label:'Total leads', data:vnds.map(v=>v.total),    backgroundColor:'rgba(0,122,255,.15)', borderRadius:4 },
        ]},
        options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
      });
    }
    const origEl = document.getElementById('bi-origins');
    if (origEl && !_biCharts.origins && byOrig.length) {
      _biCharts.origins = new Chart(origEl, {
        type:'doughnut',
        data:{ labels:byOrig.map(o=>o.label), datasets:[{ data:byOrig.map(o=>o.count), backgroundColor:BI_COLORS, borderWidth:0 }] },
        options:{ ...base, cutout:'60%', plugins:{ legend:{ position:'right', labels:{ font:{ size:11 } } } } }
      });
    }
    const friosEl = document.getElementById('bi-frios');
    if (friosEl && !_biCharts.frios && frios.length) {
      _biCharts.frios = new Chart(friosEl, {
        type:'bar',
        data:{ labels:frios.map(v=>v.nome), datasets:[{ label:'Leads frios', data:frios.map(v=>v.frios), backgroundColor:'rgba(142,142,147,.45)', borderRadius:4 }] },
        options:{ ...base, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
      });
    }
    const weeklyEl = document.getElementById('bi-weekly');
    if (weeklyEl && !_biCharts.weekly) {
      _biCharts.weekly = new Chart(weeklyEl, {
        type:'line',
        data:{ labels:weekDays, datasets:[
          { label:'Esta semana', data:thisWeek, borderColor:'#007AFF', backgroundColor:'rgba(0,122,255,.1)', fill:true, tension:0.4, pointRadius:4, borderWidth:2 },
          { label:'Semana anterior', data:lastWeek, borderColor:'rgba(142,142,147,.6)', backgroundColor:'transparent', fill:false, tension:0.4, pointRadius:3, borderDash:[4,4], borderWidth:1.5 },
        ]},
        options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
      });
    }
    const sdrPerfEl = document.getElementById('bi-sdr-perf');
    if (sdrPerfEl && !_biCharts.sdrPerf && sdrReport.length) {
      _biCharts.sdrPerf = new Chart(sdrPerfEl, {
        type:'bar',
        data:{ labels:sdrReport.map(s=>s.nome), datasets:[
          { label:'Leads',     data:sdrReport.map(s=>s.total),    backgroundColor:'rgba(0,122,255,.2)', borderRadius:4 },
          { label:'Agendados', data:sdrReport.map(s=>s.agendados),backgroundColor:'#5856D6', borderRadius:4 },
          { label:'Passados',  data:sdrReport.map(s=>s.passados), backgroundColor:'#34C759', borderRadius:4 },
        ]},
        options:{ ...base, scales:{ y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,.04)' } }, x:{ grid:{ display:false } } } }
      });
    }
  }

  window._biDrawCharts = _drawBiCharts;
  setTimeout(_drawBiCharts, 50);
  // Pre-render relatórios with default period
  setTimeout(() => biRepPeriod('mes'), 60);
}

function biTab(id, btn) {
  document.querySelectorAll('.bi-tab').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.bi-section').forEach(s => s.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('bi-s-' + id)?.classList.add('on');
  if (id === 'relatorios') biRepPeriod(window._biRepPeriod || 'mes');
  setTimeout(() => { if (window._biDrawCharts) window._biDrawCharts(); }, 50);
}

function biRepPeriod(period, btn) {
  window._biRepPeriod = period;
  document.querySelectorAll('.bi-rp-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  else {
    const btns = document.querySelectorAll('.bi-rp-btn');
    const map = {hoje:0, semana:1, mes:2};
    if (btns[map[period]]) btns[map[period]].classList.add('on');
  }
  if (!window._biRepData) return;
  const { appts, label } = window._biRepData(period);
  const el = document.getElementById('bi-rep-content');
  if (!el) return;
  const totalLeads = appts.length;
  const agendados  = appts.filter(a=>['agendado','passado_vendedor','em_negociacao','test_drive','ficha_enviada','credito_aprovado','venda_concluida'].includes(a.status)).length;
  const vendidos   = appts.filter(a=>a.status==='venda_concluida').length;
  const conversao  = totalLeads>0 ? Math.round(vendidos/totalLeads*100) : 0;
  const tickets    = appts.filter(a=>a.status==='venda_concluida'&&a.valor).map(a=>parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'))).filter(n=>!isNaN(n));
  const ticketMed  = tickets.length ? Math.round(tickets.reduce((s,n)=>s+n,0)/tickets.length) : 0;
  const faturamento= tickets.reduce((s,n)=>s+n,0);

  const vndBrk = {};
  appts.forEach(a => {
    if (!a.vnd) return;
    if (!vndBrk[a.vnd]) vndBrk[a.vnd] = {total:0, vendidos:0};
    vndBrk[a.vnd].total++;
    if (a.status==='venda_concluida') vndBrk[a.vnd].vendidos++;
  });

  el.innerHTML = `
    <div class="dash-box" style="margin-bottom:14px">
      <div class="dash-box-title">${label}</div>
      <div class="bi-rep-kpis">
        <div class="bi-rep-kpi"><div class="brkv" style="color:var(--ind)">${totalLeads}</div><div class="brkl">Leads</div></div>
        <div class="bi-rep-kpi"><div class="brkv" style="color:#5856D6">${agendados}</div><div class="brkl">Agendados</div></div>
        <div class="bi-rep-kpi"><div class="brkv" style="color:var(--grn)">${vendidos}</div><div class="brkl">Vendidos</div></div>
        <div class="bi-rep-kpi"><div class="brkv" style="color:${conversao>=20?'var(--grn)':conversao>=10?'var(--amb)':'var(--red)'}">${conversao}%</div><div class="brkl">Conversão</div></div>
        <div class="bi-rep-kpi"><div class="brkv" style="color:var(--grn);font-size:16px">${ticketMed?'R$'+ticketMed.toLocaleString('pt-BR'):'—'}</div><div class="brkl">Ticket médio</div></div>
        <div class="bi-rep-kpi"><div class="brkv" style="color:var(--grn);font-size:16px">${faturamento?'R$'+Math.round(faturamento).toLocaleString('pt-BR'):'—'}</div><div class="brkl">Faturamento</div></div>
      </div>
    </div>
    ${Object.keys(vndBrk).length?`<div class="dash-box">
      <div class="dash-box-title">Por vendedor — ${label}</div>
      <table class="bi-rep-table">
        <thead><tr><th>Vendedor</th><th>Leads</th><th>Vendidos</th><th>Conversão</th></tr></thead>
        <tbody>${Object.entries(vndBrk).sort((a,b)=>b[1].vendidos-a[1].vendidos).map(([nome,d])=>`
          <tr><td style="font-weight:600">${esc(nome)}</td><td>${d.total}</td>
          <td style="color:var(--grn);font-weight:700">${d.vendidos}</td>
          <td><span style="font-weight:700;color:${d.total?Math.round(d.vendidos/d.total*100)>=20?'var(--grn)':Math.round(d.vendidos/d.total*100)>=10?'var(--amb)':'var(--red)':'var(--txt3)'}">${d.total?Math.round(d.vendidos/d.total*100):0}%</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`:''}`;
}

