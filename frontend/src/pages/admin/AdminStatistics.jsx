import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as statsService from '../../services/statsService';
import * as taskService from '../../services/taskService';
import { formatDurationShort } from '../../utils/formatters';
import { notifyError, notifyInfo } from '../../utils/toast';
import '../../styles/admin-stats.css';
import { PageSkeleton } from '../../components/Skeleton';
import AnimatedNumber from '../../components/AnimatedNumber';
import { PRESETS, LEADERBOARD_METRICS, computeRange, formatShortDate, downloadCsv } from './adminStatsHelpers';
import { Icon, CompletionRing, ActivityChart, StatusDonut } from './AdminStatsCharts';

function AdminStatistics() {
  const initial = computeRange('month');
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState('tasks'); // 'tasks' | 'presence'

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

  // Onglet Présence : employés triés par temps de connexion décroissant.
  const presenceRows = useMemo(() => {
    if (!stats) return [];
    return [...stats.by_employee].sort(
      (a, b) => Number(b.connected_seconds || 0) - Number(a.connected_seconds || 0)
    );
  }, [stats]);

  const presenceBoard = useMemo(
    () => presenceRows.filter((e) => Number(e.connected_seconds || 0) > 0).slice(0, 8),
    [presenceRows]
  );

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
    if (view === 'presence') {
      const rows = [
        ['Employé', 'Temps de connexion', 'Jours présents', 'Sessions', 'Dernière connexion'],
        ...presenceRows.map((e) => [
          e.full_name,
          formatDurationShort(e.connected_seconds),
          e.days_present,
          e.sessions_count,
          e.last_login ? formatShortDate(e.last_login.slice(0, 10)) : '—',
        ]),
      ];
      downloadCsv(`presence_equipe_${from}_${to}.csv`, rows);
      return;
    }
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
  const presenceBoardMax = Math.max(1, ...presenceBoard.map((e) => Number(e.connected_seconds || 0)));
  const totalSessions = (stats?.by_employee || []).reduce((sum, e) => sum + Number(e.sessions_count || 0), 0);
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

  if (loading && !stats) return <PageSkeleton variant="stats" />;

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

      <div className="astat-tabs">
        <button
          type="button"
          className={`astat-tab${view === 'tasks' ? ' astat-tab--active' : ''}`}
          onClick={() => setView('tasks')}
        >
          Tâches
        </button>
        <button
          type="button"
          className={`astat-tab${view === 'presence' ? ' astat-tab--active' : ''}`}
          onClick={() => setView('presence')}
        >
          Présence
        </button>
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

      {!loading && stats && view === 'tasks' && (
        <>
          <div className="astat-kpi-grid">
            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="check" /></span>
              <div>
                <p>Tâches complétées</p>
                <AnimatedNumber as="strong" value={summary.tasks_confirmed ?? 0} />
                <span>Validées par un admin</span>
              </div>
            </article>

            <article className="astat-kpi astat-kpi--ring">
              <CompletionRing value={summary.completion_rate} />
              <div>
                <p>Taux de complétion</p>
                <AnimatedNumber
                  as="strong"
                  value={summary.completion_rate ?? 0}
                  format={(value) => `${Math.round(value)}%`}
                />
                <span>Sur la période</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="timer" /></span>
              <div>
                <p>Temps moyen / tâche</p>
                <AnimatedNumber
                  as="strong"
                  value={summary.average_time_per_task_seconds || 0}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <span>Tâches chronométrées</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="clock" /></span>
              <div>
                <p>Heures travaillées</p>
                <AnimatedNumber
                  as="strong"
                  value={derived.totalHours}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <span>Total équipe</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="users" /></span>
              <div>
                <p>Employés actifs</p>
                <strong>
                  <AnimatedNumber value={derived.activeEmployees} />
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
                        style={{
                          width: `${Math.max(3, (Number(e[boardMetric] || 0) / boardMax) * 100)}%`,
                          '--board-delay': `${i * 55}ms`,
                        }}
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
                              <span
                                className="astat-completion-fill"
                                style={{ width: `${e.completion_rate}%` }}
                              />
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

      {!loading && stats && view === 'presence' && (
        <>
          <div className="astat-kpi-grid">
            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="clock" /></span>
              <div>
                <p>Temps de connexion</p>
                <AnimatedNumber
                  as="strong"
                  value={summary.total_connected_seconds || 0}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <span>Total équipe</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="timer" /></span>
              <div>
                <p>Temps moyen / employé</p>
                <AnimatedNumber
                  as="strong"
                  value={summary.average_connected_seconds || 0}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <span>Par employé présent</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="users" /></span>
              <div>
                <p>Employés présents</p>
                <strong>
                  <AnimatedNumber value={summary.present_employees || 0} />
                  <small>/{derived.employeeCount}</small>
                </strong>
                <span>Connectés sur la période</span>
              </div>
            </article>

            <article className="astat-kpi">
              <span className="astat-kpi-icon"><Icon type="calendar" /></span>
              <div>
                <p>Sessions de connexion</p>
                <AnimatedNumber as="strong" value={totalSessions} />
                <span>Ouvertures cumulées</span>
              </div>
            </article>
          </div>

          <section className="astat-panel astat-chart-panel">
            <header className="astat-panel-head">
              <div>
                <p className="astat-panel-eyebrow">Évolution</p>
                <h2>Temps de connexion par jour</h2>
              </div>
            </header>
            <ActivityChart rows={stats.by_day} metric="connected_seconds" />
          </section>

          <section className="astat-panel astat-board-panel">
            <header className="astat-panel-head">
              <div>
                <p className="astat-panel-eyebrow">Classement</p>
                <h2>Présence de l'équipe</h2>
              </div>
            </header>

            {presenceBoard.length === 0 ? (
              <p className="astat-board-empty">Aucune connexion sur cette période.</p>
            ) : (
              <ol className="astat-board">
                {presenceBoard.map((e, i) => (
                  <li key={e.user_id} className={i === 0 ? 'is-first' : ''}>
                    <span className="astat-board-rank">{i + 1}</span>
                    <span className="astat-board-name">{e.full_name}</span>
                    <div className="astat-board-bar-track">
                      <span
                        className="astat-board-bar"
                        style={{
                          width: `${Math.max(3, (Number(e.connected_seconds || 0) / presenceBoardMax) * 100)}%`,
                          '--board-delay': `${i * 55}ms`,
                        }}
                      />
                    </div>
                    <span className="astat-board-value">{formatDurationShort(e.connected_seconds)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="astat-panel astat-table-panel">
            <header className="astat-panel-head">
              <div>
                <p className="astat-panel-eyebrow">Détail</p>
                <h2>Présence par employé</h2>
              </div>
              <span className="astat-table-hint">Trié par temps de connexion</span>
            </header>

            <div className="task-table-wrap">
              <table className="task-table astat-table">
                <thead>
                  <tr>
                    <th className="astat-th astat-th--left">Employé</th>
                    <th>Temps de connexion</th>
                    <th>Jours présents</th>
                    <th>Sessions</th>
                    <th>Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {presenceRows.map((e) => (
                    <tr key={e.user_id} className="astat-row astat-row--static">
                      <td className="astat-td-name">{e.full_name}</td>
                      <td>{formatDurationShort(e.connected_seconds)}</td>
                      <td>{e.days_present}</td>
                      <td>{e.sessions_count}</td>
                      <td>{e.last_login ? formatShortDate(e.last_login.slice(0, 10)) : '—'}</td>
                    </tr>
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
