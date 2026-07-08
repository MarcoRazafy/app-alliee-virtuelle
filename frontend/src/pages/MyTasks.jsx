import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';

const STATUS_LABELS = {
  VALIDEE: 'À faire',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  CONFIRMEE: 'Confirmée',
};

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadTasks() {
      try {
        const filters = {};
        if (status) filters.status = status;
        const data = await taskService.getTasks(filters);

        const withDuration = await Promise.all(
          data.map(async (task) => {
            if (task.status !== 'TERMINEE' && task.status !== 'CONFIRMEE') {
              return task;
            }
            const history = await taskService.getTimelogHistory(task.id);
            const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
            return { ...task, totalDuration: total };
          })
        );

        setTasks(withDuration);
      } catch (err) {
        setError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    }
    loadTasks();
  }, [status]);

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Mes tâches</h1>
      <div>
        <label htmlFor="status">Statut</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous</option>
          <option value="VALIDEE">À faire</option>
          <option value="EN_COURS">En cours</option>
          <option value="TERMINEE">Terminée</option>
          <option value="CONFIRMEE">Confirmée</option>
        </select>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title} — {task.priority} — deadline {task.deadline} — {STATUS_LABELS[task.status] || task.status}
            {task.totalDuration != null && <span> — durée totale {formatDuration(task.totalDuration)}</span>}
            <Link to={`/tasks/${task.id}`}> [+]</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MyTasks;
