import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as statsService from '../../services/statsService';
import * as taskService from '../../services/taskService';
import { formatDurationShort } from '../../utils/formatters';
import { notifyError, notifyInfo } from '../../utils/toast';
import '../../styles/admin-stats.css';

const PRESETS = [
  { id: 'day', label: "Aujourd'hui" },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
  { id: 'year', label: 'Cette année' },
  { id: 'custom', label: 'Personnalisé' },
];

// Ordre du workflow. Couleurs = palette catégorielle validée (CVD ΔE 16.8, vision
// normale 16.3) ; DECLAREE reste un neutre délibéré (état « pas encore actionné »),
// toujours accompagné d'un label direct + légende (encodage secondaire).
const STATUS_ORDER = ['DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'];
const STATUS_INFO = {
  DECLAREE: { label: 'Déclarée', color: '#64748b' },
  VALIDEE: { label: 'À faire', color: '#3b82f6' },
  EN_COURS: { label: 'En cours', color: '#f59e0b' },
  TERMINEE: { label: 'Terminée', color: '#8b5cf6' },
  CONFIRMEE: { label: 'Confirmée', color: '#22c55e' },
};

const LEADERBOARD_METRICS = [
  { id: 'hours_worked_seconds', label: 'Heures travaillées', format: (v) => formatDurationShort(v) },
  { id: 'confirmed', label: 'Tâches complétées', format: (v) => String(v) },
  { id: 'completion_rate', label: '% complétion', format: (v) => `${v}%` },
];

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function computeRange(preset) {
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

function formatShortDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

function formatLongDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${dateString}T12:00:00`)
  );
}

function niceCeil(value) {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function Icon({ type }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (type === 'check')
    return (
      <svg {...common}>
        <path d="m7 12 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  if (type === 'timer')
    return (
      <svg {...common}>
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 2h6M12 5v3M12 13l3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (type === 'clock')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === 'users')
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M20.5 19a5.2 5.2 0 0 0-3.5-4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (type === 'trend')
    return (
      <svg {...common}>
        <path d="m4 17 5-5 4 3 7-8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === 'calendar')
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (type === 'download')
    return (
      <svg {...common}>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === 'refresh')
    return (
      <svg {...common}>
        <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.2 10A7 7 0 0 0 6.4 6.4L4 9M5.8 14A7 7 0 0 0 17.6 17.6L20 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return null;
}

function CompletionRing({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="astat-ring" aria-label={`Taux de complétion : ${v}%`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="astat-ring-track" cx="42" cy="42" r={r} />
        <circle
          className="astat-ring-value"
          cx="42"
          cy="42"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
        />
      </svg>
    </div>
  );
}

// --- Graphe d'activité (une mesure à la fois → un seul axe) avec survol ---
function ActivityChart({ rows, metric }) {
  const [hover, setHover] = useState(null);
  const displayed = rows.length > 30 ? rows.slice(-30) : rows;

  if (displayed.length === 0) {
    return (
      <div className="astat-empty-chart">
        <span className="astat-empty-icon"><Icon type="trend" /></span>
        <h3>Aucune activité sur cette période</h3>
        <p>Le temps travaillé et les tâches confirmées de l'équipe apparaîtront ici.</p>
      </div>
    );
  }

  const isHours = metric === 'hours_worked_seconds';
  const getVal = (row) =>
    isHours ? Number(row.hours_worked_seconds || 0) / 3600 : Number(row.tasks_confirmed || 0);

  const W = 860;
  const H = 300;
  const pad = { t: 22, r: 22, b: 42, l: 46 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const rawMax = Math.max(...displayed.map(getVal), isHours ? 0.5 : 1);
  const maxV = niceCeil(rawMax);
  const stepX = displayed.length > 1 ? iw / (displayed.length - 1) : 0;
  const xAt = (i) => (displayed.length > 1 ? pad.l + stepX * i : pad.l + iw / 2);

  const pts = displayed.map((row, i) => {
    const v = getVal(row);
    return { x: xAt(i), y: pad.t + ih - (v / maxV) * ih, v, row };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${pad.t + ih} L ${pts[0].x.toFixed(1)} ${pad.t + ih} Z`;
  const labelEvery = Math.ceil(displayed.length / 8);
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const fmtVal = (v) => (isHours ? `${v.toFixed(v < 10 ? 1 : 0)}h` : String(Math.round(v)));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let idx = displayed.length > 1 ? Math.round((px - pad.l) / stepX) : 0;
    idx = Math.max(0, Math.min(displayed.length - 1, idx));
    setHover(idx);
  }

  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="astat-chart-wrap">
      <svg className="astat-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`Évolution : ${isHours ? 'heures travaillées' : 'tâches confirmées'}`}>
        <defs>
          <linearGradient id="astat-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-lighter)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-accent-lighter)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridSteps.map((ratio) => {
          const y = pad.t + ih - ratio * ih;
          return (
            <g key={ratio}>
              <line className="astat-grid" x1={pad.l} y1={y} x2={W - pad.r} y2={y} />
              <text className="astat-axis-label" x={pad.l - 10} y={y + 4} textAnchor="end">
                {fmtVal(maxV * ratio)}
              </text>
            </g>
          );
        })}

        <path className="astat-area" d={areaPath} fill="url(#astat-area-grad)" />
        <path className="astat-line" d={linePath} />

        {pts.map((p, i) =>
          i % labelEvery === 0 || i === displayed.length - 1 ? (
            <text key={`lbl-${p.row.date}`} className="astat-axis-label" x={p.x} y={H - 16} textAnchor="middle">
              {formatShortDate(p.row.date)}
            </text>
          ) : null
        )}

        {hp && (
          <g>
            <line className="astat-crosshair" x1={hp.x} y1={pad.t} x2={hp.x} y2={pad.t + ih} />
            <circle className="astat-point-halo" cx={hp.x} cy={hp.y} r="8" />
            <circle className="astat-point" cx={hp.x} cy={hp.y} r="4" />
          </g>
        )}

        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hp && (
        <div
          className="astat-tooltip"
          style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%` }}
        >
          <span className="astat-tooltip-date">{formatLongDate(hp.row.date)}</span>
          <span className="astat-tooltip-value">
            {isHours ? formatDurationShort(hp.row.hours_worked_seconds) : `${hp.row.tasks_confirmed} tâche(s)`}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Donut de répartition par statut ---
function StatusDonut({ byStatus }) {
  const [hover, setHover] = useState(null);
  const entries = STATUS_ORDER.map((key) => ({ key, ...STATUS_INFO[key], value: byStatus[key] || 0 }));
  const total = entries.reduce((sum, e) => sum + e.value, 0);

  const r = 52;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 ? 4 : 0; // espace de 4 unités (~2px) entre segments

  let offset = 0;
  const segments = entries
    .filter((e) => e.value > 0)
    .map((e) => {
      const frac = e.value / total;
      const len = Math.max(0, frac * circ - gap);
      const seg = { ...e, dash: len, offset, frac };
      offset += frac * circ;
      return seg;
    });

  return (
    <div className="astat-donut-block">
      <div className="astat-donut">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle className="astat-donut-track" cx="70" cy="70" r={r} />
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx="70"
              cy="70"
              r={r}
              className="astat-donut-seg"
              stroke={seg.color}
              strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
              strokeDashoffset={-seg.offset}
              style={{ opacity: hover && hover !== seg.key ? 0.35 : 1 }}
              onMouseEnter={() => setHover(seg.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${seg.label} : ${seg.value} (${Math.round(seg.frac * 100)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="astat-donut-center">
          <strong>{total}</strong>
          <span>tâches</span>
        </div>
      </div>

      <ul className="astat-legend">
        {entries.map((e) => (
          <li
            key={e.key}
            className={hover && hover !== e.key ? 'is-dimmed' : ''}
            onMouseEnter={() => setHover(e.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="astat-legend-swatch" style={{ background: e.color }} />
            <span className="astat-legend-label">{e.label}</span>
            <span className="astat-legend-value">{e.value}</span>
            <span className="astat-legend-pct">{total > 0 ? Math.round((e.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminStatistics() {
  const initial = computeRange('month');
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [chartMetric, setChartMetric] = useState('hours_worked_seconds');
  const [boardMetric, setBoardMetric] = useState('hours_worked_seconds');
  const [sortKey, setSortKey] = useState('full_name');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [employeeTasks, setEmployeeTasks] = useState([]);
  const tasksCacheRef = useRef({});

  useEffect(() => {
    if (preset === 'custom') return;
    const range = computeRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to) return undefined;
    let cancelled = false;
    setLoading(true);
    statsService
      .getTeamStats(from, to)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (cancelled) return;
        notifyError(err.response?.data?.error || 'Impossible de charger les statistiques');
        setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  const derived = useMemo(() => {
    if (!stats) return null;
    const totalHours = stats.by_employee.reduce((sum, e) => sum + Number(e.hours_worked_seconds || 0), 0);
    const activeEmployees = stats.by_employee.filter(
      (e) => e.total_tasks > 0 || Number(e.hours_worked_seconds || 0) > 0
    ).length;
    return { totalHours, activeEmployees, employeeCount: stats.by_employee.length };
  }, [stats]);

  const sortedByEmployee = useMemo(() => {
    if (!stats) return [];
    const rows = [...stats.by_employee];
    rows.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return rows;
  }, [stats, sortKey, sortDir]);

  const leaderboard = useMemo(() => {
    if (!stats) return [];
    const rows = stats.by_employee.filter((e) => Number(e[boardMetric] || 0) > 0);
    rows.sort((a, b) => Number(b[boardMetric] || 0) - Number(a[boardMetric] || 0));
    return rows.slice(0, 8);
  }, [stats, boardMetric]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'full_name' ? 'asc' : 'desc');
    }
  }

  async function toggleExpand(employeeId) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    try {
      let allTasks = tasksCacheRef.current.all;
      if (!allTasks) {
        allTasks = await taskService.getTasks();
        tasksCacheRef.current.all = allTasks;
      }
      setEmployeeTasks(
        allTasks.filter((t) => t.assigned_to === employeeId && t.deadline >= from && t.deadline <= to)
      );
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger le détail des tâches');
    }
  }

  function handleExportCsv() {
    if (!stats) return;
    const rows = [
      ['Employé', 'Total tâches', 'Complétées', 'En cours', 'En retard', '% complétion', 'Heures travaillées'],
      ...sortedByEmployee.map((e) => [
        e.full_name,
        e.total_tasks,
        e.confirmed,
        e.in_progress,
        e.late,
        `${e.completion_rate}%`,
        formatDurationShort(e.hours_worked_seconds),
      ]),
    ];
    downloadCsv(`statistiques_equipe_${from}_${to}.csv`, rows);
  }

  const summary = stats?.summary || {};
  const boardMax = Math.max(1, ...leaderboard.map((e) => Number(e[boardMetric] || 0)));
  const boardFormat = LEADERBOARD_METRICS.find((m) => m.id === boardMetric)?.format || String;
  const periodLabel = `${formatShortDate(from)} – ${formatShortDate(to)}`;

  const SORT_COLS = [
    { key: 'full_name', label: 'Employé', align: 'left' },
    { key: 'total_tasks', label: 'Total' },
    { key: 'confirmed', label: 'Complétées' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'late', label: 'En retard' },
    { key: 'completion_rate', label: '% complétion' },
    { key: 'hours_worked_seconds', label: 'Heures' },
  ];

  return (
    <div className="astat-page">
      <div className="astat-toolbar">
        <div>
          <p className="astat-eyebrow">Tableau de performance de l'équipe</p>
          <p className="astat-period">
            <Icon type="calendar" />
            Période : <strong>{periodLabel}</strong>
          </p>
        </div>
        <div className="astat-toolbar-actions">
          <button type="button" className="btn-outline" onClick={handleExportCsv} disabled={!stats}>
            <Icon type="download" />
            CSV
          </button>
          <button type="button" className="btn-outline" onClick={() => notifyInfo('Export PDF bientôt disponible')}>
            <Icon type="download" />
            PDF
          </button>
          <button type="button" className="astat-refresh" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            <Icon type="refresh" />
            Actualiser
          </button>
        </div>
      </div>

      <div className="astat-segmented">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={preset === p.id ? 'is-active' : ''}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="astat-custom-range">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span>→</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      {loading && (
        <div className="astat-loading">
          <span className="admin-loading-spinner" />
          <p>Chargement des statistiques…</p>
        </div>
      )}

      {!loading && stats && (
        <>
          <div className="astat-kpi-grid">
            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="check" /></span>
              <div>
                <p>Tâches complétées</p>
                <strong>{summary.tasks_confirmed ?? 0}</strong>
                <span>Validées par un admin</span>
              </div>
            </article>

            <article className="astat-kpi astat-kpi--ring">
              <CompletionRing value={summary.completion_rate} />
              <div>
                <p>Taux de complétion</p>
                <strong>{summary.completion_rate ?? 0}%</strong>
                <span>Sur la période</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="timer" /></span>
              <div>
                <p>Temps moyen / tâche</p>
                <strong>{formatDurationShort(summary.average_time_per_task_seconds || 0)}</strong>
                <span>Tâches chronométrées</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="clock" /></span>
              <div>
                <p>Heures travaillées</p>
                <strong>{formatDurationShort(derived.totalHours)}</strong>
                <span>Total équipe</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="users" /></span>
              <div>
                <p>Employés actifs</p>
                <strong>
                  {derived.activeEmployees}
                  <small>/{derived.employeeCount}</small>
                </strong>
                <span>Avec activité</span>
              </div>
            </article>
          </div>

          <div className="astat-main-grid">
            <section className="astat-panel astat-chart-panel">
              <header className="astat-panel-head">
                <div>
                  <p className="astat-panel-eyebrow">Évolution</p>
                  <h2>Activité sur la période</h2>
                </div>
                <div className="astat-segmented astat-segmented--mini">
                  <button
                    type="button"
                    className={chartMetric === 'hours_worked_seconds' ? 'is-active' : ''}
                    onClick={() => setChartMetric('hours_worked_seconds')}
                  >
                    Heures
                  </button>
                  <button
                    type="button"
                    className={chartMetric === 'tasks_confirmed' ? 'is-active' : ''}
                    onClick={() => setChartMetric('tasks_confirmed')}
                  >
                    Tâches
                  </button>
                </div>
              </header>
              <ActivityChart rows={stats.by_day} metric={chartMetric} />
            </section>

            <section className="astat-panel astat-donut-panel">
              <header className="astat-panel-head">
                <div>
                  <p className="astat-panel-eyebrow">Répartition</p>
                  <h2>Tâches par statut</h2>
                </div>
              </header>
              <StatusDonut byStatus={stats.by_status} />
            </section>
          </div>

          <section className="astat-panel astat-board-panel">
            <header className="astat-panel-head">
              <div>
                <p className="astat-panel-eyebrow">Classement</p>
                <h2>Top de l'équipe</h2>
              </div>
              <div className="astat-segmented astat-segmented--mini">
                {LEADERBOARD_METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={boardMetric === m.id ? 'is-active' : ''}
                    onClick={() => setBoardMetric(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </header>

            {leaderboard.length === 0 ? (
              <p className="astat-board-empty">Aucune donnée à classer sur cette période.</p>
            ) : (
              <ol className="astat-board">
                {leaderboard.map((e, i) => (
                  <li key={e.user_id} className={i === 0 ? 'is-first' : ''}>
                    <span className="astat-board-rank">{i + 1}</span>
                    <span className="astat-board-name">{e.full_name}</span>
                    <div className="astat-board-bar-track">
                      <span
                        className="astat-board-bar"
                        style={{ width: `${Math.max(3, (Number(e[boardMetric] || 0) / boardMax) * 100)}%` }}
                      />
                    </div>
                    <span className="astat-board-value">{boardFormat(Number(e[boardMetric] || 0))}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="astat-panel astat-table-panel">
            <header className="astat-panel-head">
              <div>
                <p className="astat-panel-eyebrow">Détail</p>
                <h2>Par employé</h2>
              </div>
              <span className="astat-table-hint">Cliquez une ligne pour voir ses tâches</span>
            </header>

            <div className="task-table-wrap">
              <table className="task-table astat-table">
                <thead>
                  <tr>
                    {SORT_COLS.map((col) => (
                      <th
                        key={col.key}
                        className={`astat-th${col.align === 'left' ? ' astat-th--left' : ''}${
                          sortKey === col.key ? ' astat-th--active' : ''
                        }`}
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        <span className="astat-th-arrow">
                          {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedByEmployee.map((e) => (
                    <Fragment key={e.user_id}>
                      <tr className="astat-row" onClick={() => toggleExpand(e.user_id)}>
                        <td className="astat-td-name">{e.full_name}</td>
                        <td>{e.total_tasks}</td>
                        <td>{e.confirmed}</td>
                        <td>{e.in_progress}</td>
                        <td className={e.late > 0 ? 'astat-td-late' : ''}>{e.late}</td>
                        <td>
                          <span className="astat-completion">
                            <span className="astat-completion-track">
                              <span className="astat-completion-fill" style={{ width: `${e.completion_rate}%` }} />
                            </span>
                            {e.completion_rate}%
                          </span>
                        </td>
                        <td>{formatDurationShort(e.hours_worked_seconds)}</td>
                      </tr>
                      {expandedId === e.user_id && (
                        <tr className="astat-expand-row">
                          <td colSpan={7}>
                            {employeeTasks.length === 0 ? (
                              <p className="astat-expand-empty">Aucune tâche sur cette période.</p>
                            ) : (
                              <ul className="astat-expand-list">
                                {employeeTasks.map((t) => (
                                  <li key={t.id}>
                                    <span className="astat-expand-title">{t.title}</span>
                                    <span className="astat-expand-meta">
                                      {t.priority} · {t.status} · {t.deadline ? formatShortDate(t.deadline.slice(0, 10)) : '—'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminStatistics;
