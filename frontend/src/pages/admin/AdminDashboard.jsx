import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as dashboardService from '../../services/dashboardService';
import EmployeeDetailPanel from '../../components/admin/EmployeeDetailPanel';
import { formatClock } from '../../utils/formatters';
import { notifyError } from '../../utils/toast';

function matchesDeadlineRange(deadline, range) {
  if (!range) return true;
  const date = new Date(deadline);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (range === 'today') return dateOnly.getTime() === startOfToday.getTime();
  if (range === 'past') return dateOnly.getTime() < startOfToday.getTime();
  if (range === 'week') {
    const weekEnd = new Date(startOfToday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return dateOnly >= startOfToday && dateOnly < weekEnd;
  }
  if (range === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  return true;
}

function LiveClock({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    function tick() {
      setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{formatClock(elapsed)}</span>;
}

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState('');

  function load() {
    dashboardService
      .getRealtimeDashboard()
      .then(setData)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger le tableau de bord'));
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, []);

  function resetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setDeadlineFilter('');
  }

  function filterTasks(tasks) {
    return tasks.filter(
      (task) => (!priorityFilter || task.priority === priorityFilter) && matchesDeadlineRange(task.deadline, deadlineFilter)
    );
  }

  if (!data) {
    return <p>Chargement...</p>;
  }

  const showTodo = !statusFilter || statusFilter === 'VALIDEE';
  const showInProgress = !statusFilter || statusFilter === 'EN_COURS';
  const showDone = !statusFilter || statusFilter === 'TERMINEE';

  return (
    <div>
      <h1>Suivi en temps réel</h1>
      <p>
        <Link to="/admin/create-task">Créer une tâche</Link>
      </p>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ border: '1px solid black', padding: '10px' }}>
          <strong>Employés actifs</strong>
          <p>{data.stats.active_employees}</p>
        </div>
        <div style={{ border: '1px solid black', padding: '10px' }}>
          <strong>Tâches en cours</strong>
          <p>{data.stats.tasks_in_progress}</p>
        </div>
        <div style={{ border: '1px solid black', padding: '10px' }}>
          <strong>Tâches en retard</strong>
          <p>{data.stats.tasks_late}</p>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>
          Statut :
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="VALIDEE">À faire</option>
            <option value="EN_COURS">En cours</option>
            <option value="TERMINEE">Effectuées</option>
          </select>
        </label>
        <label>
          Priorité :
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Toutes</option>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="FAIBLE">Faible</option>
          </select>
        </label>
        <label>
          Échéance :
          <select value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)}>
            <option value="">Toutes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="past">Passée</option>
          </select>
        </label>
        <button onClick={resetFilters}>Réinitialiser les filtres</button>
      </div>

      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>Employé</th>
            <th>À faire</th>
            <th>En cours</th>
            <th>Effectuées</th>
          </tr>
        </thead>
        <tbody>
          {data.employees.map((employee) => (
            <tr
              key={employee.id}
              onClick={() => setSelectedEmployeeId(employee.id)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                {employee.full_name}
                <br />
                <small>{employee.position}</small>
              </td>
              <td>
                {showTodo &&
                  filterTasks(employee.todo).map((task) => (
                    <div key={task.id}>
                      {task.title} ({task.priority})
                    </div>
                  ))}
              </td>
              <td>
                {showInProgress &&
                  filterTasks(employee.in_progress).map((task) => (
                    <div key={task.id}>
                      {task.title} ({task.priority}) — <LiveClock startTime={task.session_start_time} />
                    </div>
                  ))}
              </td>
              <td>{showDone && employee.done.map((task) => <div key={task.id}>{task.title}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedEmployeeId && (
        <div style={{ marginTop: '20px' }}>
          <EmployeeDetailPanel employeeId={selectedEmployeeId} onClose={() => setSelectedEmployeeId(null)} />
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
