import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as userService from '../../services/userService';
import * as taskService from '../../services/taskService';
import * as avatarService from '../../services/avatarService';
import { formatDurationShort, formatDateTime, formatDate } from '../../utils/formatters';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconX, IconChat, IconCheckCircle, IconClock } from '../icons';
import { priorityLabel, userStatusLabel } from '../../utils/taskStatus';

const STATUS_PILL = {
  DECLAREE: { label: 'Declared', cls: 'declared' },
  VALIDEE: { label: 'To do', cls: 'todo' },
  EN_COURS: { label: 'In progress', cls: 'progress' },
  EN_PAUSE: { label: 'Paused', cls: 'paused' },
  TERMINEE: { label: 'Completed', cls: 'done' },
  CONFIRMEE: { label: 'Confirmed', cls: 'confirmed' },
};

function Initials({ name }) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return <span className="emp-drawer-avatar">{initials || '?'}</span>;
}

function EmployeeDetailPanel({ employeeId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [motifs, setMotifs] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [taskTab, setTaskTab] = useState('all'); // 'all' = toutes les tâches, 'daily' = sélection du jour
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await userService.getUserDetail(employeeId);
      setDetail(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to load employee details');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Charge la photo de profil si l'employé en a une
  useEffect(() => {
    let objectUrl;
    if (detail?.user?.has_avatar) {
      avatarService
        .getUserAvatarBlob(detail.user.id)
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob);
          setAvatarUrl(objectUrl);
        })
        .catch(() => setAvatarUrl(null));
    } else {
      setAvatarUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detail]);

  // Fermeture au clavier (Échap) — réflexe attendu sur un panneau superposé
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleConfirm(taskId) {
    try {
      await taskService.confirmTask(taskId);
      notifySuccess('Task confirmed');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to confirm the task');
    }
  }

  async function handleReject(taskId) {
    const motif = motifs[taskId];
    if (!motif || !motif.trim()) {
      notifyError('A reason is required to send a task back');
      return;
    }
    try {
      await taskService.rejectTask(taskId, motif);
      notifySuccess('Task sent back to the employee');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to send the task back');
    }
  }

  async function handleAddNote(taskId) {
    const content = noteDrafts[taskId];
    if (!content || !content.trim()) {
      notifyError('The note cannot be empty');
      return;
    }
    try {
      await taskService.createNote(taskId, content);
      notifySuccess('Note added');
      setNoteDrafts({ ...noteDrafts, [taskId]: '' });
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter la note");
    }
  }

  return (
    <>
      <div className="emp-drawer-overlay" onClick={onClose} />
      <aside className="emp-drawer" role="dialog" aria-label="Employee details">
        <button type="button" className="emp-drawer-close" onClick={onClose} aria-label="Close">
          <IconX />
        </button>

        {!detail ? (
          <div className="admin-loading admin-loading--drawer">
            <span className="admin-loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : (
          <>
            <header className="emp-drawer-head">
              {avatarUrl ? (
                <img src={avatarUrl} alt={detail.user.full_name} className="emp-drawer-avatar emp-drawer-avatar--img" />
              ) : (
                <Initials name={detail.user.full_name} />
              )}
              <div className="emp-drawer-identity">
                <h2>{detail.user.full_name}</h2>
                <p>{detail.user.email}</p>
              </div>
              <span className={`pill ${detail.user.status === 'ACTIF' ? 'pill--confirmed' : 'pill--paused'}`}>
                {userStatusLabel(detail.user.status)}
              </span>
            </header>

            <div className="emp-drawer-stats">
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{detail.stats.tasks_confirmed}</span>
                <span className="emp-drawer-stat-label">Completed</span>
              </div>
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{detail.stats.completion_rate}%</span>
                <span className="emp-drawer-stat-label">Completion</span>
              </div>
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{formatDurationShort(detail.stats.hours_worked_seconds)}</span>
                <span className="emp-drawer-stat-label">Worked</span>
              </div>
              <div className="emp-drawer-stat">
                <span className={`emp-drawer-stat-value${detail.stats.tasks_late > 0 ? ' emp-drawer-stat-value--late' : ''}`}>
                  {detail.stats.tasks_late}
                </span>
                <span className="emp-drawer-stat-label">Late</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-outline emp-drawer-msg"
              onClick={() => navigate('/admin/messaging', { state: { employeeId: detail.user.id } })}
            >
              <IconChat />
              View messages
            </button>

            <section className="emp-drawer-section">
              <div className="emp-drawer-tasks-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={taskTab === 'all'}
                  className={`emp-drawer-tab${taskTab === 'all' ? ' emp-drawer-tab--active' : ''}`}
                  onClick={() => setTaskTab('all')}
                >
                  Tasks
                  <span className="emp-drawer-tab-count">{detail.tasks.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={taskTab === 'daily'}
                  className={`emp-drawer-tab${taskTab === 'daily' ? ' emp-drawer-tab--active' : ''}`}
                  onClick={() => setTaskTab('daily')}
                >
                  Today
                  <span className="emp-drawer-tab-count">{(detail.daily_task_ids || []).length}</span>
                </button>
              </div>
              {(() => {
                const dailyIds = new Set(detail.daily_task_ids || []);
                const shownTasks = taskTab === 'daily' ? detail.tasks.filter((t) => dailyIds.has(t.id)) : detail.tasks;
                return (
                  <>
                    {shownTasks.length === 0 && (
                      <p className="emp-drawer-muted">
                        {taskTab === 'daily'
                          ? 'No task selected for today.'
                          : 'No task assigned.'}
                      </p>
                    )}
                    <div className="emp-drawer-tasks">
                      {shownTasks.map((task) => {
                  const meta = STATUS_PILL[task.status] || { label: task.status, cls: 'declared' };
                  const canReview = task.status === 'TERMINEE';
                  return (
                    <div key={task.id} className="emp-task-card">
                      <div className="emp-task-top">
                        <span className="emp-task-title">{task.title}</span>
                        <span className={`pill pill--${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="emp-task-meta">
                        <span>{priorityLabel(task.priority)}</span>
                        {task.deadline && (
                          <span className="emp-task-deadline">
                            <IconClock /> {formatDate(task.deadline)}
                          </span>
                        )}
                      </div>

                      {canReview && (
                        <div className="emp-task-review">
                          <button type="button" className="emp-task-confirm" onClick={() => handleConfirm(task.id)}>
                            <IconCheckCircle /> Confirm
                          </button>
                          <div className="emp-task-reject-row">
                            <input
                              type="text"
                              placeholder="Reason for sending back"
                              value={motifs[task.id] || ''}
                              onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                            />
                            <button type="button" className="emp-task-reject" onClick={() => handleReject(task.id)}>
                              Send back
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="emp-task-note-row">
                        <input
                          type="text"
                          placeholder="Add a note…"
                          value={noteDrafts[task.id] || ''}
                          onChange={(e) => setNoteDrafts({ ...noteDrafts, [task.id]: e.target.value })}
                        />
                        <button type="button" className="emp-task-note-btn" onClick={() => handleAddNote(task.id)}>
                          Add note
                        </button>
                      </div>
                    </div>
                  );
                      })}
                    </div>
                  </>
                );
              })()}
            </section>

            <section className="emp-drawer-section">
              <h3 className="app-section-title">Recent activity</h3>
              {detail.recent_activity.length === 0 && <p className="emp-drawer-muted">No recent activity.</p>}
              <ul className="emp-drawer-activity">
                {detail.recent_activity.map((entry, index) => (
                  <li key={index}>
                    <span className="emp-activity-dot" />
                    <span className="emp-activity-text">{entry.action}</span>
                    <span className="emp-activity-time">{formatDateTime(entry.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </aside>
    </>
  );
}

export default EmployeeDetailPanel;
