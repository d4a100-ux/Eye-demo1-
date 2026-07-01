const SUPABASE_URL = 'https://imwlagfvqeexrvtiyasp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9njuZUBrHF5mxWAVJr21lg_wtxGTNBi';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STATUS = {
  pendente:       { l:'Novo Lead',      cls:'s-pd', c:'var(--txt2)' },
  em_contato:     { l:'Em negociação',  cls:'s-ec', c:'#5856D6'     },
  agendado:       { l:'Agendado',       cls:'s-ag', c:'var(--ind)'  },
  confirmado:     { l:'Realizado',      cls:'s-cf', c:'var(--grn)'  },
  realizado:      { l:'Vendido',        cls:'s-rl', c:'var(--amb)'  },
  nao_compareceu: { l:'Não compareceu', cls:'s-nc', c:'var(--red)'  },
  lead_frio:      { l:'Lead Frio',      cls:'s-lf', c:'#8E8E93'     },
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
  { id:'pendente',       label:'Novo Lead',      color:'var(--txt2)' },
  { id:'em_contato',     label:'Em negociação',  color:'#5856D6'     },
  { id:'lead_frio',      label:'Lead Frio',      color:'#8E8E93'     },
  { id:'agendado',       label:'Agendado',       color:'var(--ind)'  },
  { id:'confirmado',     label:'Realizado',      color:'var(--grn)'  },
  { id:'realizado',      label:'Vendido',        color:'var(--amb)'  },
  { id:'nao_compareceu', label:'Não compareceu', color:'var(--red)'  },
];

const GATE_FIELDS = [
  { key:'data',  label:'Data' },
  { key:'hora',  label:'Horário' },
  { key:'vnd',   label:'Vendedor' },
  { key:'orig',  label:'Origem' },
];
