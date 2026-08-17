import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as userService from '../../services/userService';
import * as taskService from '../../services/taskService';
import * as avatarService from '../../services/avatarService';
import { formatDurationShort, formatDateTime, formatDate } from '../../utils/formatters';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconX, IconChat, IconCheckCircle, IconClock, IconLayers } from '../icons';

const STATUS_PILL = {
  DECLAREE: { label: 'Déclarée', cls: 'declared' },
  VALIDEE: { label: 'À faire', cls: 'todo' },
  EN_COURS: { label: 'En cours', cls: 'progress' },
  EN_PAUSE: { label: 'En pause', cls: 'paused' },
  TERMINEE: { label: 'Terminée', cls: 'done' },
  CONFIRMEE: { label: 'Confirmée', cls: 'confirmed' },
};

// Filtre par statut des tâches de l'employé (mêmes libellés que le dashboard principal,
// mais groupés pour couvrir tous les statuts possibles du panneau).
const TASK_FILTERS = [
  { key: 'all', label: 'Tout', has: () => true },
  { key: 'todo', label: 'À faire', has: (s) => s === 'VALIDEE' || s === 'DECLAREE' },
  { key: 'progress', label: 'En cours', has: (s) => s === 'EN_COURS' || s === 'EN_PAUSE' },
  { key: 'done', label: 'Effectuées', has: (s) => s === 'TERMINEE' || s === 'CONFIRMEE' },
];

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
  const [statusFilter, setStatusFilter] = useState('all'); // filtre par statut (Tout/À faire/En cours/Effectuées)
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(async () => {
    try {
      const data = await userService.getUserDetail(employeeId);
      setDetail(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger le détail employé');
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
      notifySuccess('Tâche confirmée');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de confirmer la tâche');
    }
  }

  async function handleReject(taskId) {
    const motif = motifs[taskId];
    if (!motif || !motif.trim()) {
      notifyError('Le motif est requis pour renvoyer une tâche');
      return;
    }
    try {
      await taskService.rejectTask(taskId, motif);
      notifySuccess("Tâche renvoyée à l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renvoyer la tâche');
    }
  }

  async function handleAddNote(taskId) {
    const content = noteDrafts[taskId];
    if (!content || !content.trim()) {
      notifyError('La note ne peut pas être vide');
      return;
    }
    try {
      await taskService.createNote(taskId, content);
      notifySuccess('Note ajoutée');
      setNoteDrafts({ ...noteDrafts, [taskId]: '' });
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter la note");
    }
  }

  return (
    <>
      <div className="emp-drawer-overlay" onClick={onClose} />
      <aside className="emp-drawer" role="dialog" aria-label="Détail employé">
        <button type="button" className="emp-drawer-close" onClick={onClose} aria-label="Fermer">
          <IconX />
        </button>

        {!detail ? (
          <div className="admin-loading admin-loading--drawer">
            <span className="admin-loading-spinner" />
            <p>Chargement…</p>
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
                {detail.user.status}
              </span>
            </header>

            <div className="emp-drawer-stats">
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{detail.stats.tasks_confirmed}</span>
                <span className="emp-drawer-stat-label">Complétées</span>
              </div>
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{detail.stats.completion_rate}%</span>
                <span className="emp-drawer-stat-label">Complétion</span>
              </div>
              <div className="emp-drawer-stat">
                <span className="emp-drawer-stat-value">{formatDurationShort(detail.stats.hours_worked_seconds)}</span>
                <span className="emp-drawer-stat-label">Travaillé</span>
              </div>
              <div className="emp-drawer-stat">
                <span className={`emp-drawer-stat-value${detail.stats.tasks_late > 0 ? ' emp-drawer-stat-value--late' : ''}`}>
                  {detail.stats.tasks_late}
                </span>
                <span className="emp-drawer-stat-label">En retard</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-outline emp-drawer-msg"
              onClick={() => navigate('/admin/messaging', { state: { employeeId: detail.user.id } })}
            >
              <IconChat />
              Voir les messages
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
                  Tâches
                  <span className="emp-drawer-tab-count">{detail.tasks.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={taskTab === 'daily'}
                  className={`emp-drawer-tab${taskTab === 'daily' ? ' emp-drawer-tab--active' : ''}`}
                  onClick={() => setTaskTab('daily')}
                >
                  Aujourd'hui
                  <span className="emp-drawer-tab-count">{(detail.daily_task_ids || []).length}</span>
                </button>
              </div>
              <div className="emp-drawer-filter" role="group" aria-label="Filtrer les tâches par statut">
                {TASK_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`emp-drawer-filter-chip${statusFilter === f.key ? ' emp-drawer-filter-chip--active' : ''}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {(() => {
                const dailyIds = new Set(detail.daily_task_ids || []);
                const activeFilter = TASK_FILTERS.find((f) => f.key === statusFilter) || TASK_FILTERS[0];
                const shownTasks = detail.tasks
                  .filter((t) => taskTab !== 'daily' || dailyIds.has(t.id))
                  .filter((t) => activeFilter.has(t.status));
                return (
                  <>
                    {shownTasks.length === 0 && (
                      <p className="emp-drawer-muted">
                        {statusFilter !== 'all'
                          ? `Aucune tâche « ${activeFilter.label} ».`
                          : taskTab === 'daily'
                            ? "Aucune tâche sélectionnée pour aujourd'hui."
                            : 'Aucune tâche assignée.'}
                      </p>
                    )}
                    <div className="emp-drawer-tasks">
                      {shownTasks.map((task) => {
                  const meta = STATUS_PILL[task.status] || { label: task.status, cls: 'declared' };
                  const canReview = task.status === 'TERMINEE';
                  return (
                    <div
                      key={task.id}
                      className="emp-task-card emp-task-card--clickable"
                      onClick={(e) => {
                        if (e.target.closest('button, a, input, label, select, textarea')) return;
                        navigate(`/tasks/${task.id}`, { state: { backgroundLocation: location } });
                      }}
                    >
                      <div className="emp-task-top">
                        <span className="emp-task-title">{task.title}</span>
                        <span className={`pill pill--${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="emp-task-meta">
                        <span>{task.priority}</span>
                        {task.deadline && (
                          <span className="emp-task-deadline">
                            <IconClock /> {formatDate(task.deadline)}
                          </span>
                        )}
                      </div>

                      {task.list_name && (
                        <button
                          type="button"
                          className="emp-task-project"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/admin/lists', {
                              state: {
                                selectList: {
                                  id: task.list_id,
                                  name: task.list_name,
                                  folderId: task.folder_id,
                                  spaceId: task.space_id,
                                },
                              },
                            });
                          }}
                          title="Ouvrir ce projet"
                        >
                          <IconLayers />
                          {task.space_name} › {task.folder_name} › {task.list_name}
                        </button>
                      )}

                      {canReview && (
                        <div className="emp-task-review">
                          <button type="button" className="emp-task-confirm" onClick={() => handleConfirm(task.id)}>
                            <IconCheckCircle /> Confirmer
                          </button>
                          <div className="emp-task-reject-row">
                            <input
                              type="text"
                              placeholder="Motif de renvoi"
                              value={motifs[task.id] || ''}
                              onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                            />
                            <button type="button" className="emp-task-reject" onClick={() => handleReject(task.id)}>
                              Renvoyer
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="emp-task-note-row">
                        <input
                          type="text"
                          placeholder="Ajouter une note…"
                          value={noteDrafts[task.id] || ''}
                          onChange={(e) => setNoteDrafts({ ...noteDrafts, [task.id]: e.target.value })}
                        />
                        <button type="button" className="emp-task-note-btn" onClick={() => handleAddNote(task.id)}>
                          Noter
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
              <h3 className="app-section-title">Activité récente</h3>
              {detail.recent_activity.length === 0 && <p className="emp-drawer-muted">Aucune activité récente.</p>}
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
