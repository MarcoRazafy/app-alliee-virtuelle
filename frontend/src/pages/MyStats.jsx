import { useEffect, useMemo, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AnimatedNumber from '../components/AnimatedNumber';
import * as statsService from '../services/statsService';
import { formatDurationShort } from '../utils/formatters';
import { notifyError } from '../utils/toast';
import '../styles/my-stats.css';

const PRESETS = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
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
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: options.withYear ? 'numeric' : undefined,
  }).format(new Date(`${dateString}T12:00:00`));
}

function formatLongDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', {
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

  if (type === 'login') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8l4 4-4 4M9 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="employee-stats-completion-ring" aria-label={`Completion rate: ${safeValue}%`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="employee-stats-ring-track" cx="52" cy="52" r={radius} />
        <circle
          className="employee-stats-ring-value"
          cx="52"
          cy="52"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ '--ring-start': circumference, '--ring-offset': dashOffset }}
        />
      </svg>
      <AnimatedNumber value={safeValue} format={(current) => `${Math.round(current)}%`} />
    </div>
  );
}

function ActivityChart({ rows }) {
  const displayedRows = rows.length > 14 ? rows.slice(-14) : rows;

  if (displayedRows.length === 0) {
    return (
      <div className="employee-stats-empty-chart">
        <span className="employee-stats-empty-icon"><Icon type="trend" /></span>
        <h3>No activity in this period</h3>
        <p>Confirmed tasks and time worked will appear here.</p>
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
    <div className="employee-stats-chart-scroll" role="img" aria-label="Trend of confirmed tasks and time worked">
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
              <title>{`${formatLongDate(row.date)} — ${row.tasks_confirmed} confirmed task(s), ${formatDurationShort(row.hours_worked_seconds)}`}</title>
              <rect
                className="employee-stats-chart-bar"
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(2, barHeight)}
                rx="6"
                style={{ '--chart-delay': `${index * 45}ms` }}
              />
              {(index % labelEvery === 0 || index === displayedRows.length - 1) && (
                <text className="employee-stats-chart-label" x={padding.left + step * index + step / 2} y={height - 19} textAnchor="middle">
                  {formatDate(row.date)}
                </text>
              )}
            </g>
          );
        })}

        <path className="employee-stats-chart-line" d={path} pathLength="1" />
        {points.map((point, index) => (
          <g key={`point-${point.row.date}`} className="employee-stats-chart-point-group" style={{ '--chart-delay': `${300 + index * 35}ms` }}>
            <circle className="employee-stats-chart-point-halo" cx={point.x} cy={point.y} r="7" />
            <circle className="employee-stats-chart-point" cx={point.x} cy={point.y} r="3.5" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatCard({ icon, label, value, format, helper, variant }) {
  return (
    <article className={`employee-stats-kpi-card employee-stats-kpi-card--${variant}`}>
      <span className="employee-stats-kpi-icon"><Icon type={icon} /></span>
      <div className="employee-stats-kpi-copy">
        <p>{label}</p>
        <AnimatedNumber as="strong" value={value} format={format} />
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
      setError('The start date must come before the end date.');
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
        const message = requestError.response?.data?.error || 'Unable to load your statistics';
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
      title="My statistics"
      breadcrumb={[{ label: 'Home', to: '/dashboard' }, { label: 'Statistics' }]}
      subtitle="Analyze your activity, your working time and your confirmed tasks"
      skeleton={loading && !stats ? 'stats' : null}
    >
      <section className="employee-stats-page">
        <div className="employee-stats-toolbar">
          <div>
            <p className="employee-stats-eyebrow">Performance dashboard</p>
            <p className="employee-stats-period-label">
              <Icon type="calendar" />
              Analyzed period: <strong>{periodLabel}</strong>
            </p>
          </div>

          <button
            type="button"
            className="employee-stats-refresh-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <Icon type="refresh" />
            Refresh
          </button>
        </div>

        <div className="employee-stats-filter-card" aria-label="Period selection">
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
                <span>From</span>
                <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <span className="employee-stats-range-separator">→</span>
              <label>
                <span>To</span>
                <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
          )}
        </div>

        {loading && (
          <div className="employee-stats-loading" role="status">
            <span className="employee-stats-loader" />
            <p>Loading your statistics…</p>
          </div>
        )}

        {!loading && error && (
          <div className="employee-stats-error-card" role="alert">
            <div>
              <strong>Unable to display statistics</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button>
          </div>
        )}

        {!loading && stats && (
          <>
            <div className="employee-stats-kpi-grid">
              <StatCard
                icon="check"
                label="Confirmed tasks"
                value={summary.tasks_confirmed ?? 0}
                helper="Work validated by an administrator"
                variant="confirmed"
              />

              <article className="employee-stats-kpi-card employee-stats-kpi-card--completion">
                <CompletionRing value={summary.completion_rate} />
                <div className="employee-stats-kpi-copy">
                  <p>Completion rate</p>
                  <AnimatedNumber
                    as="strong"
                    value={summary.completion_rate ?? 0}
                    format={(value) => `${Math.round(value)}%`}
                  />
                  <span>Based on confirmed tasks</span>
                </div>
              </article>

              <StatCard
                icon="timer"
                label="Average time per task"
                value={summary.average_time_per_task_seconds || 0}
                format={(value) => formatDurationShort(Math.round(value))}
                helper="Average of timed tasks"
                variant="average"
              />

              <StatCard
                icon="clock"
                label="Total time worked"
                value={summary.total_hours_worked_seconds || 0}
                format={(value) => formatDurationShort(Math.round(value))}
                helper="Sum of completed sessions"
                variant="time"
              />

              <StatCard
                icon="login"
                label="Connection time"
                value={summary.total_connected_seconds || 0}
                format={(value) => formatDurationShort(Math.round(value))}
                helper="Independent of time worked on tasks"
                variant="connection"
              />
            </div>

            <div className="employee-stats-main-grid">
              <article className="employee-stats-panel employee-stats-chart-panel">
                <header className="employee-stats-panel-header">
                  <div>
                    <p className="employee-stats-panel-eyebrow">Trend</p>
                    <h2>Activity over the period</h2>
                    <p>
                      {stats.by_day.length > 14
                        ? 'Showing the last 14 days with activity.'
                        : 'Comparison of time worked and confirmed tasks.'}
                    </p>
                  </div>
                  <div className="employee-stats-chart-legend" aria-label="Chart legend">
                    <span><i className="employee-stats-legend-bar" /> Time worked</span>
                    <span><i className="employee-stats-legend-line" /> Confirmed tasks</span>
                  </div>
                </header>
                <ActivityChart rows={stats.by_day} />
              </article>

              <aside className="employee-stats-insights-panel">
                <div className="employee-stats-insights-heading">
                  <span className="employee-stats-insights-icon"><Icon type="trend" /></span>
                  <div>
                    <p>Summary</p>
                    <h2>Your benchmarks</h2>
                  </div>
                </div>

                <div className="employee-stats-insight-list">
                  <div className="employee-stats-insight-item">
                    <span>Days with activity</span>
                    <AnimatedNumber as="strong" value={insights.activeDays} />
                    <small>{insights.regularity}% of the selected period</small>
                  </div>

                  <div className="employee-stats-insight-item">
                    <span>Average per active day</span>
                    <AnimatedNumber
                      as="strong"
                      value={insights.dailyAverageSeconds}
                      format={(value) => formatDurationShort(Math.round(value))}
                    />
                    <small>Recorded time worked</small>
                  </div>

                  <div className="employee-stats-insight-item">
                    <span>Most productive day</span>
                    <strong>{insights.bestDay ? formatDate(insights.bestDay.date, { withYear: true }) : '—'}</strong>
                    <small>
                      {insights.bestDay
                        ? `${insights.bestDay.tasks_confirmed} task(s) · ${formatDurationShort(insights.bestDay.hours_worked_seconds)}`
                        : 'No data available'}
                    </small>
                  </div>
                </div>

                <div className="employee-stats-definition-note">
                  <Icon type="target" />
                  <p>
                    A task counts as completed only when it has the <strong>Confirmed</strong> status.
                  </p>
                </div>
              </aside>
            </div>

            <article className="employee-stats-panel employee-stats-table-panel">
              <header className="employee-stats-panel-header employee-stats-table-header">
                <div>
                  <p className="employee-stats-panel-eyebrow">History</p>
                  <h2>Daily breakdown</h2>
                  <p>{stats.by_day.length} day(s) with data in the period.</p>
                </div>
              </header>

              {stats.by_day.length === 0 ? (
                <div className="employee-stats-empty-table">
                  <span className="employee-stats-empty-icon"><Icon type="calendar" /></span>
                  <h3>No daily data</h3>
                  <p>Try another period or start timing your tasks.</p>
                </div>
              ) : (
                <div className="employee-stats-table-scroll">
                  <table className="employee-stats-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Confirmed tasks</th>
                        <th>Time worked</th>
                        <th>Time distribution</th>
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
                              <div className="employee-stats-time-progress" aria-label={`${progress}% of the busiest day`}>
                                <span style={{ width: `${progress}%`, '--progress-scale': progress / 100 }} />
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
