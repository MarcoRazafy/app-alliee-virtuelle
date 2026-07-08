import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
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
        setError(err.response?.data?.error || 'Impossible de charger la tâche');
      }
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (notFound) {
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
    setError('');
    try {
      await taskService.startTimelog(id);
      await loadData();
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Vous avez déjà un chrono actif sur une autre tâche');
      } else {
        setError(err.response?.data?.error || 'Impossible de démarrer le chrono');
      }
    }
  }

  async function handleStop() {
    setError('');
    try {
      await taskService.stopTimelog(id);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Impossible d'arrêter le chrono");
    }
  }

  async function handleComplete() {
    setError('');
    try {
      await taskService.completeTask(id);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de marquer la tâche comme terminée');
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
        <p>{error || 'Chargement...'}</p>
        <Link to="/tasks">Retour</Link>
      </div>
    );
  }

  return (
    <div>
      <p>
        <Link to="/tasks">Retour à mes tâches</Link>
      </p>
      <h1>{task.title}</h1>
      <p>{task.description}</p>
      <p>Priorité : {task.priority}</p>
      <p>Statut : {task.status}</p>
      <p>Deadline : {task.deadline}</p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div>
        {activeSession ? (
          <div>
            <p>Chrono en cours : {formatDuration(elapsed)}</p>
            <button onClick={handleStop}>Arrêter le chrono</button>
          </div>
        ) : (
          <button onClick={handleStart} disabled={!['VALIDEE', 'TERMINEE'].includes(task.status)}>
            Démarrer le chrono
          </button>
        )}
        <button onClick={handleComplete} disabled={task.status !== 'EN_COURS'}>
          Marquer comme terminée
        </button>
      </div>

      <h2>Historique du chrono</h2>
      {history.length === 0 && <p>Aucune session enregistrée.</p>}
      <ul>
        {history.map((session, index) => (
          <li key={index}>
            {session.start_time} → {session.end_time || 'en cours'} ({session.duration_seconds ?? '-'} s)
          </li>
        ))}
      </ul>

      <h2>Commentaires</h2>
      {/* Pas encore de backend pour les commentaires (task_comments) */}
      <p>Aucun commentaire pour le moment.</p>

      <h2>Pièces jointes</h2>
      {/* Pas encore de backend pour les pièces jointes (task_attachments) */}
      <p>Aucune pièce jointe pour le moment.</p>
    </div>
  );
}

export default TaskDetail;
