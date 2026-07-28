import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as statsService from '../services/statsService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AnimatedNumber from '../components/AnimatedNumber';
import { formatClock, formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, priorityLabel, formatRelativeDeadline } from '../utils/taskStatus';
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
  const [noTasksAvailable, setNoTasksAvailable] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [secondsWorkedToday, setSecondsWorkedToday] = useState(0);
  const [showTip, setShowTip] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async () => {
    const [selection, allTasks] = await Promise.all([taskService.getMyDay(), taskService.getTasks()]);
    const selectionValidated = selection.length > 0 && selection.every((item) => item.validated_at);
    const hasAvailableTasks = allTasks.some((task) => task.status === 'VALIDEE' || task.status === 'EN_COURS');
    setNoTasksAvailable(!hasAvailableTasks);
    setDayValidated(selectionValidated || !hasAvailableTasks);
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
        notifySuccess(`Previous timer stopped (${formatDurationShort(result.switchedFromDuration)}), new timer started`);
      } else {
        notifySuccess('Timer started');
      }
      await loadDay();
    } catch (err) {
      if (err.response?.status === 409) {
        notifyError('The timer is already running on this task');
      } else {
        notifyError(err.response?.data?.error || 'Unable to start the timer');
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
      notifySuccess(`Timer stopped - ${formatDurationShort(result.duration)} recorded`);
      await loadDay();
      await loadStatsToday();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to stop the timer');
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
      title="My space"
      breadcrumb={[{ label: 'Home', to: '/dashboard' }, { label: 'My space' }]}
      subtitle="Today's view and tracking of your selected tasks"
      skeleton={loading ? 'cards' : null}
    >
      <div className="workspace-grid">
        <div className="workspace-main">
          {activeTask ? (
            <div className="chrono-hero">
              <div className="chrono-hero-info">
                <p className="chrono-hero-label">
                  <span className="chrono-hero-dot" /> Active timer
                </p>
                <h2 className="chrono-hero-title">{activeTask.title}</h2>
                {activeTask.list_name && <p className="chrono-hero-project">{activeTask.list_name}</p>}
                <div className="chrono-hero-meta">
                  <div>
                    <span className="chrono-hero-meta-label">Status</span>
                    <span className={`pill ${STATUS_PILL[activeTask.status]?.className || ''}`}>
                      {STATUS_PILL[activeTask.status]?.label || activeTask.status}
                    </span>
                  </div>
                  <div>
                    <span className="chrono-hero-meta-label">Priority</span>
                    <span className={`pill ${priorityPillClass(activeTask.priority)}`}>
                      {priorityLabel(activeTask.priority)}
                    </span>
                  </div>
                </div>
                <div className="chrono-hero-actions">
                  <button className="btn-danger" onClick={handleStop} disabled={pendingTaskId === activeTaskId}>
                    <IconStop /> Stop the timer
                  </button>
                  <Link to={`/tasks/${activeTask.id}`} className="btn-outline">
                    View details <IconArrowRight />
                  </Link>
                </div>
              </div>
              <div className="chrono-ring-wrap">
                <div className="chrono-ring" />
                <div className="chrono-ring-inner">
                  <span className="chrono-ring-value">{formatClock(elapsed)}</span>
                  <span className="chrono-ring-caption">Elapsed time</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="chrono-empty">
              <span className="chrono-empty-icon">
                <IconPlay />
              </span>
              <div>
                <strong>No active timer.</strong>{' '}
                {noTasksAvailable
                  ? 'No task is assigned to you, but the whole platform remains accessible.'
                  : 'Start a task below to begin tracking your time.'}
              </div>
            </div>
          )}

          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">
                My tasks for today <span className="dnd-column-count">{dayTasks.length} selected</span>
              </p>
              <Link to="/tasks" className="app-link">
                View all tasks <IconArrowRight />
              </Link>
            </div>

            {!dayValidated && dayTasks.length === 0 && (
              <div className="info-banner">
                <IconChecklist />
                <span>
                  No tasks selected? Go back to <Link to="/my-day">My day</Link> to build your selection.
                </span>
              </div>
            )}
            {dayTasks.length === 0 && dayValidated && (
              <div className="empty-state">
                {noTasksAvailable
                  ? 'No task assigned at the moment. You can keep browsing the platform.'
                  : 'No task selected for today.'}
              </div>
            )}

            {dayTasks.length > 0 && (
              <div className="task-table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Task</th>
                      <th>Deadline</th>
                      <th>Status</th>
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
                                aria-label="Stop the timer"
                              >
                                <IconStop />
                              </button>
                            ) : (
                              <button
                                className="play-btn play-btn--start"
                                onClick={() => handleStart(task.id)}
                                disabled={!canStart || pendingTaskId === task.id}
                                aria-label="Start the timer"
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
                            <Link to={`/tasks/${task.id}`} className="icon-link-btn" aria-label="Open task">
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
              <p className="side-card-title">Today's summary</p>
              <Link to="/stats" className="app-link">
                View all <IconArrowRight />
              </Link>
            </div>
            <div className="stat-tile-grid">
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--blue">
                  <IconChecklist />
                </span>
                <div>
                  <AnimatedNumber className="stat-tile-value" value={dayTasks.length} />
                  <div className="stat-tile-label">Total selected</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--amber">
                  <IconClock />
                </span>
                <div>
                  <AnimatedNumber className="stat-tile-value" value={inCourseCount} />
                  <div className="stat-tile-label">In progress</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--green">
                  <IconCheckCircle />
                </span>
                <div>
                  <AnimatedNumber className="stat-tile-value" value={doneCount} />
                  <div className="stat-tile-label">Completed</div>
                </div>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-icon stat-tile-icon--purple">
                  <IconLayers />
                </span>
                <div>
                  <AnimatedNumber
                    className="stat-tile-value"
                    value={secondsWorkedToday}
                    format={(value) => formatDurationShort(Math.round(value))}
                  />
                  <div className="stat-tile-label">Time worked</div>
                </div>
              </div>
            </div>
          </div>

          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Upcoming deadlines</p>
              <Link to="/tasks" className="app-link">
                View all <IconArrowRight />
              </Link>
            </div>
            {upcoming.length === 0 && <div className="empty-state">No upcoming deadlines.</div>}
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
                <p className="tip-card-title">Tip of the day</p>
                <p className="tip-card-text">Plan your priorities in the morning for a more productive day.</p>
              </div>
              <button className="tip-card-close" onClick={() => setShowTip(false)} aria-label="Close">
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
