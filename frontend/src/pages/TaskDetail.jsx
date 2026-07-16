import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import AttachmentUpload from '../components/AttachmentUpload';
import CommentSection from '../components/CommentSection';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import { formatClock, formatDurationShort, formatDateTime, formatDate } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass } from '../utils/taskStatus';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconPlay, IconStop, IconCheckCircle, IconArrowRight } from '../components/icons';

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

  const loadData = useCallback(async () => {
    try {
      const [taskData, historyData, detailData] = await Promise.all([
        taskService.getTask(id),
        taskService.getTimelogHistory(id),
        taskService.getTaskDetail(id).catch(() => null),
      ]);
      setTask(taskData);
      setHistory(historyData);
      const running = historyData.find((session) => !session.end_time);
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
  }, [id]);

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
      const timeout = setTimeout(() => navigate('/tasks'), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [notFound, navigate]);

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
        <div className="empty-state">Tâche introuvable. Retour à Mes tâches...</div>
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
        <p style={{ marginBottom: '16px' }}>
          <Link to="/tasks" className="app-link">
            ← Retour à mes tâches
          </Link>
        </p>
      )}

      <div className="side-card" style={{ marginBottom: '20px' }}>
        {breadcrumbData && (
          <span className="hierarchy-chip">
            {breadcrumbData.space.name} › {breadcrumbData.folder.name} › {breadcrumbData.list.name}
          </span>
        )}
        {task.description && <p className="detail-description">{task.description}</p>}

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
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((session, index) => (
                    <tr key={index}>
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

      <div className="side-card">
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Pièces jointes
        </p>
        <AttachmentUpload taskId={id} canUpload={!isCompleted} />
      </div>
    </Layout>
  );
}

export default TaskDetail;
