import { useEffect, useState, useMemo } from 'react';
import * as statsService from '../../services/statsService';
import * as taskService from '../../services/taskService';
import { formatDurationShort } from '../../utils/formatters';
import { notifyError, notifyInfo } from '../../utils/toast';

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function computeRange(preset) {
  const to = new Date();
  const from = new Date();
  if (preset === 'week') from.setDate(from.getDate() - 6);
  if (preset === 'month') from.setDate(from.getDate() - 29);
  return { from: toDateString(from), to: toDateString(to) };
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function AdminStatistics() {
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(computeRange('month').from);
  const [to, setTo] = useState(computeRange('month').to);
  const [stats, setStats] = useState(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);
  const [employeeTasks, setEmployeeTasks] = useState([]);
  const [sortKey, setSortKey] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    if (preset === 'custom') return;
    const range = computeRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to) return;
    statsService
      .getTeamStats(from, to)
      .then(setStats)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les statistiques'));
  }, [from, to]);

  async function toggleExpand(employeeId) {
    if (expandedEmployeeId === employeeId) {
      setExpandedEmployeeId(null);
      return;
    }
    setExpandedEmployeeId(employeeId);
    try {
      const allTasks = await taskService.getTasks();
      const filtered = allTasks.filter(
        (task) => task.assigned_to === employeeId && task.deadline >= from && task.deadline <= to
      );
      setEmployeeTasks(filtered);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger le détail des tâches');
    }
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  const sortedByEmployee = useMemo(() => {
    if (!stats) return [];
    const rows = [...stats.by_employee];
    rows.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
    return rows;
  }, [stats, sortKey, sortDirection]);

  function handleExportCsv() {
    if (!stats) return;
    const rows = [
      ['Employé', 'Total tâches', 'Confirmées', 'En cours', 'En retard', '% complétion', 'Heures travaillées'],
      ...sortedByEmployee.map((emp) => [
        emp.full_name,
        emp.total_tasks,
        emp.confirmed,
        emp.in_progress,
        emp.late,
        `${emp.completion_rate}%`,
        formatDurationShort(emp.hours_worked_seconds),
      ]),
    ];
    downloadCsv(`statistiques_${from}_${to}.csv`, rows);
  }

  function handleExportPdf() {
    notifyInfo('Export PDF bientôt disponible');
  }

  return (
    <div>
      <h1>Statistiques</h1>

      <div>
        <label>
          <input type="radio" checked={preset === 'week'} onChange={() => setPreset('week')} /> Semaine
        </label>
        <label>
          <input type="radio" checked={preset === 'month'} onChange={() => setPreset('month')} /> Mois
        </label>
        <label>
          <input type="radio" checked={preset === 'custom'} onChange={() => setPreset('custom')} /> Personnalisé
        </label>
        {preset === 'custom' && (
          <span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        )}
      </div>

      {!stats && <p>Chargement...</p>}

      {stats && (
        <>
          <div style={{ display: 'flex', gap: '20px', margin: '20px 0' }}>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Total tâches complétées</strong>
              <p>{stats.summary.tasks_confirmed}</p>
            </div>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Taux de complétion</strong>
              <p>{stats.summary.completion_rate}%</p>
            </div>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Temps moyen par tâche</strong>
              <p>{formatDurationShort(stats.summary.average_time_per_task_seconds)}</p>
            </div>
          </div>

          <button onClick={handleExportCsv}>Exporter en CSV</button>
          <button onClick={handleExportPdf}>Exporter en PDF</button>

          <table border="1" cellPadding="6" style={{ marginTop: '20px' }}>
            <thead>
              <tr>
                <th onClick={() => toggleSort('full_name')} style={{ cursor: 'pointer' }}>
                  Employé
                </th>
                <th onClick={() => toggleSort('total_tasks')} style={{ cursor: 'pointer' }}>
                  Total
                </th>
                <th onClick={() => toggleSort('confirmed')} style={{ cursor: 'pointer' }}>
                  Complétées
                </th>
                <th onClick={() => toggleSort('in_progress')} style={{ cursor: 'pointer' }}>
                  En cours
                </th>
                <th onClick={() => toggleSort('late')} style={{ cursor: 'pointer' }}>
                  En retard
                </th>
                <th onClick={() => toggleSort('completion_rate')} style={{ cursor: 'pointer' }}>
                  % complétion
                </th>
                <th onClick={() => toggleSort('hours_worked_seconds')} style={{ cursor: 'pointer' }}>
                  Heures travaillées
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedByEmployee.map((emp) => (
                <>
                  <tr key={emp.user_id} onClick={() => toggleExpand(emp.user_id)} style={{ cursor: 'pointer' }}>
                    <td>{emp.full_name}</td>
                    <td>{emp.total_tasks}</td>
                    <td>{emp.confirmed}</td>
                    <td>{emp.in_progress}</td>
                    <td>{emp.late}</td>
                    <td>{emp.completion_rate}%</td>
                    <td>{formatDurationShort(emp.hours_worked_seconds)}</td>
                  </tr>
                  {expandedEmployeeId === emp.user_id && (
                    <tr>
                      <td colSpan="7">
                        <ul>
                          {employeeTasks.length === 0 && <li>Aucune tâche sur cette période.</li>}
                          {employeeTasks.map((task) => (
                            <li key={task.id}>
                              {task.title} — {task.priority} — {task.status} — deadline {task.deadline}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default AdminStatistics;
