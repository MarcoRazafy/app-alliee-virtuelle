import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, priorityLabel, formatRelativeDeadline } from '../utils/taskStatus';
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
  const [loading, setLoading] = useState(true);
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
      notifyError(err.response?.data?.error || 'Unable to load tasks');
    } finally {
      setLoading(false);
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
      notifySuccess('Task proposed: awaiting validation by an administrator');
      setNewTask(EMPTY_NEW_TASK);
      setCreateOpen(false);
      await loadTasks();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Unable to create the task');
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
      title="My tasks"
      breadcrumb={[{ label: 'Home', to: '/dashboard' }, { label: 'My tasks' }]}
      subtitle="Find and filter all your assigned tasks"
      skeleton={loading ? 'list' : null}
    >
      <div className="mytasks-toolbar">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <IconChecklist /> Propose a task
        </button>
      </div>

      <SearchBar onChange={setFilters} />

      <p className="results-count">{filteredTasks.length} task(s) found</p>

      <div className="side-card">
        {filteredTasks.length === 0 && <div className="empty-state">No task matches these filters.</div>}
        {filteredTasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project / Context</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Total time</th>
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
                      <span className={`pill ${priorityPillClass(task.priority)}`}>{priorityLabel(task.priority)}</span>
                    </td>
                    <td>{task.totalDuration != null ? formatDurationShort(task.totalDuration) : '—'}</td>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="icon-link-btn" aria-label="Open task">
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
                <p className="modal-card-eyebrow">New task</p>
                <h2 id="new-task-title">Propose a task</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setCreateOpen(false)} aria-label="Close">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Your task will be submitted to an administrator. You will be able to start it once validated.
            </p>

            <form className="modal-card-form" onSubmit={handleCreateTask}>
              <label className="modal-field">
                <span className="modal-label">Title</span>
                <input
                  className="modal-input"
                  value={newTask.title}
                  onChange={(e) => setNewTask((c) => ({ ...c, title: e.target.value }))}
                  placeholder="Task title"
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
                  placeholder="Details (optional)"
                />
              </label>

              <div className="modal-card-row">
                <label className="modal-field">
                  <span className="modal-label">Priority</span>
                  <select
                    className="modal-input"
                    value={newTask.priority}
                    onChange={(e) => setNewTask((c) => ({ ...c, priority: e.target.value }))}
                  >
                    <option value="FAIBLE">Low</option>
                    <option value="NORMALE">Normal</option>
                    <option value="HAUTE">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>

                <label className="modal-field">
                  <span className="modal-label">Deadline</span>
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
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating || !newTask.title.trim() || !newTask.deadline}>
                  {creating ? 'Sending…' : 'Propose task'}
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
