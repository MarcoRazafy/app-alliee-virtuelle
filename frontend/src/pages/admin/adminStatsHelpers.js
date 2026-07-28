import { formatDurationShort } from '../../utils/formatters';

// Constantes et helpers purs de la page Statistiques (extraits pour l'alléger).

export const PRESETS = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

// Ordre du workflow. Couleurs = palette catégorielle validée (CVD ΔE 16.8, vision
// normale 16.3) ; DECLAREE reste un neutre délibéré (état « pas encore actionné »),
// toujours accompagné d'un label direct + légende (encodage secondaire).
export const STATUS_ORDER = ['DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'];
export const STATUS_INFO = {
  DECLAREE: { label: 'Declared', color: '#64748b' },
  VALIDEE: { label: 'To do', color: '#3b82f6' },
  EN_COURS: { label: 'In progress', color: '#f59e0b' },
  TERMINEE: { label: 'Completed', color: '#8b5cf6' },
  CONFIRMEE: { label: 'Confirmed', color: '#22c55e' },
};

export const LEADERBOARD_METRICS = [
  { id: 'hours_worked_seconds', label: 'Hours worked', format: (v) => formatDurationShort(v) },
  { id: 'confirmed', label: 'Completed tasks', format: (v) => String(v) },
  { id: 'completion_rate', label: '% completion', format: (v) => `${v}%` },
];

export function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function computeRange(preset) {
  const to = new Date();
  const from = new Date();
  if (preset === 'week') from.setDate(from.getDate() - 6);
  if (preset === 'month') from.setDate(from.getDate() - 29);
  if (preset === 'year') {
    from.setMonth(0);
    from.setDate(1);
  }
  return { from: toDateString(from), to: toDateString(to) };
}

export function formatShortDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

export function formatLongDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${dateString}T12:00:00`)
  );
}

export function niceCeil(value) {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

export function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}
