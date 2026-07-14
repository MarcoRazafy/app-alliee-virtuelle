import { useEffect, useMemo, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import * as statsService from '../services/statsService';
import { formatDurationShort } from '../utils/formatters';
import { notifyError } from '../utils/toast';
import '../styles/my-stats.css';

const PRESETS = [
  { id: 'day', label: "Aujourd'hui" },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
  { id: 'year', label: 'Cette année' },
  { id: 'custom', label: 'Personnalisé' },
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

function formatDate(dateString, options = {}) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: options.withYear ? 'numeric' : undefined,
  }).format(new Date(`${dateString}T12:00:00`));
}

function formatLongDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`));
}

function getPeriodDayCount(from, to) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const milliseconds = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(milliseconds / 86400000) + 1);
}

function Icon({ type }) {
  if (type === 'check') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m7 12 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'target') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M18 6 21 3M17 3h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === 'timer') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 2h6M12 5v3M12 13l3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === 'clock') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === 'trend') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m4 17 5-5 4 3 7-8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === 'refresh') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.2 10A7 7 0 0 0 6.4 6.4L4 9M5.8 14A7 7 0 0 0 17.6 17.6L20 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}

function CompletionRing({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="employee-stats-completion-ring" aria-label={`Taux de complétion : ${safeValue}%`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="employee-stats-ring-track" cx="52" cy="52" r={radius} />
        <circle
          className="employee-stats-ring-value"
          cx="52"
          cy="52"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span>{safeValue}%</span>
    </div>
  );
}

function ActivityChart({ rows }) {
  const displayedRows = rows.length > 14 ? rows.slice(-14) : rows;

  if (displayedRows.length === 0) {
    return (
      <div className="employee-stats-empty-chart">
        <span className="employee-stats-empty-icon"><Icon type="trend" /></span>
        <h3>Aucune activité sur cette période</h3>
        <p>Les tâches confirmées et le temps travaillé apparaîtront ici.</p>
      </div>
    );
  }

  const width = 840;
  const height = 280;
  const padding = { top: 24, right: 22, bottom: 52, left: 26 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxHours = Math.max(1, ...displayedRows.map((row) => Number(row.hours_worked_seconds || 0) / 3600));
  const maxTasks = Math.max(1, ...displayedRows.map((row) => Number(row.tasks_confirmed || 0)));
  const step = innerWidth / displayedRows.length;
  const barWidth = Math.max(12, Math.min(34, step * 0.44));

  const points = displayedRows.map((row, index) => {
    const tasks = Number(row.tasks_confirmed || 0);
    const x = padding.left + step * index + step / 2;
    const y = padding.top + innerHeight - (tasks / maxTasks) * innerHeight;
    return { x, y, tasks, row };
  });

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const labelEvery = displayedRows.length > 10 ? 2 : 1;

  return (
    <div className="employee-stats-chart-scroll" role="img" aria-label="Évolution des tâches confirmées et du temps travaillé">
      <svg className="employee-stats-activity-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + innerHeight - ratio * innerHeight;
          return <line key={ratio} className="employee-stats-chart-grid" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />;
        })}

        {displayedRows.map((row, index) => {
          const hours = Number(row.hours_worked_seconds || 0) / 3600;
          const barHeight = (hours / maxHours) * innerHeight;
          const x = padding.left + step * index + step / 2 - barWidth / 2;
          const y = padding.top + innerHeight - barHeight;

          return (
            <g key={row.date}>
              <title>{`${formatLongDate(row.date)} — ${row.tasks_confirmed} tâche(s) confirmée(s), ${formatDurationShort(row.hours_worked_seconds)}`}</title>
              <rect className="employee-stats-chart-bar" x={x} y={y} width={barWidth} height={Math.max(2, barHeight)} rx="6" />
              {(index % labelEvery === 0 || index === displayedRows.length - 1) && (
                <text className="employee-stats-chart-label" x={padding.left + step * index + step / 2} y={height - 19} textAnchor="middle">
                  {formatDate(row.date)}
                </text>
              )}
            </g>
          );
        })}

        <path className="employee-stats-chart-line" d={path} />
        {points.map((point) => (
          <g key={`point-${point.row.date}`}>
            <circle className="employee-stats-chart-point-halo" cx={point.x} cy={point.y} r="7" />
            <circle className="employee-stats-chart-point" cx={point.x} cy={point.y} r="3.5" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatCard({ icon, label, value, helper, variant }) {
  return (
    <article className={`employee-stats-kpi-card employee-stats-kpi-card--${variant}`}>
      <span className="employee-stats-kpi-icon"><Icon type={icon} /></span>
      <div className="employee-stats-kpi-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}

function MyStats() {
  const initialRange = computeRange('month');
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (preset === 'custom') return;
    const range = computeRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to) return undefined;
    if (from > to) {
      setStats(null);
      setLoading(false);
      setError('La date de début doit précéder la date de fin.');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    statsService
      .getMyStats(from, to)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((requestError) => {
        if (cancelled) return;
        const message = requestError.response?.data?.error || 'Impossible de charger vos statistiques';
        setError(message);
        setStats(null);
        notifyError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  const insights = useMemo(() => {
    const rows = stats?.by_day || [];
    const periodDays = getPeriodDayCount(from, to);
    const activeDays = rows.filter(
      (row) => Number(row.tasks_confirmed || 0) > 0 || Number(row.hours_worked_seconds || 0) > 0
    ).length;

    const bestDay = rows.reduce((best, row) => {
      if (!best) return row;
      const currentTasks = Number(row.tasks_confirmed || 0);
      const bestTasks = Number(best.tasks_confirmed || 0);
      if (currentTasks !== bestTasks) return currentTasks > bestTasks ? row : best;
      return Number(row.hours_worked_seconds || 0) > Number(best.hours_worked_seconds || 0) ? row : best;
    }, null);

    const totalSeconds = Number(stats?.summary?.total_hours_worked_seconds || 0);

    return {
      activeDays,
      regularity: Math.min(100, Math.round((activeDays / periodDays) * 100)),
      bestDay,
      dailyAverageSeconds: activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
    };
  }, [stats, from, to]);

  const summary = stats?.summary || {};
  const periodLabel = `${formatDate(from, { withYear: true })} – ${formatDate(to, { withYear: true })}`;

  return (
    <EmployeeLayout
      title="Mes statistiques"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Statistiques' }]}
      subtitle="Analysez votre activité, votre temps de travail et vos tâches confirmées"
    >
      <section className="employee-stats-page">
        <div className="employee-stats-toolbar">
          <div>
            <p className="employee-stats-eyebrow">Tableau de performance</p>
            <p className="employee-stats-period-label">
              <Icon type="calendar" />
              Période analysée : <strong>{periodLabel}</strong>
            </p>
          </div>

          <button
            type="button"
            className="employee-stats-refresh-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <Icon type="refresh" />
            Actualiser
          </button>
        </div>

        <div className="employee-stats-filter-card" aria-label="Sélection de la période">
          <div className="employee-stats-segmented-control">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? 'is-active' : ''}
                onClick={() => setPreset(item.id)}
                aria-pressed={preset === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="employee-stats-custom-range">
              <label>
                <span>Du</span>
                <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <span className="employee-stats-range-separator">→</span>
              <label>
                <span>Au</span>
                <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
          )}
        </div>

        {loading && (
          <div className="employee-stats-loading" role="status">
            <span className="employee-stats-loader" />
            <p>Chargement de vos statistiques…</p>
          </div>
        )}

        {!loading && error && (
          <div className="employee-stats-error-card" role="alert">
            <div>
              <strong>Impossible d’afficher les statistiques</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Réessayer</button>
          </div>
        )}

        {!loading && stats && (
          <>
            <div className="employee-stats-kpi-grid">
              <StatCard
                icon="check"
                label="Tâches confirmées"
                value={summary.tasks_confirmed ?? 0}
                helper="Travail validé par un administrateur"
                variant="confirmed"
              />

              <article className="employee-stats-kpi-card employee-stats-kpi-card--completion">
                <CompletionRing value={summary.completion_rate} />
                <div className="employee-stats-kpi-copy">
                  <p>Taux de complétion</p>
                  <strong>{summary.completion_rate ?? 0}%</strong>
                  <span>Basé sur les tâches confirmées</span>
                </div>
              </article>

              <StatCard
                icon="timer"
                label="Temps moyen par tâche"
                value={formatDurationShort(summary.average_time_per_task_seconds || 0)}
                helper="Moyenne des tâches chronométrées"
                variant="average"
              />

              <StatCard
                icon="clock"
                label="Temps travaillé total"
                value={formatDurationShort(summary.total_hours_worked_seconds || 0)}
                helper="Somme des sessions terminées"
                variant="time"
              />
            </div>

            <div className="employee-stats-main-grid">
              <article className="employee-stats-panel employee-stats-chart-panel">
                <header className="employee-stats-panel-header">
                  <div>
                    <p className="employee-stats-panel-eyebrow">Évolution</p>
                    <h2>Activité sur la période</h2>
                    <p>
                      {stats.by_day.length > 14
                        ? 'Affichage des 14 derniers jours avec activité.'
                        : 'Comparaison du temps travaillé et des tâches confirmées.'}
                    </p>
                  </div>
                  <div className="employee-stats-chart-legend" aria-label="Légende du graphique">
                    <span><i className="employee-stats-legend-bar" /> Temps travaillé</span>
                    <span><i className="employee-stats-legend-line" /> Tâches confirmées</span>
                  </div>
                </header>
                <ActivityChart rows={stats.by_day} />
              </article>

              <aside className="employee-stats-insights-panel">
                <div className="employee-stats-insights-heading">
                  <span className="employee-stats-insights-icon"><Icon type="trend" /></span>
                  <div>
                    <p>Résumé</p>
                    <h2>Vos repères</h2>
                  </div>
                </div>

                <div className="employee-stats-insight-list">
                  <div className="employee-stats-insight-item">
                    <span>Jours avec activité</span>
                    <strong>{insights.activeDays}</strong>
                    <small>{insights.regularity}% de la période sélectionnée</small>
                  </div>

                  <div className="employee-stats-insight-item">
                    <span>Moyenne par jour actif</span>
                    <strong>{formatDurationShort(insights.dailyAverageSeconds)}</strong>
                    <small>Temps travaillé enregistré</small>
                  </div>

                  <div className="employee-stats-insight-item">
                    <span>Journée la plus productive</span>
                    <strong>{insights.bestDay ? formatDate(insights.bestDay.date, { withYear: true }) : '—'}</strong>
                    <small>
                      {insights.bestDay
                        ? `${insights.bestDay.tasks_confirmed} tâche(s) · ${formatDurationShort(insights.bestDay.hours_worked_seconds)}`
                        : 'Aucune donnée disponible'}
                    </small>
                  </div>
                </div>

                <div className="employee-stats-definition-note">
                  <Icon type="target" />
                  <p>
                    Une tâche est comptée comme complétée uniquement lorsqu’elle est au statut <strong>Confirmée</strong>.
                  </p>
                </div>
              </aside>
            </div>

            <article className="employee-stats-panel employee-stats-table-panel">
              <header className="employee-stats-panel-header employee-stats-table-header">
                <div>
                  <p className="employee-stats-panel-eyebrow">Historique</p>
                  <h2>Détail par jour</h2>
                  <p>{stats.by_day.length} journée(s) avec des données sur la période.</p>
                </div>
              </header>

              {stats.by_day.length === 0 ? (
                <div className="employee-stats-empty-table">
                  <span className="employee-stats-empty-icon"><Icon type="calendar" /></span>
                  <h3>Aucune donnée quotidienne</h3>
                  <p>Essayez une autre période ou commencez à chronométrer vos tâches.</p>
                </div>
              ) : (
                <div className="employee-stats-table-scroll">
                  <table className="employee-stats-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Tâches confirmées</th>
                        <th>Temps travaillé</th>
                        <th>Répartition du temps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...stats.by_day].reverse().map((day) => {
                        const maxDailySeconds = Math.max(
                          1,
                          ...stats.by_day.map((row) => Number(row.hours_worked_seconds || 0))
                        );
                        const progress = Math.round((Number(day.hours_worked_seconds || 0) / maxDailySeconds) * 100);

                        return (
                          <tr key={day.date}>
                            <td>
                              <strong>{formatLongDate(day.date)}</strong>
                            </td>
                            <td>
                              <span className="employee-stats-table-count">{day.tasks_confirmed}</span>
                            </td>
                            <td>{formatDurationShort(day.hours_worked_seconds)}</td>
                            <td>
                              <div className="employee-stats-time-progress" aria-label={`${progress}% du jour le plus travaillé`}>
                                <span style={{ width: `${progress}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </>
        )}
      </section>
    </EmployeeLayout>
  );
}

export default MyStats;
