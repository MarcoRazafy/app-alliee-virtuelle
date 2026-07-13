import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import AttachmentUpload from '../components/AttachmentUpload';
import CommentSection from '../components/CommentSection';
import { formatClock, formatDurationShort, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState(null);
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
        setBreadcrumb(detailData.breadcrumb);
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

  if (notFound) {
    return (
      <div>
        <p>Tâche introuvable. Retour à Mes tâches...</p>
        <Link to="/tasks">Retour maintenant</Link>
      </div>
    );
  }

  if (!task) {
    return (
      <div>
        <p>Chargement...</p>
        <Link to="/tasks">Retour</Link>
      </div>
    );
  }

  const totalSeconds = history.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const sortedHistory = [...history].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const isCompleted = ['TERMINEE', 'CONFIRMEE'].includes(task.status);
  const isAdmin = user?.role === 'ADMIN';
  const confirmedSubtasks = subtasks.filter((s) => s.status === 'CONFIRMEE').length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((confirmedSubtasks / subtasks.length) * 100) : 0;

  return (
    <div>
      <p>
        <Link to="/tasks">Retour à mes tâches</Link>
      </p>

      {breadcrumb && (
        <p>
          {breadcrumb.space.name} &gt; {breadcrumb.folder.name} &gt; {breadcrumb.list.name} &gt; {task.title}
        </p>
      )}

      <h1>{task.title}</h1>
      <p>{task.description}</p>
      <p>Priorité : {task.priority}</p>
      <p>Statut : {task.status === 'EN_COURS' && !activeSession ? 'À reprendre' : task.status}</p>
      <p>Deadline : {task.deadline}</p>
      {(task.client_name || task.client_email) && (
        <p>
          Client : {task.client_name}
          {task.client_name && task.client_email && ' — '}
          {task.client_email}
        </p>
      )}

      <div>
        {activeSession ? (
          <div>
            <p>Chrono en cours : {formatClock(elapsed)}</p>
            <button onClick={handleStop}>Arrêter le chrono</button>
          </div>
        ) : (
          <button onClick={handleStart} disabled={!['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status)}>
            Démarrer le chrono
          </button>
        )}
        <button onClick={handleComplete} disabled={task.status !== 'EN_COURS'}>
          Marquer comme terminée
        </button>
      </div>

      <h2>Historique du chrono</h2>
      {sortedHistory.length === 0 && <p>Aucune session.</p>}
      {sortedHistory.length > 0 && (
        <table>
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
      )}
      {sortedHistory.length > 0 && (
        <p>
          <strong>Total : {formatDurationShort(totalSeconds)}</strong>
        </p>
      )}

      <h2>Sous-tâches</h2>
      {subtasks.length === 0 && <p>Aucune sous-tâche.</p>}
      {subtasks.length > 0 && (
        <>
          <p>
            Avancement : {confirmedSubtasks}/{subtasks.length} confirmée(s) ({subtaskProgress}%)
          </p>
          <ul>
            {subtasks.map((subtask) => (
              <li key={subtask.id}>
                <Link to={`/tasks/${subtask.id}`}>{subtask.title}</Link> — {subtask.priority} — {subtask.status} —
                deadline {subtask.deadline}
              </li>
            ))}
          </ul>
        </>
      )}
      {isAdmin && (
        <form onSubmit={handleAddSubtask}>
          <input
            placeholder="Titre de la sous-tâche"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
          />
          <input
            type="date"
            value={newSubtaskDeadline}
            onChange={(e) => setNewSubtaskDeadline(e.target.value)}
          />
          <button type="submit">Ajouter une sous-tâche</button>
        </form>
      )}

      <h2>Commentaires & Notes</h2>
      <CommentSection taskId={id} />

      <h2>Pièces jointes</h2>
      <AttachmentUpload taskId={id} canUpload={!isCompleted} />
    </div>
  );
}

export default TaskDetail;
