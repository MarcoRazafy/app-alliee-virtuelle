import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HierarchyTree from '../../components/admin/HierarchyTree';
import * as taskService from '../../services/taskService';
import * as hierarchyService from '../../services/hierarchyService';
import * as userService from '../../services/userService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconChecklist, IconExternalLink, IconArrowRight, IconTrash } from '../../components/icons';
import { priorityLabel } from '../../utils/taskStatus';
import '../../styles/admin.css';

// Ordre = celui du workflow (DECISIONS.md) : une tâche neuve tombe toujours dans "Déclarée"
const STATUS_GROUPS = [
  { key: 'DECLAREE', label: 'Declared (to review)', pill: 'declared' },
  { key: 'VALIDEE', label: 'To do', pill: 'todo' },
  { key: 'EN_COURS', label: 'In progress', pill: 'progress' },
  { key: 'TERMINEE', label: 'Completed', pill: 'done' },
  { key: 'CONFIRMEE', label: 'Confirmed', pill: 'confirmed' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

function AdminListView() {
  const [selectedListId, setSelectedListId] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [deletingProject, setDeletingProject] = useState(false);

  const [quickAdd, setQuickAdd] = useState({ title: '', assigned_to: '', deadline: '', priority: 'NORMALE' });
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  function loadTasks(listId) {
    taskService
      .getTasks({ list_id: listId, active_only: true })
      .then(setTasks)
      .catch((err) => notifyError(err.response?.data?.error || 'Unable to load tasks'));
  }

  function handleSelectList(listId, list) {
    setSelectedListId(listId);
    setSelectedList(list);
    setShowQuickAdd(false);
    loadTasks(listId);
  }

  function handleAddTask(listId, list) {
    setSelectedListId(listId);
    setSelectedList(list);
    setShowQuickAdd(true);
    loadTasks(listId);
  }

  function clearHierarchySelection() {
    setSelectedListId(null);
    setSelectedList(null);
    setTasks([]);
    setShowQuickAdd(false);
  }

  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickAdd.title.trim() || !quickAdd.assigned_to || !quickAdd.deadline) {
      notifyError('Name, assigned employee and deadline are required to create a task');
      return;
    }
    try {
      await taskService.createTask({
        title: quickAdd.title,
        assigned_to: quickAdd.assigned_to,
        priority: quickAdd.priority,
        deadline: quickAdd.deadline,
        list_id: selectedListId,
      });
      notifySuccess('Task created');
      setQuickAdd({ title: '', assigned_to: '', deadline: '', priority: 'NORMALE' });
      setShowQuickAdd(false);
      loadTasks(selectedListId);
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Unable to create the task');
    }
  }

  async function handleDeleteProject() {
    if (!selectedList || deletingProject) return;
    const confirmed = window.confirm(
      `Delete the project “${selectedList.name}”?\n\nIt will disappear from the tree, but its tasks and files will be kept in the history.`
    );
    if (!confirmed) return;

    setDeletingProject(true);
    try {
      await hierarchyService.deleteList(selectedList.id);
      notifySuccess('Project deleted');
      setSelectedListId(null);
      setSelectedList(null);
      setTasks([]);
      setTreeRefreshKey((value) => value + 1);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to delete the project');
    } finally {
      setDeletingProject(false);
    }
  }

  return (
    <div className="lists-shell">
      <aside className="lists-panel lists-panel--tree">
        <div className="lists-panel-header">
          <h2 className="lists-panel-title">Tree</h2>
        </div>
        <HierarchyTree
          onSelectList={handleSelectList}
          onAddTask={handleAddTask}
          onHierarchyDeleted={clearHierarchySelection}
          selectedListId={selectedListId}
          refreshKey={treeRefreshKey}
        />
      </aside>

      <section className="lists-panel lists-panel--content">
        {!selectedList ? (
          <div className="lists-empty">
            <span className="lists-empty-icon">
              <IconChecklist />
            </span>
            <h3>No list selected</h3>
            <p>Choose a list in the tree to see its tasks, grouped by status.</p>
          </div>
        ) : (
          <>
            <div className="lists-content-header">
              <div>
                <span className="lists-content-eyebrow">Project</span>
                <h2 className="lists-content-title">{selectedList.name}</h2>
              </div>
              <div className="lists-content-actions">
                <span className="lists-content-total">
                  {tasks.length} task{tasks.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  className="lists-delete-project-btn"
                  onClick={handleDeleteProject}
                  disabled={deletingProject}
                >
                  <IconTrash />
                  {deletingProject ? 'Deleting…' : 'Delete the project'}
                </button>
              </div>
            </div>

            {STATUS_GROUPS.map((group) => {
              const groupTasks = tasks.filter((t) => t.status === group.key);
              const isDeclared = group.key === 'DECLAREE';
              return (
                <div key={group.key} className="lists-group">
                  <div className="lists-group-header">
                    <span className={`pill pill--${group.pill}`}>{group.label}</span>
                    <span className="lists-group-count">{groupTasks.length}</span>
                    {group.key === 'CONFIRMEE' && (
                      <span className="lists-auto-hide-hint">Automatically hidden after 5 days</span>
                    )}
                    {isDeclared && !showQuickAdd && (
                      <button type="button" className="lists-add-btn" onClick={() => setShowQuickAdd(true)}>
                        + Add a task
                      </button>
                    )}
                  </div>

                  {isDeclared && showQuickAdd && (
                    <form className="lists-quick-add" onSubmit={handleQuickAdd}>
                      <input
                        className="form-input"
                        placeholder="Task name"
                        value={quickAdd.title}
                        onChange={(e) => setQuickAdd({ ...quickAdd, title: e.target.value })}
                        autoFocus
                      />
                      <select
                        className="form-select"
                        value={quickAdd.assigned_to}
                        onChange={(e) => setQuickAdd({ ...quickAdd, assigned_to: e.target.value })}
                      >
                        <option value="">Employee…</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-input"
                        type="date"
                        value={quickAdd.deadline}
                        onChange={(e) => setQuickAdd({ ...quickAdd, deadline: e.target.value })}
                      />
                      <select
                        className="form-select"
                        value={quickAdd.priority}
                        onChange={(e) => setQuickAdd({ ...quickAdd, priority: e.target.value })}
                      >
                        <option value="URGENT">Urgent</option>
                        <option value="HAUTE">High</option>
                        <option value="NORMALE">Normal</option>
                        <option value="FAIBLE">Low</option>
                      </select>
                      <div className="lists-quick-add-actions">
                        <button type="submit" className="btn-primary">
                          <IconArrowRight />
                          Save
                        </button>
                        <button type="button" className="btn-outline" onClick={() => setShowQuickAdd(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {groupTasks.length === 0 ? (
                    <p className="lists-group-empty">No task.</p>
                  ) : (
                    <div className="task-table-wrap">
                      <table className="task-table">
                        <thead>
                          <tr>
                            <th>Task</th>
                            <th>Assigned to</th>
                            <th>Deadline</th>
                            <th>Priority</th>
                            <th aria-label="Open" />
                          </tr>
                        </thead>
                        <tbody>
                          {groupTasks.map((task) => (
                            <tr key={task.id}>
                              <td>
                                <Link to={`/tasks/${task.id}`} className="task-table-title">
                                  {task.title}
                                </Link>
                              </td>
                              <td>{task.assigned_to_name || '—'}</td>
                              <td>{task.deadline ? formatDate(task.deadline) : '—'}</td>
                              <td>
                                <span className="lists-priority">
                                  <span
                                    className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`}
                                  />
                                  {priorityLabel(task.priority)}
                                </span>
                              </td>
                              <td>
                                <Link to={`/tasks/${task.id}`} className="icon-link-btn" title="Open task">
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
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}

export default AdminListView;
