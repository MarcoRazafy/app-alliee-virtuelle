import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as taskService from '../services/taskService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline, displayStatusOf, isTaskLate } from '../utils/taskStatus';
import { IconExternalLink, IconChecklist, IconTrash } from '../components/icons';
import NewTaskModal from '../components/employee/NewTaskModal';
import { htmlToText } from '../utils/sanitizeHtml';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'deadline_asc', label: 'Échéance proche' },
  { value: 'deadline_desc', label: 'Échéance lointaine' },
];

function byDate(field, direction) {
  return (a, b) => {
    const va = a[field] ? new Date(a[field]).getTime() : null;
    const vb = b[field] ? new Date(b[field]).getTime() : null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direction === 'asc' ? va - vb : vb - va;
  };
}

function sortTasks(list, sort) {
  const rows = [...list];
  if (sort === 'oldest') return rows.sort(byDate('created_at', 'asc'));
  if (sort === 'deadline_asc') return rows.sort(byDate('deadline', 'asc'));
  if (sort === 'deadline_desc') return rows.sort(byDate('deadline', 'desc'));
  return rows.sort(byDate('created_at', 'desc'));
}

function matchesDeadlineRange(task, range) {
  if (!range) return true;

  const deadline = task?.deadline;
  if (!deadline) return false;

  if (range === 'late') {
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return isTaskLate(task, todayYMD);
  }

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
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [sort, setSort] = useState('recent');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', statuses: [], priorities: [], deadlineRange: '' });
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [createOpen, setCreateOpen] = useState(false);

  async function loadTasks() {
    try {
      const data = await taskService.getTasks();
      const enriched = await Promise.all(
        data.map(async (task) => {
          const displayStatus = displayStatusOf(task);
          if (task.status === 'TERMINEE' || task.status === 'CONFIRMEE') {
            const history = await taskService.getTimelogHistory(task.id);
            const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
            return { ...task, totalDuration: total, displayStatus };
          }
          return { ...task, displayStatus };
        })
      );
      setTasks(enriched);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    const onTasksChanged = () => loadTasks();
    window.addEventListener('tasks:changed', onTasksChanged);
    return () => window.removeEventListener('tasks:changed', onTasksChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTasks = useMemo(() => {
    const rows = tasks.filter((task) => {
      const search = filters.search.toLowerCase();
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        htmlToText(task.description || '').toLowerCase().includes(search);
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(task.displayStatus);
      const matchesPriority = filters.priorities.length === 0 || filters.priorities.includes(task.priority);
      const matchesDeadline = matchesDeadlineRange(task, filters.deadlineRange);
      return matchesSearch && matchesStatus && matchesPriority && matchesDeadline;
    });
    return sortTasks(rows, sort);
  }, [tasks, filters, sort]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  const paginatedTasks = filteredTasks.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const isMine = (task) => Boolean(user?.id && task.created_by === user.id);

  const mineInView = filteredTasks.filter(isMine);
  const selectedInView = mineInView.filter((t) => selectedIds.includes(t.id));
  const allMineSelected = mineInView.length > 0 && selectedInView.length === mineInView.length;

  function toggleSelected(taskId) {
    setSelectedIds((cur) => (cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]));
  }

  function toggleSelectAll() {
    setSelectedIds(allMineSelected ? [] : mineInView.map((t) => t.id));
  }

  async function deleteSelected() {
    if (selectedInView.length === 0 || deleting) return;
    const count = selectedInView.length;
    const message =
      `Supprimer ${count} tâche${count > 1 ? 's' : ''} que vous avez créée${count > 1 ? 's' : ''} ?\n\n` +
      'Cette action est définitive et supprime aussi leurs commentaires, chronos et pièces jointes.';
    if (!window.confirm(message)) return;

    setDeleting(true);
    try {
      for (const task of selectedInView) {
        await taskService.deleteTask(task.id);
      }
      setSelectedIds([]);
      await loadTasks();
      notifySuccess(`${count} tâche${count > 1 ? 's supprimées' : ' supprimée'}`);
    } catch (err) {
      await loadTasks();
      notifyError(err.response?.data?.error || 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <EmployeeLayout
      title="Mes tâches"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches' }]}
      subtitle="Retrouvez et filtrez l'ensemble de vos tâches assignées"
      skeleton={loading ? 'list' : null}
    >
      <div className="mytasks-toolbar">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <IconChecklist /> Créer une tâche
        </button>
      </div>

      <SearchBar onChange={setFilters} />

      <div className="mt-list-head">
        <div className="mt-list-head-left">
          <p className="results-count">{filteredTasks.length} tâche(s) trouvée(s)</p>
          <label className="mt-sort">
            <span>Trier par</span>
            <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedInView.length > 0 && (
          <div className="mt-bulk-bar">
            <span>
              {selectedInView.length} sélectionnée{selectedInView.length > 1 ? 's' : ''}
            </span>
            <button type="button" className="mt-bulk-clear" onClick={() => setSelectedIds([])}>
              Annuler
            </button>
            <button type="button" className="btn-danger mt-bulk-delete" onClick={deleteSelected} disabled={deleting}>
              <IconTrash /> {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        )}
      </div>

      <div className="side-card">
        {filteredTasks.length === 0 && <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>}
        {filteredTasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th className="mt-select-col">
                    {mineInView.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allMineSelected}
                        onChange={toggleSelectAll}
                        aria-label="Sélectionner toutes mes tâches"
                        title="Sélectionner toutes les tâches que j'ai créées"
                      />
                    )}
                  </th>
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
                  <tr key={task.id} className={selectedIds.includes(task.id) ? 'mt-row--selected' : undefined}>
                    <td className="mt-select-col">
                      {isMine(task) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(task.id)}
                          onChange={() => toggleSelected(task.id)}
                          aria-label={`Sélectionner « ${task.title} »`}
                        />
                      )}
                    </td>
                    <td>
                      <span className="mt-title-cell">
                        {isMine(task) && (
                          <span className="mt-mine-dot" title="Tâche que vous avez créée" aria-label="Tâche que vous avez créée" />
                        )}
                        <Link
                          to={`/tasks/${task.id}`}
                          state={{ backgroundLocation: location }}
                          className="task-table-title"
                        >
                          {task.title}
                        </Link>
                      </span>
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
                      <Link
                        to={`/tasks/${task.id}`}
                        state={{ backgroundLocation: location }}
                        className="icon-link-btn"
                        aria-label="Ouvrir la tâche"
                      >
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

      <NewTaskModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadTasks} />
    </EmployeeLayout>
  );
}

export default MyTasks;
