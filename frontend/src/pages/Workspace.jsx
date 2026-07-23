import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as statsService from '../services/statsService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { formatClock, formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline } from '../utils/taskStatus';
import { notifySuccess, notifyError } from '../utils/toast';
import {
  IconPlay,
  IconStop,
  IconExternalLink,
  IconChecklist,
  IconClock,
  IconCheckCircle,
  IconLayers,
  IconAlert,
  IconLightbulb,
  IconX,
  IconArrowRight,
} from '../components/icons';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function Workspace() {
  const [dayTasks, setDayTasks] = useState([]);
  const [dayValidated, setDayValidated] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [secondsWorkedToday, setSecondsWorkedToday] = useState(0);
  const [showTip, setShowTip] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async () => {
    const selection = await taskService.getMyDay();
    setDayValidated(selection.length > 0 && selection.every((item) => item.validated_at));
    const tasks = selection.map((item) => ({ id: item.task_id, ...item.task_data }));
    setDayTasks(tasks);

    const inProgress = tasks.filter((t) => t.status === 'EN_COURS');
    if (inProgress.length === 0) {
      setActiveTaskId(null);
      setActiveSession(null);
      return;
    }
    const histories = await Promise.all(inProgress.map((t) => taskService.getTimelogHistory(t.id)));
    const activeIndex = histories.findIndex((history) => history.some((s) => !s.end_time));
    if (activeIndex === -1) {
      setActiveTaskId(null);
      setActiveSession(null);
    } else {
      setActiveTaskId(inProgress[activeIndex].id);
      setActiveSession(histories[activeIndex].find((s) => !s.end_time));
    }
  }, []);

  const loadStatsToday = useCallback(async () => {
    const date = todayDateString();
    const stats = await statsService.getMyStats(date, date);
    setSecondsWorkedToday(stats.summary.total_hours_worked_seconds);
  }, []);

  useEffect(() => {
    loadDay().finally(() => setLoading(false));
    loadStatsToday();
  }, [loadDay, loadStatsToday]);

  // Repère les changements faits ailleurs (autre onglet, page de détail...) sans recharger la page
  useEffect(() => {
    const poll = setInterval(() => {
      loadDay();
      loadStatsToday();
    }, 8000);
    return () => clearInterval(poll);
  }, [loadDay, loadStatsToday]);

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(activeSession.start_time).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  async function handleStart(taskId) {
    setPendingTaskId(taskId);
    try {
      const result = await taskService.startTimelog(taskId);
      if (result.switchedFromTaskId) {
        notifySuccess(`Chrono précédent arrêté (${formatDurationShort(result.switchedFromDuration)}), nouveau chrono démarré`);
      } else {
        notifySuccess('Chrono démarré');
      }
      await loadDay();
    } catch (err) {
      if (err.response?.status === 409) {
        notifyError('Le chrono est déjà actif sur cette tâche');
      } else {
        notifyError(err.response?.data?.error || 'Impossible de démarrer le chrono');
      }
    } finally {
      setPendingTaskId(null);
    }
  }

  async function handleStop() {
    if (!activeTaskId) return;
    setPendingTaskId(activeTaskId);
    try {
      const result = await taskService.stopTimelog(activeTaskId);
      notifySuccess(`Chrono arrêté - ${formatDurationShort(result.duration)} enregistrées`);
      await loadDay();
      await loadStatsToday();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'arrêter le chrono");
    } finally {
      setPendingTaskId(null);
    }
  }

  const activeTask = dayTasks.find((t) => t.id === activeTaskId);
  const inCourseCount = dayTasks.filter((t) => t.status === 'EN_COURS').length;
  const doneCount = dayTasks.filter((t) => t.status === 'TERMINEE' || t.status === 'CONFIRMEE').length;
  const upcoming = [...dayTasks]
    .filter((t) => t.status === 'VALIDEE' || t.status === 'EN_COURS')
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  return (
    <EmployeeLayout
      title="Mon espace"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Mon espace' }]}
      subtitle="Vue d'aujourd'hui et suivi de vos tâches sélectionnées"
      skeleton={loading ? 'cards' : null}
    >
      <div className="workspace-grid">
        <div className="workspace-main">
          {activeTask ? (
            <div className="chrono-hero">
              <div className="chrono-hero-info">
                <p className="chrono-hero-label">
                  <span className="chrono-hero-dot" /> Chrono actif
                </p>
                <h2 className="chrono-hero-title">{activeTask.title}</h2>
                {activeTask.list_name && <p className="chrono-hero-project">{activeTask.list_name}</p>}
                <div className="chrono-hero-meta">
                  <div>
                    <span className="chrono-hero-meta-label">Statut</span>
                    <span className={`pill ${STATUS_PILL[activeTask.status]?.className || ''}`}>
                      {STATUS_PILL[activeTask.status]?.label || activeTask.status}
                    </span>
                  </div>
                  <div>
                    <span className="chrono-hero-meta-label">Priorité</span>
                    <span className={`pill ${priorityPillClass(activeTask.priority)}`}>
                      {activeTask.priority}
                    </span>
                  </div>
                </div>
                <div className="chrono-hero-actions">
                  <button className="btn-danger" onClick={handleStop} disabled={pendingTaskId === activeTaskId}>
                    <IconStop /> Arrêter le chrono
                  </button>
                  <Link to={`/tasks/${activeTask.id}`} className="btn-outline">
                    Voir le détail <IconArrowRight />
                  </Link>
                </div>
              </div>
              <div className="chrono-ring-wrap">
                <div className="chrono-ring" />
                <div className="chrono-ring-inner">
                  <span className="chrono-ring-value">{formatClock(elapsed)}</span>
                  <span className="chrono-ring-caption">Temps écoulé</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="chrono-empty">
              <span className="chrono-empty-icon">
                <IconPlay />
              </span>
              <div>
                <strong>Aucun chrono actif.</strong> Démarrez une tâche ci-dessous pour commencer à suivre votre temps.
              </div>
            </div>
          )}

          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">
                Mes tâches du jour <span className="dnd-column-count">{dayTasks.length} sélectionnée{dayTasks.length > 1 ? 's' : ''}</span>
              </p>
              <Link to="/tasks" className="app-link">
                Voir toutes les tâches <IconArrowRight />
              </Link>
            </div>

            {!dayValidated && dayTasks.length === 0 && (
              <div className="info-banner">
                <IconChecklist />
                <span>
                  Aucune tâche sélectionnée ? Retournez à <Link to="/my-day">Ma journée</Link> pour constituer votre
                  sélection.
                </span>
              </div>
            )}
            {dayTasks.length === 0 && dayValidated && (
              <div className="empty-state">Aucune tâche sélectionnée pour aujourd'hui.</div>
            )}

            {dayTasks.length > 0 && (
              <div className="task-table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Tâche</th>
                      <th>Échéance</th>
                      <th>Statut</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dayTasks.map((task) => {
                      const isActive = task.id === activeTaskId;
                      const canStart = ['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status);
                      return (
                        <tr key={task.id}>
                          <td>
                            {isActive ? (
                              <button
                                className="play-btn play-btn--stop"
                                onClick={handleStop}
                                disabled={pendingTaskId === task.id}
                                aria-label="Arrêter le chrono"
                              >
                                <IconStop />
                              </button>
                            ) : (
                              <button
                                className="play-btn play-btn--start"
                                onClick={() => handleStart(task.id)}
                                disabled={!canStart || pendingTaskId === task.id}
                                aria-label="Démarrer le chrono"
                              >
                                <IconPlay />
                              </button>
                            )}
                          </td>
                          <td>
                            <div className="task-table-title-cell">
                              <Link to={`/tasks/${task.id}`} className="task-table-title">
                                {task.title}
                              </Link>
                              {task.list_name && <span className="task-table-project">{task.list_name}</span>}
                            </div>
                          </td>
                          <td>{formatRelativeDeadline(task.deadline)}</td>
                          <td>
                            <span className={`pill ${STATUS_PILL[task.status]?.className || ''}`}>
                              {STATUS_PILL[task.status]?.label || task.status}
                            </span>
                          </td>
                          <td>
                            <Link to={`/tasks/${task.id}`} className="icon-link-btn" aria-label="Ouvrir la tâche">
                              <IconExternalLink />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="workspace-side">
          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Résumé du jour</p>
              <Link to="/stats" className="app-link">
                Voir tout <IconArrowRight />
              </Link>
            </div>
            <div className="stat-tile-grid">
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--blue">
                  <IconChecklist />
                </span>
                <div>
                  <div className="stat-tile-value">{dayTasks.length}</div>
                  <div className="stat-tile-label">Total sélectionnées</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--amber">
                  <IconClock />
                </span>
                <div>
                  <div className="stat-tile-value">{inCourseCount}</div>
                  <div className="stat-tile-label">En cours</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--green">
                  <IconCheckCircle />
                </span>
                <div>
                  <div className="stat-tile-value">{doneCount}</div>
                  <div className="stat-tile-label">Terminées</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--purple">
                  <IconLayers />
                </span>
                <div>
                  <div className="stat-tile-value">{formatDurationShort(secondsWorkedToday)}</div>
                  <div className="stat-tile-label">Temps travaillé</div>
                </div>
              </div>
            </div>
          </div>

          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Prochaines échéances</p>
              <Link to="/tasks" className="app-link">
                Voir tout <IconArrowRight />
              </Link>
            </div>
            {upcoming.length === 0 && <div className="empty-state">Aucune échéance à venir.</div>}
            {upcoming.map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`} className="deadline-item">
                <span className="deadline-item-icon">
                  <IconAlert />
                </span>
                <span className="deadline-item-info">
                  <span className="deadline-item-title">{task.title}</span>
                  {task.list_name && <span className="deadline-item-project">{task.list_name}</span>}
                </span>
                <span className="deadline-item-date">{formatRelativeDeadline(task.deadline)}</span>
              </Link>
            ))}
          </div>

          {showTip && (
            <div className="tip-card">
              <span className="tip-card-icon">
                <IconLightbulb />
              </span>
              <div>
                <p className="tip-card-title">Astuce du jour</p>
                <p className="tip-card-text">Planifiez vos priorités le matin pour une journée plus productive.</p>
              </div>
              <button className="tip-card-close" onClick={() => setShowTip(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>
          )}
        </div>
      </div>
    </EmployeeLayout>
  );
}

export default Workspace;
