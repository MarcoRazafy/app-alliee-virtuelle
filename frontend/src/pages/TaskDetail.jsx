import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import AttachmentUpload from '../components/AttachmentUpload';
import CommentSection from '../components/CommentSection';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import { formatClock, formatDurationShort, formatDateTime, formatDate } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, priorityLabel } from '../utils/taskStatus';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconPlay, IconStop, IconCheckCircle, IconArrowRight } from '../components/icons';

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const Layout = isAdmin ? AdminLayout : EmployeeLayout;

  const [task, setTask] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [breadcrumbData, setBreadcrumbData] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDeadline, setNewSubtaskDeadline] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [taskData, historyData, detailData] = await Promise.all([
        taskService.getTask(id),
        taskService.getTimelogHistory(id),
        taskService.getTaskDetail(id).catch(() => null),
      ]);
      setTask(taskData);
      setHistory(historyData);
      const running = historyData.find((session) => !session.end_time);
      setActiveSession(running || null);
      if (detailData) {
        setBreadcrumbData(detailData.breadcrumb);
        setSubtasks(detailData.subtasks || []);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        notifyError(err.response?.data?.error || 'Unable to load the task');
      }
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Repère les changements faits ailleurs (bascule depuis une autre tâche, autre onglet...)
  useEffect(() => {
    const poll = setInterval(loadData, 5000);
    return () => clearInterval(poll);
  }, [loadData]);

  useEffect(() => {
    if (notFound) {
      notifyError('Task not found');
      const timeout = setTimeout(() => navigate('/tasks'), 2000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [notFound, navigate]);

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => {
      const startedAt = new Date(activeSession.start_time).getTime();
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  async function handleStart() {
    try {
      const result = await taskService.startTimelog(id);
      if (result.switchedFromTaskId) {
        notifySuccess(`Previous timer stopped (${formatDurationShort(result.switchedFromDuration)}), new timer started`);
      } else {
        notifySuccess('Timer started');
      }
      await loadData();
    } catch (err) {
      if (err.response?.status === 409) {
        notifyError('The timer is already running on this task');
      } else {
        notifyError(err.response?.data?.error || 'Unable to start the timer');
      }
    }
  }

  async function handleStop() {
    try {
      const result = await taskService.stopTimelog(id);
      notifySuccess(`Timer stopped - ${formatDurationShort(result.duration)} recorded`);
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to stop the timer');
    }
  }

  async function handleComplete() {
    try {
      await taskService.completeTask(id);
      notifySuccess('Task completed!');
      await loadData();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to mark the task as completed');
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !newSubtaskDeadline) {
      notifyError('Title and deadline are required for the subtask');
      return;
    }
    try {
      await taskService.createTask({
        title: newSubtaskTitle,
        assigned_to: task.assigned_to,
        priority: 'NORMALE',
        deadline: newSubtaskDeadline,
        parent_task_id: id,
      });
      notifySuccess('Subtask added');
      setNewSubtaskTitle('');
      setNewSubtaskDeadline('');
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Unable to add the subtask');
    }
  }

  const layoutProps = isAdmin
    ? {}
    : {
        title: task?.title || 'Task details',
        breadcrumb: [{ label: 'Home', to: '/dashboard' }, { label: 'My tasks', to: '/tasks' }, { label: task?.title || '' }],
      };

  if (notFound) {
    return (
      <Layout {...layoutProps}>
        <div className="empty-state">Task not found. Returning to My tasks...</div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout {...layoutProps}>
        <p>Loading...</p>
      </Layout>
    );
  }

  const totalSeconds = history.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const sortedHistory = [...history].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const isCompleted = ['TERMINEE', 'CONFIRMEE'].includes(task.status);
  const displayStatus = task.status === 'EN_COURS' && !activeSession ? 'A_REPRENDRE' : task.status;
  const confirmedSubtasks = subtasks.filter((s) => s.status === 'CONFIRMEE').length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((confirmedSubtasks / subtasks.length) * 100) : 0;

  return (
    <Layout {...layoutProps}>
      {isAdmin && (
        <p style={{ marginBottom: '16px' }}>
          <Link to="/tasks" className="app-link">
            ← Back to my tasks
          </Link>
        </p>
      )}

      <div className="side-card" style={{ marginBottom: '20px' }}>
        {breadcrumbData && (
          <span className="hierarchy-chip">
            {breadcrumbData.space.name} › {breadcrumbData.folder.name} › {breadcrumbData.list.name}
          </span>
        )}
        {task.description && <p className="detail-description">{task.description}</p>}

        <div className="detail-meta-row">
          <div className="detail-meta-item">
            <span className="detail-meta-label">Status</span>
            <span className={`pill ${STATUS_PILL[displayStatus]?.className || ''}`}>
              {STATUS_PILL[displayStatus]?.label || displayStatus}
            </span>
          </div>
          <div className="detail-meta-item">
            <span className="detail-meta-label">Priority</span>
            <span className={`pill ${priorityPillClass(task.priority)}`}>{priorityLabel(task.priority)}</span>
          </div>
          <div className="detail-meta-item">
            <span className="detail-meta-label">Deadline</span>
            <span>{formatDate(task.deadline)}</span>
          </div>
          {isAdmin && task.assigned_to && (
            <div className="detail-meta-item">
              <span className="detail-meta-label">Assigned to</span>
              <button
                type="button"
                className="app-link detail-assignee-link"
                onClick={() => navigate('/admin/messaging', { state: { employeeId: task.assigned_to } })}
                title={`Chat with ${task.assignee_name || 'the employee'}`}
              >
                {task.assignee_name || 'Employee'}
                <IconArrowRight />
              </button>
            </div>
          )}
          {(task.client_name || task.client_email) && (
            <div className="detail-meta-item">
              <span className="detail-meta-label">Client</span>
              <span>
                {task.client_name}
                {task.client_name && task.client_email && ' — '}
                {task.client_email}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isAdmin && (
      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Time tracking
        </p>
        <div className="chrono-card-body">
          {activeSession && (
            <div className="chrono-ring-wrap">
              <div className="chrono-ring" />
              <div className="chrono-ring-inner">
                <span className="chrono-ring-value">{formatClock(elapsed)}</span>
                <span className="chrono-ring-caption">Elapsed time</span>
              </div>
            </div>
          )}
          <div className="chrono-card-actions">
            {activeSession ? (
              <button className="btn-danger" onClick={handleStop}>
                <IconStop /> Stop the timer
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={!['VALIDEE', 'EN_COURS', 'TERMINEE'].includes(task.status)}
              >
                <IconPlay /> Start the timer
              </button>
            )}
            <button className="btn-outline" onClick={handleComplete} disabled={task.status !== 'EN_COURS'}>
              <IconCheckCircle /> Mark as completed
            </button>
          </div>
        </div>
      </div>
      )}

      {!isAdmin && (
      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Timer history
        </p>
        {sortedHistory.length === 0 && <div className="empty-state">No session.</div>}
        {sortedHistory.length > 0 && (
          <>
            <div className="task-table-wrap">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((session, index) => (
                    <tr key={index}>
                      <td>{formatDateTime(session.start_time)}</td>
                      <td>{session.end_time ? formatDateTime(session.end_time) : 'in progress'}</td>
                      <td>{session.duration_seconds != null ? formatDurationShort(session.duration_seconds) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '12px', fontSize: '13.5px' }}>
              <strong>Total: {formatDurationShort(totalSeconds)}</strong>
            </p>
          </>
        )}
      </div>
      )}

      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Subtasks
        </p>
        {subtasks.length === 0 && <div className="empty-state">No subtask.</div>}
        {subtasks.length > 0 && (
          <>
            <div className="progress-row">
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${subtaskProgress}%` }} />
              </div>
              <span className="progress-label">
                {confirmedSubtasks}/{subtasks.length} confirmed
              </span>
            </div>
            {subtasks.map((subtask) => (
              <Link key={subtask.id} to={`/tasks/${subtask.id}`} className="subtask-item">
                <span className={`pill ${priorityPillClass(subtask.priority)}`}>{priorityLabel(subtask.priority)}</span>
                <span className="subtask-title">{subtask.title}</span>
                <span className={`pill ${STATUS_PILL[subtask.status]?.className || ''}`}>
                  {STATUS_PILL[subtask.status]?.label || subtask.status}
                </span>
                <span className="subtask-deadline">{formatDate(subtask.deadline)}</span>
                <IconArrowRight />
              </Link>
            ))}
          </>
        )}
        {isAdmin && (
          <form className="add-subtask-form" onSubmit={handleAddSubtask}>
            <input
              type="text"
              placeholder="Subtask title"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
            />
            <input type="date" value={newSubtaskDeadline} onChange={(e) => setNewSubtaskDeadline(e.target.value)} />
            <button type="submit" className="btn-primary">
              Add
            </button>
          </form>
        )}
      </div>

      <div className="side-card" style={{ marginBottom: '20px' }}>
        <p className="side-card-title" style={{ marginBottom: '16px' }}>
          Comments & Notes
        </p>
        <CommentSection taskId={id} />
      </div>

      {!isAdmin && (
        <div className="side-card">
          <p className="side-card-title" style={{ marginBottom: '16px' }}>
            Attachments
          </p>
          <AttachmentUpload taskId={id} canUpload={!isCompleted} />
        </div>
      )}
    </Layout>
  );
}

export default TaskDetail;
