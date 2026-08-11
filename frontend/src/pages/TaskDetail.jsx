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
import { IconPlay, IconStop, IconCheckCircle, IconArrowRight, IconTrash } from '../components/icons';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { createPortal } from 'react-dom';
import RichTextEditor from '../components/RichTextEditor';

const EDIT_PRIORITIES = ['FAIBLE', 'NORMALE', 'HAUTE', 'URGENT'];

function TaskDetail() {
  const { id } = useParams();
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
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDeadline, setNewSubtaskDeadline] = useState('');
  // Saisie manuelle de temps (admin) : chrono oublié, ajouté a posteriori.
  const [manualTime, setManualTime] = useState({ start: '', end: '' });
  // Réassignation (admin) : liste des employés + personne choisie pour transférer/ajouter.
  const [employees, setEmployees] = useState([]);
  const [pickAssignee, setPickAssignee] = useState('');
  // Édition d'une tâche (admin) : modal + brouillon des champs.
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', priority: 'NORMALE', deadline: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskData, historyData, detailData] = await Promise.all([
        taskService.getTask(id),
        taskService.getTimelogHistory(id),
        taskService.getTaskDetail(id).catch(() => null),
      ]);
      setTask(taskData);
      setHistory(historyData);
      // Session active = celle de l'utilisateur COURANT (admin comme employé peut chronométrer).
      const running = historyData.find((session) => !session.end_time && session.employee_id === user?.id);
      setActiveSession(running || null);
      if (detailData) {
        setBreadcrumbData(detailData.breadcrumb);
        setSubtasks(detailData.subtasks || []);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        notifyError(err.response?.data?.error || 'Impossible de charger la tâche');
      }
    }
  }, [id, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Repère les changements faits ailleurs (bascule depuis une autre tâche, autre onglet...)
  useEffect(() => {
    const poll = setInterval(loadData, 5000);
    return () => clearInterval(poll);
  }, [loadData]);

  useEffect(() => {
    if (notFound) {
      notifyError('Tâche introuvable');
      // Retour vers la bonne liste selon le rôle (admin → liste des tâches admin).
      const timeout = setTimeout(() => navigate(isAdmin ? '/admin/validate' : '/tasks'), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [notFound, navigate, isAdmin]);

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => {
      const startedAt = new Date(activeSession.start_time).getTime();
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

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
      if (err.response?.status === 409) {
        notifyError('Le chrono est déjà actif sur cette tâche');
      } else {
        notifyError(err.response?.data?.error || 'Impossible de démarrer le chrono');
      }
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

  // Ajout manuel de temps par l'admin (chrono oublié par l'employé).
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

  // « Refaire » (admin) : recrée la tâche en pré-remplissant le formulaire de création, pour
  // pouvoir la réassigner (même employé par défaut) et repartir sur un chrono neuf.
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

  // Suppression d'une tâche (admin). Prévient que les sous-tâches et le suivi seront supprimés.
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

  // Charge la liste des employés actifs (pour le menu de réassignation), admin seulement.
  useEffect(() => {
    if (!isAdmin) return;
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, [isAdmin]);

  // Transfère la tâche courante à la personne choisie (change le destinataire).
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

  // Ajoute la personne choisie à la tâche (assignation multiple partagée).
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

  // Retire une personne de la tâche (impossible de retirer la dernière).
  async function handleRemoveAssignee(userId) {
    try {
      await taskService.removeTaskAssignee(id, userId);
      notifySuccess('Personne retirée');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de retirer la personne');
    }
  }

  // Ouvre le modal d'édition avec les valeurs actuelles de la tâche.
  function openEdit() {
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'NORMALE',
      deadline: task.deadline ? String(task.deadline).slice(0, 10) : '',
    });
    setEditOpen(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editForm.title.trim()) {
      notifyError('Le titre est requis');
      return;
    }
    if (!editForm.deadline) {
      notifyError("L'échéance est requise");
      return;
    }
    setSavingEdit(true);
    try {
      await taskService.updateTask(id, {
        title: editForm.title.trim(),
        description: editForm.description,
        priority: editForm.priority,
        deadline: editForm.deadline,
      });
      notifySuccess('Tâche modifiée');
      setEditOpen(false);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de modifier la tâche');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !newSubtaskDeadline) {
      notifyError('Titre et deadline sont requis pour la sous-tâche');
      return;
    }
    try {
      await taskService.createTask({
        title: newSubtaskTitle,
        assigned_to: task.assigned_to,
        priority: 'NORMALE',
        deadline: newSubtaskDeadline,
        parent_task_id: id,
      });
      notifySuccess('Sous-tâche ajoutée');
      setNewSubtaskTitle('');
      setNewSubtaskDeadline('');
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || "Impossible d'ajouter la sous-tâche");
    }
  }

  const layoutProps = isAdmin
    ? {}
    : {
        title: task?.title || 'Détail de la tâche',
        breadcrumb: [{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches', to: '/tasks' }, { label: task?.title || '' }],
      };

  if (notFound) {
    return (
      <Layout {...layoutProps}>
        <div className="empty-state">
          Tâche introuvable. Retour à {isAdmin ? 'la liste des tâches' : 'Mes tâches'}...
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout {...layoutProps}>
        <p>Chargement...</p>
      </Layout>
    );
  }

  const totalSeconds = history.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const sortedHistory = [...history].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const isCompleted = ['TERMINEE', 'CONFIRMEE'].includes(task.status);
  const displayStatus = task.status === 'EN_COURS' && !activeSession ? 'A_REPRENDRE' : task.status;
  const confirmedSubtasks = subtasks.filter((s) => s.status === 'CONFIRMEE').length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((confirmedSubtasks / subtasks.length) * 100) : 0;

  return (
    <Layout {...layoutProps}>
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <Link to="/admin/validate" className="app-link">
            ← Retour à la liste des tâches
          </Link>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['CONFIRMEE', 'TERMINEE'].includes(task.status) && (
              <button type="button" className="btn-outline" onClick={handleRedoTask} title="Recréer et réassigner cette tâche">
                ↻ Refaire
              </button>
            )}
            <button type="button" className="btn-outline" onClick={openEdit}>
              ✎ Modifier
            </button>
            <button type="button" className="btn-danger" onClick={handleDeleteTask}>
              <IconTrash /> Supprimer la tâche
            </button>
          </div>
        </div>
      )}

      <div className="side-card" style={{ marginBottom: '20px' }}>
        {breadcrumbData && (
          <span className="hierarchy-chip">
            {breadcrumbData.space.name} › {breadcrumbData.folder.name} › {breadcrumbData.list.name}
          </span>
        )}
        <h1 className="detail-task-title">{task.title}</h1>
        {task.description && (
          <div
            className="detail-description rich-text"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.description) }}
          />
        )}

        <div className="detail-meta-row">
          <div className="detail-meta-item">
            <span className="detail-meta-label">Statut</span>
            <span className={`pill ${STATUS_PILL[displayStatus]?.className || ''}`}>
              {STATUS_PILL[displayStatus]?.label || displayStatus}
            </span>
          </div>
          <div className="detail-meta-item">
            <span className="detail-meta-label">Priorité</span>
            <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
          </div>
          <div className="detail-meta-item">
            <span className="detail-meta-label">Échéance</span>
            <span>{formatDate(task.deadline)}</span>
          </div>
          {isAdmin && (task.assignees?.length || task.assigned_to) && (
            <div className="detail-meta-item">
              <span className="detail-meta-label">
                {(task.assignees?.length || 1) > 1 ? 'Assignés à' : 'Assigné à'}
              </span>
              <span className="detail-assignees">
                {(task.assignees && task.assignees.length
                  ? task.assignees
                  : [{ id: task.assigned_to, full_name: task.assignee_name || 'Employé' }]
                ).map((a, i, arr) => (
                  <button
                    key={a.id}
                    type="button"
                    className="app-link detail-assignee-link"
                    onClick={() => navigate('/admin/messaging', { state: { employeeId: a.id } })}
                    title={`Discuter avec ${a.full_name}`}
                  >
                    {a.full_name}
                    {i < arr.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </span>
            </div>
          )}
          {(task.client_name || task.client_email) && (
            <div className="detail-meta-item">
              <span className="detail-meta-label">Client</span>
              <span>
                {task.client_name}
                {task.client_name && task.client_email && ' — '}
                {task.client_email}
              </span>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="side-card" style={{ marginBottom: '20px' }}>
          <p className="side-card-title" style={{ marginBottom: '12px' }}>
            Assignation
            <span className="emp-drawer-tab-count" style={{ marginLeft: '8px' }}>
              {(task.assignees || []).length}
            </span>
          </p>
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
            className="filter-select"
            style={{ width: '100%', margin: '12px 0 10px' }}
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={handleAddAssignee} disabled={!pickAssignee}>
              + Ajouter
            </button>
            <button type="button" className="btn-outline" onClick={handleReassign} disabled={!pickAssignee}>
              Transférer (seul)
            </button>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            « Ajouter » : la personne <strong>partage</strong> cette tâche. « Transférer » : la tâche passe à cette
            <strong> seule</strong> personne. Terminer la tâche la termine <strong>pour tout le monde</strong>.
          </p>
        </div>
      )}

      {!isAdmin && (
      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Suivi du temps
        </p>
        <div className="chrono-card-body">
          {activeSession && (
            <div className="chrono-ring-wrap">
              <div className="chrono-ring" />
              <div className="chrono-ring-inner">
                <span className="chrono-ring-value">{formatClock(elapsed)}</span>
                <span className="chrono-ring-caption">Temps écoulé</span>
              </div>
            </div>
          )}
          <div className="chrono-card-actions">
            {activeSession ? (
              <button className="btn-danger" onClick={handleStop}>
                <IconStop /> Arrêter le chrono
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={!['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status)}
              >
                <IconPlay /> Démarrer le chrono
              </button>
            )}
            <button className="btn-outline" onClick={handleComplete} disabled={task.status !== 'EN_COURS'}>
              <IconCheckCircle /> Marquer comme terminée
            </button>
          </div>
        </div>
      </div>
      )}

      {!isAdmin && (
      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Historique du chrono
        </p>
        {sortedHistory.length === 0 && <div className="empty-state">Aucune session.</div>}
        {sortedHistory.length > 0 && (
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
                  {sortedHistory.map((session, index) => (
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
            <p style={{ marginTop: '12px', fontSize: '13.5px' }}>
              <strong>Total : {formatDurationShort(totalSeconds)}</strong>
            </p>
          </>
        )}
      </div>
      )}

      {/* Côté admin : temps passé en LECTURE SEULE (le chrono est piloté par l'employé). */}
      {isAdmin && (
      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Temps passé
        </p>
        {/* L'admin peut lui aussi chronométrer la tâche (son temps s'ajoute au total). */}
        <div className="chrono-card-body" style={{ marginBottom: '16px' }}>
          {activeSession && (
            <div className="chrono-ring-wrap">
              <div className="chrono-ring" />
              <div className="chrono-ring-inner">
                <span className="chrono-ring-value">{formatClock(elapsed)}</span>
                <span className="chrono-ring-caption">Mon chrono</span>
              </div>
            </div>
          )}
          <p style={{ fontSize: '15px' }}>
            <strong>Total : {formatDurationShort(totalSeconds)}</strong>
          </p>
          <div className="chrono-card-actions">
            {activeSession ? (
              <button className="btn-danger" onClick={handleStop}>
                <IconStop /> Arrêter mon chrono
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={!['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status)}
              >
                <IconPlay /> Démarrer mon chrono
              </button>
            )}
          </div>
        </div>

        {sortedHistory.length === 0 && <div className="empty-state">Aucun temps enregistré.</div>}
        {sortedHistory.length > 0 && (
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
                {sortedHistory.map((session, index) => (
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
        )}

        {task.assigned_to && (
          <form className="manual-time-form" onSubmit={handleAddManualTime}>
            <p className="manual-time-hint">Chrono oublié ? Ajoutez le temps manuellement :</p>
            <div className="manual-time-fields">
              <label>
                <span>Début</span>
                <input
                  type="datetime-local"
                  value={manualTime.start}
                  onChange={(e) => setManualTime((m) => ({ ...m, start: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Fin</span>
                <input
                  type="datetime-local"
                  value={manualTime.end}
                  onChange={(e) => setManualTime((m) => ({ ...m, end: e.target.value }))}
                  required
                />
              </label>
              <button type="submit" className="btn-outline">
                Ajouter le temps
              </button>
            </div>
          </form>
        )}
      </div>
      )}

      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Sous-tâches
        </p>
        {subtasks.length === 0 && <div className="empty-state">Aucune sous-tâche.</div>}
        {subtasks.length > 0 && (
          <>
            <div className="progress-row">
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${subtaskProgress}%` }} />
              </div>
              <span className="progress-label">
                {confirmedSubtasks}/{subtasks.length} confirmée(s)
              </span>
            </div>
            {subtasks.map((subtask) => (
              <Link key={subtask.id} to={`/tasks/${subtask.id}`} className="subtask-item">
                <span className={`pill ${priorityPillClass(subtask.priority)}`}>{subtask.priority}</span>
                <span className="subtask-title">{subtask.title}</span>
                <span className={`pill ${STATUS_PILL[subtask.status]?.className || ''}`}>
                  {STATUS_PILL[subtask.status]?.label || subtask.status}
                </span>
                <span className="subtask-deadline">{formatDate(subtask.deadline)}</span>
                <IconArrowRight />
              </Link>
            ))}
          </>
        )}
        {isAdmin && (
          <form className="add-subtask-form" onSubmit={handleAddSubtask}>
            <input
              type="text"
              placeholder="Titre de la sous-tâche"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
            />
            <input type="date" value={newSubtaskDeadline} onChange={(e) => setNewSubtaskDeadline(e.target.value)} />
            <button type="submit" className="btn-primary">
              Ajouter
            </button>
          </form>
        )}
      </div>

      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Commentaires & Notes
        </p>
        <CommentSection taskId={id} />
      </div>

      {!isAdmin && (
        <div className="side-card">
          <p className="side-card-title" style={{ marginBottom: '16px' }}>
            Pièces jointes
          </p>
          <AttachmentUpload taskId={id} canUpload={!isCompleted} />
        </div>
      )}

      {editOpen &&
        createPortal(
          <div className="task-edit-overlay" onClick={() => !savingEdit && setEditOpen(false)}>
            <form className="task-edit-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
              <h2 className="task-edit-title">Modifier la tâche</h2>

              <label className="form-label" htmlFor="edit-title">Titre</label>
              <input
                id="edit-title"
                className="form-input"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Titre de la tâche"
                autoFocus
              />

              <label className="form-label" htmlFor="edit-desc">Description</label>
              <RichTextEditor
                value={editForm.description}
                onChange={(html) => setEditForm({ ...editForm, description: html })}
                placeholder="Description de la tâche…"
              />

              <div className="task-edit-row">
                <div>
                  <label className="form-label" htmlFor="edit-priority">Priorité</label>
                  <select
                    id="edit-priority"
                    className="form-select"
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  >
                    {EDIT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="edit-deadline">Échéance</label>
                  <input
                    id="edit-deadline"
                    type="date"
                    className="form-input"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                  />
                </div>
              </div>

              <div className="task-edit-actions">
                <button type="button" className="btn-outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </Layout>
  );
}

export default TaskDetail;
