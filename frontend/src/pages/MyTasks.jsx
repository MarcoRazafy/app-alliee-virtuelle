import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort } from '../utils/formatters';
import { notifyError } from '../utils/toast';

const STATUS_LABELS = {
  VALIDEE: 'À faire',
  EN_COURS: 'En cours',
  A_REPRENDRE: 'À reprendre',
  TERMINEE: 'Terminée',
  CONFIRMEE: 'Confirmée',
};

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
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Mes tâches</h1>

      <SearchBar onChange={setFilters} />

      <p>{filteredTasks.length} tâche(s) trouvée(s)</p>
      {filteredTasks.length === 0 && <p>Aucune tâche.</p>}

      <ul>
        {paginatedTasks.map((task) => (
          <li key={task.id}>
            {task.title} — {task.priority} — deadline {task.deadline} —{' '}
            {STATUS_LABELS[task.displayStatus] || task.displayStatus}
            {task.totalDuration != null && <span> — durée totale {formatDurationShort(task.totalDuration)}</span>}
            <Link to={`/tasks/${task.id}`}> [+]</Link>
          </li>
        ))}
      </ul>

      {filteredTasks.length > 0 && (
        <Pagination
          page={page}
          totalItems={filteredTasks.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </div>
  );
}

export default MyTasks;
