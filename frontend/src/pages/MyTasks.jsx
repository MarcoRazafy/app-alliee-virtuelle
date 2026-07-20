import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline } from '../utils/taskStatus';
import { IconExternalLink, IconChecklist, IconX } from '../components/icons';
import { notifySuccess, notifyError } from '../utils/toast';

const EMPTY_NEW_TASK = { title: '', description: '', priority: 'NORMALE', deadline: '' };

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

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState(EMPTY_NEW_TASK);

  // La deadline doit être strictement postérieure à aujourd'hui (validation backend).
  const minDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

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

  useEffect(() => {
    loadTasks();
  }, []);

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.deadline) return;
    setCreating(true);
    try {
      await taskService.createTask({
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        priority: newTask.priority,
        deadline: newTask.deadline,
      });
      notifySuccess('Tâche proposée : en attente de validation par un administrateur');
      setNewTask(EMPTY_NEW_TASK);
      setCreateOpen(false);
      await loadTasks();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    } finally {
      setCreating(false);
    }
  }

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
      <div className="mytasks-toolbar">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <IconChecklist /> Proposer une tâche
        </button>
      </div>

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

      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-card-head">
              <div>
                <p className="modal-card-eyebrow">Nouvelle tâche</p>
                <h2 id="new-task-title">Proposer une tâche</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setCreateOpen(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Votre tâche sera soumise à un administrateur. Vous pourrez la démarrer une fois validée.
            </p>

            <form className="modal-card-form" onSubmit={handleCreateTask}>
              <label className="modal-field">
                <span className="modal-label">Titre</span>
                <input
                  className="modal-input"
                  value={newTask.title}
                  onChange={(e) => setNewTask((c) => ({ ...c, title: e.target.value }))}
                  placeholder="Intitulé de la tâche"
                  required
                  autoFocus
                />
              </label>

              <label className="modal-field">
                <span className="modal-label">Description</span>
                <textarea
                  className="modal-input modal-textarea"
                  rows={3}
                  value={newTask.description}
                  onChange={(e) => setNewTask((c) => ({ ...c, description: e.target.value }))}
                  placeholder="Détails (facultatif)"
                />
              </label>

              <div className="modal-card-row">
                <label className="modal-field">
                  <span className="modal-label">Priorité</span>
                  <select
                    className="modal-input"
                    value={newTask.priority}
                    onChange={(e) => setNewTask((c) => ({ ...c, priority: e.target.value }))}
                  >
                    <option value="FAIBLE">Faible</option>
                    <option value="NORMALE">Normale</option>
                    <option value="HAUTE">Haute</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>

                <label className="modal-field">
                  <span className="modal-label">Échéance</span>
                  <input
                    className="modal-input"
                    type="date"
                    value={newTask.deadline}
                    min={minDeadline}
                    onChange={(e) => setNewTask((c) => ({ ...c, deadline: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className="modal-card-foot">
                <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={creating || !newTask.title.trim() || !newTask.deadline}>
                  {creating ? 'Envoi…' : 'Proposer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </EmployeeLayout>
  );
}

export default MyTasks;
