import { useEffect, useMemo, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import AttachmentUpload from '../../components/AttachmentUpload';
import CommentSection from '../../components/CommentSection';
import AdminLateTasks from './AdminLateTasks';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconCheckCircle, IconX, IconSearch, IconArrowRight } from '../../components/icons';
import { priorityLabel } from '../../utils/taskStatus';
import '../../styles/admin.css';
import { PageSkeleton } from '../../components/Skeleton';

const STATUS_META = {
  DECLAREE: { label: 'Declared', pill: 'declared' },
  VALIDEE: { label: 'To do', pill: 'todo' },
  EN_COURS: { label: 'In progress', pill: 'progress' },
  TERMINEE: { label: 'Completed', pill: 'done' },
  CONFIRMEE: { label: 'Confirmed', pill: 'confirmed' },
};

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'DECLAREE', label: 'Declared' },
  { value: 'TERMINEE', label: 'Completed' },
  { value: 'EN_COURS', label: 'In progress' },
  { value: 'VALIDEE', label: 'To do' },
  { value: 'CONFIRMEE', label: 'Confirmed' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };
const ACTIONABLE_STATUSES = new Set(['DECLAREE', 'TERMINEE']);

function isActionableTask(task) {
  return ACTIONABLE_STATUSES.has(task.status);
}

function bulkResultMessage(results, actionLabel) {
  const failures = results.filter((result) => result.status === 'rejected');
  const successCount = results.length - failures.length;

  if (failures.length === 0) {
    return { success: true, message: `${successCount} task(s) ${actionLabel}` };
  }

  const firstReason = failures[0].reason?.response?.data?.error;
  return {
    success: false,
    message: `${successCount} succeeded, ${failures.length} failed.${firstReason ? ` ${firstReason}` : ''}`,
  };
}

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

function AdminTasksToValidate() {
  const [activeTab, setActiveTab] = useState('validate'); // 'validate' | 'late'
  const [lateCount, setLateCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMotif, setBulkMotif] = useState('');
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [motifs, setMotifs] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await taskService.getTasks();
      setTasks(data);
      const actionableIds = new Set(data.filter(isActionableTask).map((task) => task.id));
      setSelectedIds((current) => current.filter((id) => actionableIds.has(id)));
      return data;
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to load tasks');
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    userService
      .getAllUsers({ role: 'EMPLOYEE' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
    taskService
      .getLateTasks()
      .then((late) => setLateCount(late.length))
      .catch(() => setLateCount(0));
  }, []);

  useEffect(() => {
    if (!detailTaskId) {
      setDetailTask(null);
      return;
    }
    taskService.getTask(detailTaskId).then(setDetailTask).catch(() => setDetailTask(null));
  }, [detailTaskId]);

  function employeeName(id) {
    const found = employees.find((e) => e.id === id);
    return found ? found.full_name : id;
  }

  const filteredTasks = useMemo(
    () =>
      tasks
        .filter((task) => {
        const matchesStatus = !statusFilter || task.status === statusFilter;
        const matchesPriority = !priorityFilter || task.priority === priorityFilter;
        const matchesEmployee = !employeeFilter || task.assigned_to === employeeFilter;
        const matchesDeadline = matchesDeadlineRange(task.deadline, deadlineFilter);
        return matchesStatus && matchesPriority && matchesEmployee && matchesDeadline;
        })
        .sort((a, b) => {
          const updatedA = new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0).getTime();
          const updatedB = new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0).getTime();
          return updatedB - updatedA;
        }),
    [tasks, statusFilter, priorityFilter, employeeFilter, deadlineFilter]
  );

  const hasFilters = statusFilter || priorityFilter || employeeFilter || deadlineFilter;
  const actionableFilteredTasks = filteredTasks.filter(isActionableTask);
  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));
  const selectedDoneIds = selectedTasks.filter((task) => task.status === 'TERMINEE').map((task) => task.id);
  const selectedDeclaredIds = selectedTasks.filter((task) => task.status === 'DECLAREE').map((task) => task.id);
  const allVisibleSelected =
    actionableFilteredTasks.length > 0 && actionableFilteredTasks.every((task) => selectedIds.includes(task.id));
  const isProcessing = pendingAction !== null;

  function resetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setEmployeeFilter('');
    setDeadlineFilter('');
  }

  function toggleSelect(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task || !isActionableTask(task) || isProcessing) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      const visibleIds = new Set(actionableFilteredTasks.map((task) => task.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedIds((current) => [...new Set([...current, ...actionableFilteredTasks.map((task) => task.id)])]);
    }
  }

  async function handleConfirmOne(id) {
    setPendingAction(`confirm:${id}`);
    try {
      // Relecture juste avant l'action : la liste peut être ancienne (autre admin,
      // validation automatique ou changement depuis un autre onglet).
      const current = await taskService.getTask(id);
      if (current.status !== 'TERMINEE') {
        throw Object.assign(new Error('Status changed'), {
          response: { data: { error: `The task is no longer completed (current status: ${current.status})` } },
        });
      }
      await taskService.confirmTask(id);
      notifySuccess('Task confirmed');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to confirm the task');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRejectOne(id) {
    const motif = motifs[id];
    if (!motif || !motif.trim()) {
      notifyError('A reason is required to send a task back');
      return;
    }
    setPendingAction(`reject:${id}`);
    try {
      await taskService.rejectTask(id, motif);
      notifySuccess('Task sent back to the employee');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to send the task back');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleValidateOne(id) {
    setPendingAction(`validate:${id}`);
    try { await taskService.validateTask(id); notifySuccess('Task validated'); await load(); }
    catch (err) { notifyError(err.response?.data?.error || 'Unable to validate the task'); }
    finally { setPendingAction(null); }
  }

  async function handleBulkConfirm() {
    if (selectedDoneIds.length === 0 || isProcessing) return;
    if (!window.confirm(`Confirm ${selectedDoneIds.length} completed task(s)?`)) return;

    setPendingAction('bulk-confirm');
    try {
      // La sélection peut contenir un statut devenu obsolète depuis le dernier
      // chargement. On relit la liste avant d'envoyer les confirmations afin de ne
      // transmettre au backend que les tâches encore TERMINEE.
      const latestTasks = await taskService.getTasks();
      const selectedSet = new Set(selectedDoneIds);
      const confirmableIds = latestTasks
        .filter((task) => selectedSet.has(task.id) && task.status === 'TERMINEE')
        .map((task) => task.id);
      const staleIds = selectedDoneIds.filter((id) => !confirmableIds.includes(id));

      const results = await Promise.allSettled(confirmableIds.map((id) => taskService.confirmTask(id)));
      const outcome = bulkResultMessage(results, 'confirmed');
      const staleMessage = staleIds.length
        ? ` ${staleIds.length} task(s) skipped: their status changed between loading and confirmation.`
        : '';
      if (outcome.success && staleIds.length === 0) notifySuccess(outcome.message);
      else if (outcome.success) notifyError(`${outcome.message}.${staleMessage}`);
      else notifyError(`${outcome.message}${staleMessage}`);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to reload tasks before confirmation');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkReject() {
    if (selectedDoneIds.length === 0 || isProcessing) return;
    if (!bulkMotif.trim()) {
      notifyError('A reason is required for the bulk rejection');
      return;
    }
    if (!window.confirm(`The reason "${bulkMotif}" will be applied to the ${selectedDoneIds.length} completed tasks. Continue?`)) {
      return;
    }

    setPendingAction('bulk-reject');
    try {
      const results = await Promise.allSettled(selectedDoneIds.map((id) => taskService.rejectTask(id, bulkMotif)));
      const outcome = bulkResultMessage(results, 'sent back');
      if (outcome.success) {
        notifySuccess(outcome.message);
        setBulkMotif('');
      } else {
        notifyError(outcome.message);
      }
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) return <PageSkeleton variant="list" />;

  return (
    <div className="validate-page">
      <div className="atv-tabs">
        <button
          type="button"
          className={`atv-tab${activeTab === 'validate' ? ' atv-tab--active' : ''}`}
          onClick={() => setActiveTab('validate')}
        >
          To review
        </button>
        <button
          type="button"
          className={`atv-tab${activeTab === 'late' ? ' atv-tab--active' : ''}`}
          onClick={() => setActiveTab('late')}
        >
          Overdue
          {lateCount > 0 && <span className="atv-tab-badge">{lateCount}</span>}
        </button>
      </div>

      {activeTab === 'late' ? (
        <AdminLateTasks />
      ) : (
        <>
      <div className="admin-filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              className={`filter-chip${statusFilter === option.value ? ' filter-chip--active' : ''}`}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">High</option>
            <option value="NORMALE">Normal</option>
            <option value="FAIBLE">Low</option>
          </select>
          <select className="filter-select" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
          <select className="filter-select" value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)}>
            <option value="">All deadlines</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="past">Past</option>
          </select>
          {hasFilters && (
            <button type="button" className="admin-filter-reset" onClick={resetFilters}>
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="validate-listhead">
        <label className="validate-selectall">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            disabled={actionableFilteredTasks.length === 0 || isProcessing}
          />
          Select actionable tasks
        </label>
        <span className="validate-count">
          {filteredTasks.length} task{filteredTasks.length > 1 ? 's' : ''}
        </span>
      </div>

      {selectedIds.length > 0 && (
        <div className="validate-bulk">
          <span className="validate-bulk-count">{selectedIds.length} selected</span>
          {selectedDoneIds.length > 0 && (
            <>
              <button
                type="button"
                className="btn-primary validate-bulk-confirm"
                onClick={handleBulkConfirm}
                disabled={isProcessing}
              >
                <IconCheckCircle />
                {pendingAction === 'bulk-confirm' ? 'Confirming…' : `Confirm (${selectedDoneIds.length})`}
              </button>
              <div className="validate-bulk-reject">
                <input
                  className="form-input"
                  placeholder="Reason for the completed tasks"
                  value={bulkMotif}
                  onChange={(e) => setBulkMotif(e.target.value)}
                  disabled={isProcessing}
                />
                <button type="button" className="btn-danger" onClick={handleBulkReject} disabled={isProcessing}>
                  {pendingAction === 'bulk-reject' ? 'Sending back…' : `Send back (${selectedDoneIds.length})`}
                </button>
              </div>
            </>
          )}
          {selectedDeclaredIds.length > 0 && (
            <button type="button" className="btn-primary" onClick={async () => { await Promise.all(selectedDeclaredIds.map((id) => taskService.validateTask(id))); await load(); }} disabled={isProcessing}>
              <IconArrowRight /> Validate ({selectedDeclaredIds.length})
            </button>
          )}
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="empty-state">No task matches these filters.</div>
      ) : (
        <div className="validate-list">
          {filteredTasks.map((task) => {
            const meta = STATUS_META[task.status] || { label: task.status, pill: 'declared' };
            const canReview = task.status === 'TERMINEE';
            const canValidate = task.status === 'DECLAREE';
            const selected = selectedIds.includes(task.id);
            return (
              <div key={task.id} className={`validate-card${selected ? ' validate-card--selected' : ''}`}>
                {isActionableTask(task) ? (
                  <label className="validate-card-check" aria-label={`Select task ${task.title}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(task.id)}
                      disabled={isProcessing}
                    />
                  </label>
                ) : (
                  <span className="validate-card-check validate-card-check--empty" aria-hidden="true" />
                )}

                <div className="validate-card-body">
                  <div className="validate-card-top">
                    <button type="button" className="validate-card-title" onClick={() => setDetailTaskId(task.id)}>
                      {task.title}
                    </button>
                    <span className={`pill pill--${meta.pill}`}>{meta.label}</span>
                  </div>

                  <div className="validate-card-meta">
                    <span className="validate-meta-item">
                      <span
                        className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`}
                      />
                      {priorityLabel(task.priority)}
                    </span>
                    <span className="validate-meta-sep" />
                    <span>{employeeName(task.assigned_to)}</span>
                    <span className="validate-meta-sep" />
                    <span>Deadline: {task.deadline ? formatDate(task.deadline) : '—'}</span>
                  </div>

                  {canValidate && (
                    <div className="validate-card-actions"><button type="button" className="validate-action-confirm" onClick={() => handleValidateOne(task.id)} disabled={isProcessing}><IconArrowRight /> Validate</button></div>
                  )}
                  {canReview && (
                    <div className="validate-card-actions">
                      <button
                        type="button"
                        className="validate-action-confirm"
                        onClick={() => handleConfirmOne(task.id)}
                        disabled={isProcessing}
                      >
                        <IconCheckCircle />
                        {pendingAction === `confirm:${task.id}` ? 'Confirming…' : 'Confirm'}
                      </button>
                      <div className="validate-reject-row">
                        <input
                          className="form-input"
                          placeholder="Reason for sending back"
                          value={motifs[task.id] || ''}
                          onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                          disabled={isProcessing}
                        />
                        <button
                          type="button"
                          className="validate-action-reject"
                          onClick={() => handleRejectOne(task.id)}
                          disabled={isProcessing}
                        >
                          {pendingAction === `reject:${task.id}` ? 'Sending back…' : 'Send back'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {detailTask && (
        <>
          <div className="emp-drawer-overlay" onClick={() => setDetailTaskId(null)} />
          <aside className="emp-drawer" role="dialog" aria-label="Task details">
            <button type="button" className="emp-drawer-close" onClick={() => setDetailTaskId(null)} aria-label="Close">
              <IconX />
            </button>

            <header className="validate-detail-head">
              <span className="lists-content-eyebrow">Task</span>
              <h2>{detailTask.title}</h2>
              <div className="validate-detail-pills">
                <span className={`pill pill--${(STATUS_META[detailTask.status] || {}).pill || 'declared'}`}>
                  {(STATUS_META[detailTask.status] || {}).label || detailTask.status}
                </span>
                <span className="validate-meta-item">
                  <span className={`priority-dot priority-dot--${PRIORITY_CLS[detailTask.priority] || 'normale'}`} />
                  {priorityLabel(detailTask.priority)}
                </span>
              </div>
            </header>

            {detailTask.description && <p className="validate-detail-desc">{detailTask.description}</p>}

            <div className="validate-detail-meta">
              <span>Deadline: {detailTask.deadline ? formatDate(detailTask.deadline) : '—'}</span>
            </div>

            <section className="emp-drawer-section">
              <h3 className="app-section-title">Attachments</h3>
              <AttachmentUpload taskId={detailTask.id} canUpload={false} />
            </section>

            <section className="emp-drawer-section">
              <h3 className="app-section-title">Comments & notes</h3>
              <CommentSection taskId={detailTask.id} />
            </section>
          </aside>
        </>
      )}
    </div>
  );
}

export default AdminTasksToValidate;
