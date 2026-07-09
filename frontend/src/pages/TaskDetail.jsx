import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import AttachmentUpload from '../components/AttachmentUpload';
import CommentSection from '../components/CommentSection';
import { formatClock, formatDurationShort, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [notFound, setNotFound] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [taskData, historyData] = await Promise.all([
        taskService.getTask(id),
        taskService.getTimelogHistory(id),
      ]);
      setTask(taskData);
      setHistory(historyData);
      const running = historyData.find((session) => !session.end_time);
      setActiveSession(running || null);
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

  return (
    <div>
      <p>
        <Link to="/tasks">Retour à mes tâches</Link>
      </p>
      <h1>{task.title}</h1>
      <p>{task.description}</p>
      <p>Priorité : {task.priority}</p>
      <p>Statut : {task.status === 'EN_COURS' && !activeSession ? 'À reprendre' : task.status}</p>
      <p>Deadline : {task.deadline}</p>

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

      <h2>Commentaires & Notes</h2>
      <CommentSection taskId={id} />

      <h2>Pièces jointes</h2>
      <AttachmentUpload taskId={id} canUpload={!isCompleted} />
    </div>
  );
}

export default TaskDetail;
