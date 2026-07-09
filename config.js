const SUPABASE_URL = 'https://imwlagfvqeexrvtiyasp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9njuZUBrHF5mxWAVJr21lg_wtxGTNBi';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STATUS = {
  pendente:       { l:'Novo Lead',        cls:'s-pd',  c:'var(--txt2)' },
  em_contato:     { l:'Em negociação',    cls:'s-ec',  c:'#5856D6'     },
  agendado:       { l:'Agendado',         cls:'s-ag',  c:'var(--ind)'  },
  ag_confirmado:  { l:'Ag. Confirmado',   cls:'s-agc', c:'#2DD4A7'     },
  confirmado:     { l:'Realizado',        cls:'s-cf',  c:'var(--grn)'  },
  realizado:      { l:'Vendido',          cls:'s-rl',  c:'var(--amb)'  },
  nao_compareceu: { l:'Não compareceu',   cls:'s-nc',  c:'var(--red)'  },
  lead_frio:      { l:'Lead Frio',        cls:'s-lf',  c:'#8E8E93'     },
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
  { id:'pendente',      label:'Novo Lead',      color:'var(--txt2)' },
  { id:'em_contato',    label:'Em negociação',  color:'#5856D6'     },
  { id:'lead_frio',     label:'Lead Frio',      color:'#8E8E93'     },
  { id:'agendado',      label:'Agendado',       color:'var(--ind)'  },
  { id:'ag_confirmado', label:'Ag. Confirmado', color:'#2DD4A7'     },
  { id:'confirmado',    label:'Realizado',      color:'var(--grn)'  },
  { id:'realizado',     label:'Vendido',        color:'var(--amb)'  },
  { id:'nao_compareceu',label:'Não compareceu', color:'var(--red)'  },
];

// Ag. Confirmado, Realizado e Vendido exigem todos os campos
const GATE_FIELDS = [
  { key:'data',  label:'Data' },
  { key:'hora',  label:'Horário' },
  { key:'vnd',   label:'Vendedor' },
  { key:'orig',  label:'Origem' },
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
