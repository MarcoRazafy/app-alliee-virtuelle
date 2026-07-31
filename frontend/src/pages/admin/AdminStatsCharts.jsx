import { useState } from 'react';
import AnimatedNumber from '../../components/AnimatedNumber';
import { formatDurationShort } from '../../utils/formatters';
import { STATUS_ORDER, STATUS_INFO, niceCeil, formatShortDate, formatLongDate } from './adminStatsHelpers';

// Composants de visualisation de la page Statistiques (extraits pour alléger AdminStatistics).

export function Icon({ type }) {
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

export function CompletionRing({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 34;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (v / 100) * c;
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
          strokeDashoffset={dashOffset}
          style={{ '--ring-start': c, '--ring-offset': dashOffset }}
        />
      </svg>
      <AnimatedNumber value={v} format={(current) => `${Math.round(current)}%`} />
    </div>
  );
}

// --- Graphe d'activité (une mesure à la fois → un seul axe) avec survol ---
export function ActivityChart({ rows, metric }) {
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
        <path className="astat-line" d={linePath} pathLength="1" />

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
export function StatusDonut({ byStatus }) {
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
              style={{
                '--segment-length': seg.dash,
                '--segment-gap': circ - seg.dash,
                '--segment-offset': -seg.offset,
                '--segment-circumference': circ,
                '--segment-delay': `${segments.indexOf(seg) * 70}ms`,
                opacity: hover && hover !== seg.key ? 0.35 : 1,
              }}
              onMouseEnter={() => setHover(seg.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${seg.label} : ${seg.value} (${Math.round(seg.frac * 100)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="astat-donut-center">
          <AnimatedNumber as="strong" value={total} />
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
