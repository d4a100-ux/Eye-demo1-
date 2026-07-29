let _kbVndFilter  = '';
let _kbDragId     = null;
let _pendingKbDrop = null;

const KB_TRAINING = {
  pendente:           { desc:'Lead novo que acabou de chegar, sem contato ainda.', fazer:'Ligar ou enviar WhatsApp em até 5 minutos. Cada minuto conta!', script:'Oi [nome]! Vi que você tem interesse em veículos. Posso te ajudar a encontrar o carro ideal hoje?', erro:'Deixar passar mais de 30 minutos sem contato — a concorrência vai agir antes.' },
  em_atendimento:     { desc:'Lead que está sendo atendido agora — conversa ativa.', fazer:'Identificar necessidade, qualificar o interesse e agendar ou avançar na jornada.', script:'Perfeito [nome]! Para eu te ajudar melhor: qual modelo você tem mais interesse? E qual seria sua forma de pagamento preferida?', erro:'Ficar apenas no WhatsApp sem avançar para agendamento ou passagem ao vendedor.' },
  qualificado:        { desc:'Lead qualificado com interesse confirmado e dados coletados.', fazer:'Agendar visita ou passar ao vendedor com briefing completo preenchido.', script:'Ótimo [nome]! Com base no que me disse, temos exatamente o que você procura. Quando você pode vir conhecer pessoalmente?', erro:'Qualificar e não dar o próximo passo — lead fica travado aqui.' },
  agendado:           { desc:'Cliente com visita marcada na loja.', fazer:'Confirmar o agendamento no dia anterior e avisar o vendedor responsável.', script:'Olá [nome], passando para confirmar sua visita amanhã às [hora]. Estamos te esperando com o [modelo] separado!', erro:'Não confirmar e o cliente não comparecer sem aviso.' },
  passado_vendedor:   { desc:'Lead já está com o vendedor para negociação presencial.', fazer:'Garantir que o vendedor recebeu o briefing e está atendendo o cliente.', script:'Já passei todas as informações para o [vendedor]. Ele vai te atender com toda atenção que você merece!', erro:'Passar sem briefing — vendedor fica sem contexto e perde oportunidade.' },
  em_negociacao:      { desc:'Cliente na loja negociando, proposta em andamento.', fazer:'Manter ritmo, apresentar opções e trabalhar objeções sem pressão excessiva.', script:'Entendo sua preocupação com [objeção]. Posso verificar uma condição especial para você? Deixa eu falar com o gerente.', erro:'Deixar o cliente ir embora sem fechar ou sem próximo passo definido.' },
  test_drive:         { desc:'Cliente fazendo ou agendado para test drive.', fazer:'Preparar o veículo, acompanhar a experiência e conectar emocionalmente.', script:'Como foi a experiência com o [modelo]? Se sentiu bem no veículo? Quer que eu verifique uma proposta personalizada?', erro:'Deixar o cliente sair sem fazer uma proposta após o test drive.' },
  ficha_enviada:      { desc:'Ficha de crédito enviada para análise.', fazer:'Acompanhar o prazo e manter o cliente informado sobre o andamento.', script:'[nome], sua ficha está em análise. Normalmente leva [prazo]. Posso te avisar assim que tiver retorno?', erro:'Deixar o cliente sem notícias — gera ansiedade e desistência.' },
  credito_aprovado:   { desc:'Crédito aprovado! Momento de fechar negócio.', fazer:'Entrar em contato imediatamente e agilizar a conclusão da venda.', script:'ÓTIMA NOTÍCIA, [nome]! Seu crédito foi aprovado! Quando podemos fechar o contrato? Podemos adiantar o processo ainda hoje?', erro:'Demorar para avisar — cliente pode ir para concorrente enquanto espera.' },
  credito_reprovado:  { desc:'Crédito reprovado — buscar alternativas para o cliente.', fazer:'Apresentar alternativas: co-participante, entrada maior, outro modelo, outro banco.', script:'[nome], aconteceu um contratempo com a aprovação, mas temos soluções. Podemos tentar com um co-participante ou ajustar a entrada. Posso verificar?', erro:'Simplesmente informar que foi reprovado sem oferecer nenhuma alternativa.' },
  ag_retorno:         { desc:'Cliente quer retornar ou aguarda mais informações.', fazer:'Definir data e hora exatas de retorno e cumprir o prazo.', script:'Perfeito [nome]! Então me fala: até quando você pretende tomar a decisão? Assim consigo manter a oferta reservada para você.', erro:'Não definir um prazo concreto — lead fica em aberto indefinidamente.' },
  venda_concluida:    { desc:'Venda fechada! Fidelização e indicação.', fazer:'Agradecer, pedir indicação e manter contato pós-venda.', script:'Parabéns [nome] pelo seu novo carro! Se tiver algum amigo que também procura veículo, ficaria feliz em atender com a mesma atenção!', erro:'Nunca mais entrar em contato após a venda — oportunidade de indicação perdida.' },
  lead_frio:          { desc:'Lead que perdeu interesse ou ficou sem resposta por muito tempo.', fazer:'Tentar reativação com nova abordagem ou oferta diferente.', script:'Oi [nome]! Sei que faz um tempo — mas acabou de chegar um modelo incrível que lembrei de você. Posso te mandar mais detalhes?', erro:'Não tentar reativar — lead descartado prematuramente.' },
  sem_resposta:       { desc:'Lead que não respondeu as tentativas de contato.', fazer:'Tentar por canais diferentes (ligação, WhatsApp, e-mail) em horários variados.', script:'Oi [nome], tentei falar com você em outro momento. Ainda tem interesse em encontrar um bom veículo? Posso ajudar!', erro:'Insistir no mesmo horário e canal — mudar a abordagem.' },
  perdido:            { desc:'Lead descartado ou que foi para a concorrência.', fazer:'Registrar o motivo da perda e tentar reativação futura estratégica.', script:'Entendemos, [nome]. Se mudar de ideia ou quiser comparar, estaremos aqui. Posso te colocar em nossa lista VIP?', erro:'Não registrar o motivo da perda — informação valiosa para melhorar o processo.' },
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
  const h = (Date.now() - new Date(a.em)) / 3600000;
  if (h >= 24) return 'card-dead';
  if (h >= 4)  return 'card-crit';
  if (h >= 2)  return 'card-warn';
  return '';
}

function alertText(a) {
  if (!a.em || !_ACTIVE_ST.includes(a.status)) return '';
  const h = (Date.now() - new Date(a.em)) / 3600000;
  if (h < 2) return '';
  const hh = h >= 24 ? `${Math.round(h)}h` : `${Math.round(h)}h`;
  return `Parado há ${hh}`;
}

async function renderCrm() {
  const el = document.getElementById('v-crm');
  loading(el);
  await getAppts();
  const vndOpts = CU.role !== 'vendedor'
    ? `<select class="fi fi-sel" id="kb-vnd-f" onchange="_kbVndFilter=this.value;_drawKanban()" style="height:34px">
        <option value="">Todos os vendedores</option>
        ${vendedores().map(v=>`<option value="${v.nome}">${v.nome}</option>`).join('')}
       </select>` : '';
  el.innerHTML = `
    <div class="filters" style="margin-bottom:12px">
      <input class="fi fi-search" style="height:34px" id="kb-q" placeholder="Buscar cliente…" oninput="_drawKanban()">
      ${vndOpts}
    </div>
    <div class="kb-board-wrap"><div id="kb-board"></div></div>`;
  _drawKanban();
}

function _drawKanban() {
  let appts = [..._apptsCache];
  if (CU.role === 'vendedor') appts = appts.filter(a => a.vnd === CU.nome);
  const vf = document.getElementById('kb-vnd-f')?.value || _kbVndFilter;
  const q  = (document.getElementById('kb-q')?.value || '').toLowerCase();
  if (vf) appts = appts.filter(a => a.vnd === vf);
  if (q)  appts = appts.filter(a => (a.cli+' '+(a.tel||'')).toLowerCase().includes(q));

  const hidden = JSON.parse(localStorage.getItem('eye_kb_hidden') || '[]');
  let visibleCols = KB_COLS.filter(col => !hidden.includes(col.id));
  // Colunas por papel
  if (CU.role === 'sdr') {
    visibleCols = visibleCols.filter(c => c.fase === 'sdr' || c.fase === 'exit' || c.id === 'credito_aprovado' || c.id === 'credito_reprovado');
  } else if (CU.role === 'vendedor') {
    visibleCols = visibleCols.filter(c => c.id === 'passado_vendedor' || c.fase === 'vnd' || c.fase === 'exit');
  }

  const phaseLabels = { sdr:'— SDR', vnd:'— Vendedor', exit:'— Saídas' };
  let lastFase = null;
  let html = '<div class="kb-board">';
  visibleCols.forEach(col => {
    if (col.fase !== lastFase) {
      html += `<div class="kb-phase-div"><span>${phaseLabels[col.fase]||col.fase}</span></div>`;
      lastFase = col.fase;
    }
    const cards = appts.filter(a => a.status === col.id);
    const totalVal = cards.reduce((s,a) => {
      const n = parseFloat((a.valor||'').replace(/[^0-9,.]/g,'').replace(',','.'));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    const valStr = totalVal >= 1000 ? `R$${(totalVal/1000).toFixed(1)}k`
                 : totalVal > 0    ? `R$${Math.round(totalVal)}`
                 : '';
    html += `
      <div class="kb-col" data-status="${col.id}"
        ondragover="event.preventDefault();this.classList.add('kb-over')"
        ondragleave="this.classList.remove('kb-over')"
        ondrop="kbDrop(event,'${col.id}')">
        <div class="kb-col-hd" style="border-top:3px solid ${col.color}">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="width:8px;height:8px;border-radius:50%;background:${col.color};flex:none;display:inline-block"></span>
            <span style="font-size:12px;font-weight:700">${col.label}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span class="kb-count">${cards.length}</span>
            ${valStr ? `<span class="kb-val">${valStr}</span>` : ''}
            <button class="kb-train-btn" onclick="event.stopPropagation();showKbTraining('${col.id}')" title="Guia">?</button>
          </div>
        </div>
        <div class="kb-col-body">
          ${cards.length ? cards.map(a => kbCard(a)).join('') : `<div class="kb-empty">Nenhum lead</div>`}
        </div>
      </div>`;
  });
  html += '</div>';
  document.getElementById('kb-board').innerHTML = html;
}

function kbCard(a) {
  const ac  = userColor(a.vnd);
  const al  = alertClass(a);
  const txt = alertText(a);
  return `
    <div class="kb-card${al?' '+al:''}" draggable="true"
      ondragstart="_kbDragId='${a.id}'"
      ondragend="document.querySelectorAll('.kb-col').forEach(c=>c.classList.remove('kb-over'))"
      onclick="openNeg('${a.id}')">
      <div class="kb-card-top">
        <div class="kb-card-av" style="background:${ac}">${initials(a.vnd)}</div>
        <div class="kb-card-info">
          <div class="kb-card-name">${esc(a.cli)}</div>
          <div class="kb-card-vnd">${esc(a.vnd)||'—'}</div>
        </div>
        ${scoreBadge(a)}
      </div>
      ${txt ? `<div class="kb-card-alert">${al==='card-dead'?'🔴':'⚠'} ${esc(txt)}</div>` : ''}
      ${a.modelo ? `<div class="kb-card-model"><i class="ti ti-car"></i>${esc(a.modelo)}</div>` : ''}
      <div class="kb-card-foot">
        ${a.valor ? `<span class="kb-card-val">${esc(a.valor)}</span>` : '<span></span>'}
        ${a.data  ? `<span class="kb-card-date"><i class="ti ti-calendar"></i>${fmtDate(a.data)}</span>` : ''}
      </div>
    </div>`;
}

async function kbDrop(event, newStatus) {
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('.kb-col').forEach(c => c.classList.remove('kb-over'));
  if (!_kbDragId) return;
  const id = _kbDragId;
  _kbDragId = null;
  const a = _apptsCache.find(x => x.id === id);
  if (!a || a.status === newStatus) return;

  // Passado ao vendedor → abre briefing antes de salvar
  if (newStatus === 'passado_vendedor') {
    _pendingBriefing = { source: 'kb', apptId: id, oldStatus: a.status };
    openBriefingModal(id);
    return;
  }

  const oldStatus = a.status;
  const now = new Date().toISOString();
  a.status = newStatus;
  a.em = now;
  _drawKanban();
  toast('Lead movido!');
  const { error } = await sb.from('eye_appts').update({ status: newStatus, em: now }).eq('id', id);
  if (error) {
    toast('Erro ao mover lead. Tente novamente.', 'err');
    a.status = oldStatus;
    _drawKanban();
    return;
  }
  if (oldStatus !== newStatus) await logStatus(id, oldStatus, newStatus);
}
