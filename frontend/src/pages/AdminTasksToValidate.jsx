import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';

function AdminTasksToValidate() {
  const [tasks, setTasks] = useState([]);
  const [motifs, setMotifs] = useState({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await taskService.getTasks({ status: 'TERMINEE' });
      setTasks(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les tâches');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConfirm(id) {
    setError('');
    try {
      await taskService.confirmTask(id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de confirmer la tâche');
    }
  }

  async function handleReject(id) {
    const motif = motifs[id];
    if (!motif || !motif.trim()) {
      setError('Le motif est requis pour renvoyer une tâche');
      return;
    }
    setError('');
    try {
      await taskService.rejectTask(id, motif);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de renvoyer la tâche');
    }
  }

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Tâches à valider</h1>
      {error && <p>{error}</p>}
      {tasks.length === 0 && <p>Aucune tâche en attente de validation.</p>}
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <p>
              {task.title} — deadline {task.deadline}
            </p>
            <button onClick={() => handleConfirm(task.id)}>Confirmer</button>
            <input
              placeholder="Motif de renvoi"
              value={motifs[task.id] || ''}
              onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
            />
            <button onClick={() => handleReject(task.id)}>Renvoyer</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminTasksToValidate;
