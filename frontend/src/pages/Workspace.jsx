import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as messageService from '../services/messageService';
import { formatClock, formatDurationShort } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';

const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const PRIORITY_COLORS = {
  URGENT: '#e74c3c',
  HAUTE: '#e67e22',
  NORMALE: '#3498db',
  FAIBLE: '#95a5a6',
};

function PriorityBadge({ priority }) {
  return (
    <span
      style={{
        backgroundColor: PRIORITY_COLORS[priority] || 'gray',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '4px',
      }}
    >
      {priority}
    </span>
  );
}

function TodayTaskRow({ task, onChanged }) {
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const loadSession = useCallback(async () => {
    if (task.status !== 'EN_COURS') {
      setActiveSession(null);
      return;
    }
    const history = await taskService.getTimelogHistory(task.id);
    setActiveSession(history.find((s) => !s.end_time) || null);
  }, [task.id, task.status]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Repère les changements faits ailleurs (bascule depuis une autre tâche, autre onglet...)
  // sans que l'utilisateur ait à recharger la page
  useEffect(() => {
    const poll = setInterval(loadSession, 5000);
    return () => clearInterval(poll);
  }, [loadSession]);

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(activeSession.start_time).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  async function handleStart() {
    try {
      const result = await taskService.startTimelog(task.id);
      if (result.switchedFromTaskId) {
        notifySuccess(`Chrono précédent arrêté (${formatDurationShort(result.switchedFromDuration)}), nouveau chrono démarré`);
      } else {
        notifySuccess('Chrono démarré');
      }
      await loadSession();
      onChanged();
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
      const result = await taskService.stopTimelog(task.id);
      notifySuccess(`Chrono arrêté - ${formatDurationShort(result.duration)} enregistrées`);
      await loadSession();
      onChanged();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'arrêter le chrono");
    }
  }

  // "En cours" seulement si un chrono tourne vraiment ; sinon la tâche est en pause ("à reprendre")
  const displayStatus = task.status === 'EN_COURS' ? (activeSession ? 'En cours' : 'À reprendre') : task.status;

  return (
    <li style={{ marginBottom: '10px' }}>
      <Link to={`/tasks/${task.id}`}>{task.title}</Link> <PriorityBadge priority={task.priority} /> — {displayStatus}
      {activeSession && <span> — {formatClock(elapsed)}</span>}
      <div>
        {activeSession ? (
          <button onClick={handleStop}>ARRÊTER</button>
        ) : (
          <button onClick={handleStart} disabled={!['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status)}>
            DÉMARRER
          </button>
        )}
      </div>
    </li>
  );
}

function Workspace() {
  const [dayTasks, setDayTasks] = useState([]);
  const [dayValidated, setDayValidated] = useState(false);
  const [doneTasks, setDoneTasks] = useState([]);
  const [adminConversation, setAdminConversation] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const loadDay = useCallback(async () => {
    const selection = await taskService.getMyDay();
    setDayValidated(selection.length > 0 && selection.every((item) => item.validated_at));
    setDayTasks(selection.slice(0, 5).map((item) => ({ id: item.task_id, ...item.task_data })));
  }, []);

  const loadDone = useCallback(async () => {
    const tasks = await taskService.getTasks();
    const done = tasks.filter((t) => t.status === 'TERMINEE' || t.status === 'CONFIRMEE');
    const withDuration = await Promise.all(
      done.map(async (task) => {
        const history = await taskService.getTimelogHistory(task.id);
        const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        return { ...task, totalDuration: total };
      })
    );
    setDoneTasks(withDuration);
  }, []);

  const loadChat = useCallback(async () => {
    const conversations = await messageService.getConversations();
    // Un seul admin dans l'organisation pour le moment : on ouvre la première conversation
    const conversation = conversations[0] || null;
    setAdminConversation(conversation);
    if (conversation) {
      const messages = await messageService.getPrivateMessages(conversation.other_user_id);
      setChatMessages(messages);
    }
  }, []);

  useEffect(() => {
    loadDay();
    loadDone();
    loadChat();
  }, [loadDay, loadDone, loadChat]);

  // Rafraîchit la liste (statuts, tâches terminées) sans que l'utilisateur ait à recharger la page
  useEffect(() => {
    const poll = setInterval(() => {
      loadDay();
      loadDone();
    }, 8000);
    return () => clearInterval(poll);
  }, [loadDay, loadDone]);

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!chatInput.trim() || !adminConversation) return;
    await messageService.sendPrivateMessage(adminConversation.other_user_id, chatInput);
    setChatInput('');
    await loadChat();
  }

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div style={{ flex: 3 }}>
        <p>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </p>
        <h1>Mon espace — {today}</h1>
        <p style={{ color: dayValidated ? 'green' : 'gray' }}>
          {dayValidated ? 'Votre journée est validée' : 'Journée non validée'}
        </p>

        <h2>Mes tâches du jour</h2>
        {dayTasks.length === 0 && (
          <p>
            Aucune tâche sélectionnée. Rendez-vous sur <Link to="/my-day">Ma journée</Link> pour en choisir.
          </p>
        )}
        <ul>
          {dayTasks.map((task) => (
            <TodayTaskRow key={task.id} task={task} onChanged={loadDay} />
          ))}
        </ul>

        <h2>Effectuées</h2>
        {doneTasks.length === 0 && <p>Aucune tâche terminée pour le moment.</p>}
        <ul>
          {doneTasks.map((task) => (
            <li key={task.id}>
              {task.title} — {task.status} — durée totale {formatDurationShort(task.totalDuration)}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
        <h2>Conversation avec l'administrateur</h2>
        <div style={{ minHeight: '150px', marginBottom: '10px' }}>
          {chatMessages.length === 0 && <p>Aucun message.</p>}
          {chatMessages.map((msg) => (
            <p key={msg.id}>
              <strong>{msg.author_name}</strong> ({new Date(msg.created_at).toLocaleTimeString('fr-FR')}) :{' '}
              {msg.content}
            </p>
          ))}
        </div>
        <form onSubmit={handleSendMessage}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Votre message"
            disabled={!adminConversation}
          />
          <button type="submit" disabled={!adminConversation}>
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}

export default Workspace;
