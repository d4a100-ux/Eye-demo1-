const SUPABASE_URL = 'https://imwlagfvqeexrvtiyasp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9njuZUBrHF5mxWAVJr21lg_wtxGTNBi';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STATUS = {
  // ── Fase SDR
  pendente:          { l:'Novo Lead',          cls:'s-pd', c:'var(--txt2)' },
  em_atendimento:    { l:'Em Atendimento',      cls:'s-ea', c:'#5856D6'    },
  qualificado:       { l:'Qualificado',         cls:'s-qa', c:'#007AFF'    },
  agendado:          { l:'Agendado',            cls:'s-ag', c:'#2DD4A7'    },
  passado_vendedor:  { l:'Passado ao Vendedor', cls:'s-pv', c:'#FF9F0A'    },
  sem_resposta:      { l:'Sem Resposta',        cls:'s-sr', c:'#8E8E93'    },
  // ── Fase Vendedor
  em_negociacao:     { l:'Em Negociação',       cls:'s-en', c:'#5856D6'    },
  test_drive:        { l:'Test Drive',          cls:'s-td', c:'#007AFF'    },
  ficha_enviada:     { l:'Ficha Enviada',       cls:'s-fi', c:'#FF9F0A'    },
  credito_aprovado:  { l:'Crédito Aprovado',    cls:'s-ca', c:'#34C759'    },
  credito_reprovado: { l:'Crédito Reprovado',   cls:'s-cr', c:'#FF3B30'    },
  ag_retorno:        { l:'Ag. Retorno',         cls:'s-ar', c:'#8E8E93'    },
  venda_concluida:   { l:'Venda Concluída',     cls:'s-vc', c:'#34C759'    },
  // ── Saídas
  lead_frio:         { l:'Lead Frio',           cls:'s-lf', c:'#8E8E93'    },
  perdido:           { l:'Perdido',             cls:'s-lo', c:'#FF3B30'    },
  // ── Legado (backward compat)
  em_contato:        { l:'Em Atendimento',      cls:'s-ea', c:'#5856D6'    },
  ag_confirmado:     { l:'Ag. Confirmado',      cls:'s-agc',c:'#2DD4A7'    },
  confirmado:        { l:'Realizado',           cls:'s-cf', c:'var(--grn)' },
  realizado:         { l:'Vendido',             cls:'s-rl', c:'var(--amb)' },
  nao_compareceu:    { l:'Não compareceu',      cls:'s-nc', c:'var(--red)' },
};

const ORIGINS = {
  'Meta Ads':           '📊',
  'Instagram Orgânico': '📸',
  'WhatsApp Direto':    '💬',
  'Indicação':          '🤝',
  'Walk-in':            '🚶',
  'OLX':                '🛒',
  'Outros':             '📌',
};

const ROLE_LABELS = { gerencia:'Gerência', sdr:'SDR', vendedor:'Vendedor', master:'Master' };

const KB_COLS = [
  {
    id: 'novo_lead',
    label: 'Novo Lead',
    color: '#5B6EFF',
    fase: 'sdr',
    statuses: ['pendente'],
    dropStatus: 'pendente'
  },
  {
    id: 'em_contato',
    label: 'Em Contato',
    color: '#5B6EFF',
    fase: 'sdr',
    statuses: ['em_atendimento', 'qualificado', 'sem_resposta'],
    dropStatus: 'em_atendimento'
  },
  {
    id: 'agendado',
    label: 'Agendado',
    color: '#34C759',
    fase: 'both',
    statuses: ['agendado', 'passado_vendedor', 'em_negociacao', 'test_drive', 'ficha_enviada', 'credito_aprovado', 'credito_reprovado', 'ag_retorno', 'venda_concluida'],
    dropStatus: 'agendado'
  }
];

// Lead Score — maior = mais quente
const ORIGIN_SCORE = { 'Indicação':9,'WhatsApp Direto':8,'Meta Ads':7,'Instagram Orgânico':7,'Walk-in':6,'OLX':5,'Outros':4 };
function leadScore(a) {
  let s = ORIGIN_SCORE[a.orig] || 5;
  const days = a.em ? Math.floor((Date.now() - new Date(a.em)) / 86400000) : 0;
  if (days > 30) s -= 3; else if (days > 14) s -= 2; else if (days > 7) s -= 1;
  if (a.tel)    s += 0.5;
  if (a.modelo) s += 0.5;
  return Math.max(1, Math.min(10, Math.round(s)));
}
function scoreBadge(a) {
  const s = leadScore(a);
  if (s >= 8) return `<span class="score-hot">🔥 ${s}</span>`;
  if (s >= 6) return `<span class="score-warm">⚡ ${s}</span>`;
  return `<span class="score-cold">❄️ ${s}</span>`;
}
