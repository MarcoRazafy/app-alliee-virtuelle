import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as userService from '../services/userService';
import AttachmentUpload from '../components/AttachmentUpload';
import CommentSection from '../components/CommentSection';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import { formatClock, formatDurationShort, formatDateTime, formatDate } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass } from '../utils/taskStatus';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import {
  IconPlay,
  IconStop,
  IconCheckCircle,
  IconArrowLeft,
  IconTrash,
  IconRestore,
  IconUser,
  IconClock,
  IconCalendarWeek,
  IconAlert,
  IconX,
} from '../components/icons';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { createPortal } from 'react-dom';
import RichTextEditor from '../components/RichTextEditor';
import StatusDropdown from '../components/StatusDropdown';
import '../styles/task-detail.css';

const EDIT_PRIORITIES = ['FAIBLE', 'NORMALE', 'HAUTE', 'URGENT'];

// Ligne de propriété (icône · libellé · valeur), façon ClickUp.
function PropRow({ icon, label, children }) {
  return (
    <div className="tk-prop">
      <span className="tk-prop-label">
        {icon}
        {label}
      </span>
      <span className="tk-prop-value">{children}</span>
    </div>
  );
}

function TaskDetail({ taskId, isModal = false, onClose }) {
  const params = useParams();
  const id = taskId || params.id;
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const Layout = isAdmin ? AdminLayout : EmployeeLayout;

  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [breadcrumbData, setBreadcrumbData] = useState(null);
  const [manualTime, setManualTime] = useState({ start: '', end: '' });
  const [employees, setEmployees] = useState([]);
  const [pickAssignee, setPickAssignee] = useState('');
  // Édition inline (admin) : titre, description, gestion des assignés.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [showAssignManage, setShowAssignManage] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false); // Suivi du temps : 3 derniers par défaut

  const loadData = useCallback(async () => {
    try {
      const [taskData, historyData, detailData] = await Promise.all([
        taskService.getTask(id),
        taskService.getTimelogHistory(id),
        taskService.getTaskDetail(id).catch(() => null),
      ]);
      setTask(taskData);
      setHistory(historyData);
      const running = historyData.find((session) => !session.end_time && session.employee_id === user?.id);
      setActiveSession(running || null);
      if (detailData) setBreadcrumbData(detailData.breadcrumb);
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      else notifyError(err.response?.data?.error || 'Impossible de charger la tâche');
    }
  }, [id, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Repère les changements faits ailleurs — mais on ne rafraîchit pas pendant une édition inline.
  useEffect(() => {
    const poll = setInterval(() => {
      if (!editingTitle && !editingDesc) loadData();
    }, 5000);
    return () => clearInterval(poll);
  }, [loadData, editingTitle, editingDesc]);

  useEffect(() => {
    if (notFound && !isModal) {
      notifyError('Tâche introuvable');
      const timeout = setTimeout(() => navigate(isAdmin ? '/admin/validate' : '/tasks'), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [notFound, navigate, isAdmin, isModal]);

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => {
      const startedAt = new Date(activeSession.start_time).getTime();
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (!isAdmin) return;
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, [isAdmin]);

  async function handleStart() {
    try {
      const result = await taskService.startTimelog(id);
      if (result.switchedFromTaskId) {
        notifySuccess(`Chrono précédent arrêté (${formatDurationShort(result.switchedFromDuration)}), nouveau chrono démarré`);
      } else {
        notifySuccess('Chrono démarré');
      }
      await loadData();
    } catch (err) {
      if (err.response?.status === 409) notifyError('Le chrono est déjà actif sur cette tâche');
      else notifyError(err.response?.data?.error || 'Impossible de démarrer le chrono');
    }
  }

  async function handleStop() {
    try {
      const result = await taskService.stopTimelog(id);
      notifySuccess(`Chrono arrêté - ${formatDurationShort(result.duration)} enregistrées`);
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'arrêter le chrono");
    }
  }

  async function handleComplete() {
    try {
      await taskService.completeTask(id);
      notifySuccess('Tâche terminée !');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de marquer la tâche comme terminée');
    }
  }

  async function handleAddManualTime(event) {
    event.preventDefault();
    if (!manualTime.start || !manualTime.end) return;
    try {
      await taskService.addManualTimelog(id, { start_time: manualTime.start, end_time: manualTime.end });
      notifySuccess('Temps ajouté');
      setManualTime({ start: '', end: '' });
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter le temps");
    }
  }

  function handleRedoTask() {
    const today = new Date().toISOString().slice(0, 10);
    const deadline = task.deadline && String(task.deadline).slice(0, 10) >= today ? String(task.deadline).slice(0, 10) : '';
    navigate('/admin/create-task', {
      state: {
        prefill: {
          title: task.title || '',
          description: task.description || '',
          priority: task.priority || 'NORMALE',
          assigned_to: task.assigned_to || '',
          deadline,
          list_id: breadcrumbData?.list?.id || '',
        },
      },
    });
  }

  async function handleDeleteTask() {
    const confirmMessage = `Supprimer la tâche « ${task?.title || ''} » ?\n\nCette action est définitive et supprime aussi ses sous-tâches, commentaires, chronos et pièces jointes.`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await taskService.deleteTask(id);
      notifySuccess('Tâche supprimée');
      navigate('/admin/lists');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer la tâche');
    }
  }

  async function handleReassign() {
    if (!pickAssignee) return;
    try {
      await taskService.reassignTask(id, pickAssignee);
      notifySuccess('Tâche transférée');
      setPickAssignee('');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de transférer la tâche');
    }
  }

  async function handleAddAssignee() {
    if (!pickAssignee) return;
    try {
      await taskService.addTaskAssignee(id, pickAssignee);
      notifySuccess('Personne ajoutée à la tâche');
      setPickAssignee('');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter la personne");
    }
  }

  async function handleRemoveAssignee(userId) {
    try {
      await taskService.removeTaskAssignee(id, userId);
      notifySuccess('Personne retirée');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de retirer la personne');
    }
  }

  // Enregistre une modification partielle : updateTask exige titre + priorité + échéance,
  // on renvoie donc les valeurs actuelles fusionnées avec le champ modifié.
  async function savePatch(partial) {
    try {
      await taskService.updateTask(id, {
        title: task.title,
        description: task.description,
        priority: task.priority,
        deadline: task.deadline ? String(task.deadline).slice(0, 10) : '',
        ...partial,
      });
      await loadData();
      return true;
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de modifier la tâche');
      return false;
    }
  }

  async function commitTitle() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (trimmed && trimmed !== task.title) await savePatch({ title: trimmed });
  }

  async function commitDesc() {
    setEditingDesc(false);
    if (descDraft !== (task.description || '')) await savePatch({ description: descDraft });
  }

  const layoutProps = isAdmin
    ? {}
    : {
        title: task?.title || 'Détail de la tâche',
        breadcrumb: [{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches', to: '/tasks' }, { label: task?.title || '' }],
      };

  if (notFound) {
    const body = (
      <div className="empty-state">
        Tâche introuvable{isModal ? '.' : `. Retour à ${isAdmin ? 'la liste des tâches' : 'Mes tâches'}...`}
      </div>
    );
    return isModal ? body : <Layout {...layoutProps}>{body}</Layout>;
  }
  if (!task) {
    const body = <p style={{ padding: isModal ? '24px' : 0 }}>Chargement...</p>;
    return isModal ? body : <Layout {...layoutProps}>{body}</Layout>;
  }

  const totalSeconds = history.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const sortedHistory = [...history].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const HISTORY_PREVIEW = 3; // nombre de sessions visibles avant « Afficher plus »
  const visibleHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, HISTORY_PREVIEW);
  const displayStatus = task.status === 'EN_COURS' && !activeSession ? 'A_REPRENDRE' : task.status;
  const assignees =
    task.assignees && task.assignees.length
      ? task.assignees
      : task.assigned_to
        ? [{ id: task.assigned_to, full_name: task.assignee_name || 'Employé' }]
        : [];
  const canTime = ['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status);

  const content = (
    <>
      {isAdmin && (
        <div className="tk-topbar">
          {isModal ? (
            <span />
          ) : (
            <Link to="/admin/validate" className="app-link">
              <IconArrowLeft /> Retour à la liste des tâches
            </Link>
          )}
          <div className="tk-topbar-actions">
            {['CONFIRMEE', 'TERMINEE'].includes(task.status) && (
              <button type="button" className="btn-outline" onClick={handleRedoTask} title="Recréer et réassigner cette tâche">
                <IconRestore /> Refaire
              </button>
            )}
            <button type="button" className="btn-danger" onClick={handleDeleteTask}>
              <IconTrash /> Supprimer
            </button>
          </div>
        </div>
      )}

      <div className="tk-layout">
        <div className="tk-main">
          {/* En-tête : fil d'Ariane + titre + propriétés + description */}
          <div className="side-card tk-card">
            {breadcrumbData && (
              <span className="tk-breadcrumb">
                {breadcrumbData.space.name} › {breadcrumbData.folder.name} › {breadcrumbData.list.name}
              </span>
            )}

            {isAdmin && editingTitle ? (
              <input
                className="tk-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                autoFocus
              />
            ) : (
              <h1
                className={`detail-task-title${isAdmin ? ' tk-editable' : ''}`}
                onClick={() => {
                  if (isAdmin) {
                    setTitleDraft(task.title || '');
                    setEditingTitle(true);
                  }
                }}
                title={isAdmin ? 'Cliquer pour modifier' : undefined}
              >
                {task.title}
              </h1>
            )}

            <div className="tk-props">
              <PropRow icon={<IconCheckCircle />} label="Statut">
                {isAdmin ? (
                  <StatusDropdown taskId={id} status={task.status} displayStatus={displayStatus} onChanged={loadData} />
                ) : (
                  <span className={`pill ${STATUS_PILL[displayStatus]?.className || ''}`}>
                    {STATUS_PILL[displayStatus]?.label || displayStatus}
                  </span>
                )}
              </PropRow>

              <PropRow icon={<IconUser />} label="Assignés">
                <span className="tk-assignees">
                  {assignees.length === 0 && <span className="tk-empty">Non assignée</span>}
                  {assignees.map((a, i, arr) =>
                    isAdmin ? (
                      <button
                        key={a.id}
                        type="button"
                        className="app-link tk-assignee-link"
                        onClick={() => navigate('/admin/messaging', { state: { employeeId: a.id } })}
                        title={`Discuter avec ${a.full_name}`}
                      >
                        {a.full_name}
                        {i < arr.length - 1 ? ', ' : ''}
                      </button>
                    ) : (
                      <span key={a.id}>
                        {a.full_name}
                        {i < arr.length - 1 ? ', ' : ''}
                      </span>
                    )
                  )}
                  {isAdmin && (
                    <button type="button" className="tk-prop-edit" onClick={() => setShowAssignManage((v) => !v)}>
                      {showAssignManage ? 'Fermer' : 'Gérer'}
                    </button>
                  )}
                </span>
              </PropRow>

              <PropRow icon={<IconAlert />} label="Priorité">
                {isAdmin ? (
                  <div className="tk-priority-picker">
                    {EDIT_PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`priority-option priority-option--${p.toLowerCase()}${task.priority === p ? ' priority-option--active' : ''}`}
                        onClick={() => task.priority !== p && savePatch({ priority: p })}
                      >
                        <span className={`priority-dot priority-dot--${p.toLowerCase()}`} />
                        {p}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
                )}
              </PropRow>

              <PropRow icon={<IconCalendarWeek />} label="Début">
                {task.start_date ? formatDate(task.start_date) : <span className="tk-empty">—</span>}
              </PropRow>

              <PropRow icon={<IconCalendarWeek />} label="Échéance">
                {isAdmin ? (
                  <input
                    type="date"
                    className="tk-date-input"
                    value={task.deadline ? String(task.deadline).slice(0, 10) : ''}
                    onChange={(e) => e.target.value && savePatch({ deadline: e.target.value })}
                  />
                ) : (
                  formatDate(task.deadline)
                )}
              </PropRow>

              <PropRow icon={<IconClock />} label="Suivre le temps">
                <span className="tk-time">
                  <span className="tk-time-total">{formatDurationShort(totalSeconds)}</span>
                  {activeSession && <span className="tk-time-live">· {formatClock(elapsed)} en cours</span>}
                  <span className="tk-time-actions">
                    {activeSession ? (
                      <button type="button" className="tk-icon-btn tk-icon-btn--stop" onClick={handleStop} title="Arrêter le chrono">
                        <IconStop />
                      </button>
                    ) : (
                      <button type="button" className="tk-icon-btn tk-icon-btn--play" onClick={handleStart} disabled={!canTime} title="Démarrer le chrono">
                        <IconPlay />
                      </button>
                    )}
                    {!isAdmin && (
                      <button
                        type="button"
                        className="tk-icon-btn tk-icon-btn--done"
                        onClick={handleComplete}
                        disabled={task.status !== 'EN_COURS'}
                        title="Marquer comme terminée"
                      >
                        <IconCheckCircle />
                      </button>
                    )}
                  </span>
                </span>
              </PropRow>

              {(task.client_name || task.client_email) && (
                <PropRow icon={<IconUser />} label="Client">
                  {task.client_name}
                  {task.client_name && task.client_email && ' — '}
                  {task.client_email}
                </PropRow>
              )}
            </div>

            {/* Gestion des assignés (admin) — dépliable depuis « Gérer ». */}
            {isAdmin && showAssignManage && (
              <div className="tk-assign-manage">
                <div className="assignee-chips">
                  {(task.assignees || []).map((a) => (
                    <span key={a.id} className="assignee-chip">
                      {a.full_name}
                      {(task.assignees || []).length > 1 && (
                        <button
                          type="button"
                          className="assignee-chip-x"
                          onClick={() => handleRemoveAssignee(a.id)}
                          aria-label={`Retirer ${a.full_name}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <select
                  className="filter-select tk-assign-select"
                  value={pickAssignee}
                  onChange={(e) => setPickAssignee(e.target.value)}
                  aria-label="Choisir une personne à ajouter ou transférer"
                >
                  <option value="">Ajouter / transférer à…</option>
                  {employees
                    .filter((emp) => !(task.assignees || []).some((a) => a.id === emp.id))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                </select>
                <div className="tk-assign-actions">
                  <button type="button" className="btn-primary" onClick={handleAddAssignee} disabled={!pickAssignee}>
                    + Ajouter
                  </button>
                  <button type="button" className="btn-outline" onClick={handleReassign} disabled={!pickAssignee}>
                    Transférer (seul)
                  </button>
                </div>
                <p className="tk-assign-hint">
                  « Ajouter » : la personne <strong>partage</strong> la tâche. « Transférer » : la tâche passe à cette
                  <strong> seule</strong> personne. Terminer la tâche la termine <strong>pour tout le monde</strong>.
                </p>
              </div>
            )}

            {/* Description */}
            <div className="tk-desc-block">
              <p className="tk-section-label">Description</p>
              {isAdmin && editingDesc ? (
                <div className="tk-desc-edit">
                  <RichTextEditor value={descDraft} onChange={setDescDraft} placeholder="Description de la tâche…" />
                  <div className="tk-desc-actions">
                    <button type="button" className="btn-outline" onClick={() => setEditingDesc(false)}>
                      Annuler
                    </button>
                    <button type="button" className="btn-primary" onClick={commitDesc}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : task.description ? (
                <div
                  className={`detail-description rich-text${isAdmin ? ' tk-editable' : ''}`}
                  onClick={() => {
                    if (isAdmin) {
                      setDescDraft(task.description || '');
                      setEditingDesc(true);
                    }
                  }}
                  title={isAdmin ? 'Cliquer pour modifier' : undefined}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.description) }}
                />
              ) : isAdmin ? (
                <button
                  type="button"
                  className="tk-desc-empty"
                  onClick={() => {
                    setDescDraft('');
                    setEditingDesc(true);
                  }}
                >
                  + Ajouter une description
                </button>
              ) : (
                <p className="tk-empty">Aucune description.</p>
              )}
            </div>
          </div>

          {/* Suivi du temps détaillé */}
          <div className="side-card">
            <p className="side-card-title" style={{ marginBottom: '16px' }}>
              Suivi du temps
            </p>
            {sortedHistory.length === 0 ? (
              <div className="empty-state">Aucune session enregistrée.</div>
            ) : (
              <>
                <div className="task-table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Qui</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.map((session, index) => (
                        <tr key={index}>
                          <td>{session.employee_name || '—'}</td>
                          <td>{formatDateTime(session.start_time)}</td>
                          <td>{session.end_time ? formatDateTime(session.end_time) : 'en cours'}</td>
                          <td>{session.duration_seconds != null ? formatDurationShort(session.duration_seconds) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sortedHistory.length > HISTORY_PREVIEW && (
                  <button
                    type="button"
                    className="tk-history-toggle"
                    onClick={() => setShowAllHistory((v) => !v)}
                  >
                    {showAllHistory
                      ? 'Afficher moins'
                      : `Afficher plus (${sortedHistory.length - HISTORY_PREVIEW})`}
                  </button>
                )}
                <p style={{ marginTop: '12px', fontSize: '13.5px' }}>
                  <strong>Total : {formatDurationShort(totalSeconds)}</strong>
                </p>
              </>
            )}

            {isAdmin && task.assigned_to && (
              <form className="manual-time-form" onSubmit={handleAddManualTime}>
                <p className="manual-time-hint">Chrono oublié ? Ajoutez le temps manuellement :</p>
                <div className="manual-time-fields">
                  <label>
                    <span>Début</span>
                    <input type="datetime-local" value={manualTime.start} onChange={(e) => setManualTime((m) => ({ ...m, start: e.target.value }))} required />
                  </label>
                  <label>
                    <span>Fin</span>
                    <input type="datetime-local" value={manualTime.end} onChange={(e) => setManualTime((m) => ({ ...m, end: e.target.value }))} required />
                  </label>
                  <button type="submit" className="btn-outline">
                    Ajouter le temps
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Pièces jointes */}
          <div className="side-card">
            <p className="side-card-title" style={{ marginBottom: '16px' }}>
              Pièces jointes
            </p>
            <AttachmentUpload taskId={id} canUpload={isAdmin} />
          </div>
        </div>

        {/* Rail droit : commentaires */}
        <aside className="tk-rail">
          <div className="side-card tk-rail-card">
            <p className="side-card-title" style={{ marginBottom: '16px' }}>
              Commentaires & Notes
            </p>
            <CommentSection taskId={id} />
          </div>
        </aside>
      </div>
    </>
  );

  return isModal ? content : <Layout {...layoutProps}>{content}</Layout>;
}

// Version fenêtre modale (ouverte par-dessus la liste via le pattern « background location »).
export function TaskDetailModal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const close = () => navigate(-1);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') navigate(-1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  return createPortal(
    <div className="task-modal-overlay" onMouseDown={close}>
      <div className="task-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="task-modal-close" onClick={close} aria-label="Fermer">
          <IconX />
        </button>
        <div className="task-modal-body">
          <TaskDetail key={id} isModal onClose={close} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TaskDetail;
