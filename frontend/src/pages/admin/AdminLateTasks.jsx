import { useEffect, useState } from 'react';
import * as taskService from '../../services/taskService';
import { notifyError } from '../../utils/toast';

function AdminLateTasks() {
  const [tasks, setTasks] = useState([]);
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    taskService
      .getLateTasks()
      .then(setTasks)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches en retard'));
  }, []);

  function toggleSort() {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }

  const sortedTasks = [...tasks].sort((a, b) =>
    sortDirection === 'desc' ? b.days_late - a.days_late : a.days_late - b.days_late
  );

  return (
    <div>
      <h1>Tâches en retard</h1>
      <p>{tasks.length} tâche(s) en retard (une tâche confirmée n'est jamais considérée en retard)</p>

      {sortedTasks.length === 0 && <p>Aucune tâche en retard.</p>}
      {sortedTasks.length > 0 && (
        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Employé</th>
              <th>Priorité</th>
              <th>Statut</th>
              <th>Deadline</th>
              <th onClick={toggleSort} style={{ cursor: 'pointer' }}>
                Jours de retard {sortDirection === 'desc' ? '▼' : '▲'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{task.assigned_to_name}</td>
                <td>{task.priority}</td>
                <td>{task.status}</td>
                <td>{task.deadline}</td>
                <td>{task.days_late}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminLateTasks;
