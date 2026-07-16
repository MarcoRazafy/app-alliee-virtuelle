import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline } from '../utils/taskStatus';
import { IconExternalLink } from '../components/icons';
import { notifyError } from '../utils/toast';

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

function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState({ search: '', statuses: [], priorities: [], deadlineRange: '' });
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    async function loadTasks() {
      try {
        const data = await taskService.getTasks();
        const enriched = await Promise.all(
          data.map(async (task) => {
            if (task.status === 'TERMINEE' || task.status === 'CONFIRMEE') {
              const history = await taskService.getTimelogHistory(task.id);
              const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
              return { ...task, totalDuration: total, displayStatus: task.status };
            }
            if (task.status === 'EN_COURS') {
              const history = await taskService.getTimelogHistory(task.id);
              const hasActiveSession = history.some((s) => !s.end_time);
              return { ...task, displayStatus: hasActiveSession ? 'EN_COURS' : 'A_REPRENDRE' };
            }
            return { ...task, displayStatus: task.status };
          })
        );
        setTasks(enriched);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    }
    loadTasks();
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const search = filters.search.toLowerCase();
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        (task.description || '').toLowerCase().includes(search);
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(task.displayStatus);
      const matchesPriority = filters.priorities.length === 0 || filters.priorities.includes(task.priority);
      const matchesDeadline = matchesDeadlineRange(task.deadline, filters.deadlineRange);
      return matchesSearch && matchesStatus && matchesPriority && matchesDeadline;
    });
  }, [tasks, filters]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const paginatedTasks = filteredTasks.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <EmployeeLayout
      title="Mes tâches"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches' }]}
      subtitle="Retrouvez et filtrez l'ensemble de vos tâches assignées"
    >
      <SearchBar onChange={setFilters} />

      <p className="results-count">{filteredTasks.length} tâche(s) trouvée(s)</p>

      <div className="side-card">
        {filteredTasks.length === 0 && <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>}
        {filteredTasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th>Projet / Contexte</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                  <th>Priorité</th>
                  <th>Durée totale</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="task-table-title">
                        {task.title}
                      </Link>
                    </td>
                    <td>{task.list_name && <span className="task-table-project">{task.list_name}</span>}</td>
                    <td>{formatRelativeDeadline(task.deadline)}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[task.displayStatus]?.className || ''}`}>
                        {STATUS_PILL[task.displayStatus]?.label || task.displayStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
                    </td>
                    <td>{task.totalDuration != null ? formatDurationShort(task.totalDuration) : '—'}</td>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="icon-link-btn" aria-label="Ouvrir la tâche">
                        <IconExternalLink />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredTasks.length > 0 && (
        <Pagination
          page={page}
          totalItems={filteredTasks.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </EmployeeLayout>
  );
}

export default MyTasks;
