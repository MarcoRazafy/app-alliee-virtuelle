import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import * as taskService from '../services/taskService';
import * as statsService from '../services/statsService';
import * as messageService from '../services/messageService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AnimatedNumber from '../components/AnimatedNumber';
import { formatDurationShort, formatRelativeTime } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, priorityLabel, formatRelativeDeadline } from '../utils/taskStatus';
import {
  IconWorkspace,
  IconCalendarCheck,
  IconChecklist,
  IconChat,
  IconBarChart,
  IconCalendarWeek,
  IconFolder,
  IconUser,
  IconAlert,
  IconCheckCircle,
  IconClock,
  IconExternalLink,
  IconArrowRight,
  IconPlay,
  IconStop,
  IconLayers,
} from '../components/icons';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const QUICK_LINKS = [
  { to: '/workspace', label: 'My space', icon: IconWorkspace },
  { to: '/my-day', label: 'My day', icon: IconCalendarCheck },
  { to: '/tasks', label: 'My tasks', icon: IconChecklist },
  { to: '/messaging', label: 'Messaging', icon: IconChat, badgeKey: 'messages' },
  { to: '/stats', label: 'Stats', icon: IconBarChart },
  { to: '/planning', label: 'Planning', icon: IconCalendarWeek },
  { to: '/resources', label: 'Resources', icon: IconFolder },
  { to: '/profile', label: 'Profile', icon: IconUser },
];

const ACTIVITY_META = {
  VALIDATE_MY_DAY: { icon: IconCheckCircle, variant: 'success', label: () => 'You validated your day' },
  START_TIMELOG: { icon: IconPlay, variant: 'info', label: (a) => `Timer started on “${a.task_title || 'a task'}”` },
  STOP_TIMELOG: { icon: IconStop, variant: 'muted', label: (a) => `Timer stopped on “${a.task_title || 'a task'}”` },
  AUTO_STOP_TIMELOG: { icon: IconClock, variant: 'muted', label: (a) => `Timer switched from “${a.task_title || 'a task'}”` },
  AUTO_STOP_TIMELOG_LOGOUT: {
    icon: IconClock,
    variant: 'muted',
    label: () => 'Timer stopped automatically on logout',
  },
  COMPLETE_TASK: { icon: IconCheckCircle, variant: 'success', label: (a) => `Task “${a.task_title || ''}” completed` },
};

function isLate(deadline) {
  return new Date(deadline) < new Date(new Date().toDateString());
}

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [dayValidated, setDayValidated] = useState(false);
  const [noTasksAvailable, setNoTasksAvailable] = useState(false);
  const [todoCount, setTodoCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [secondsWorkedToday, setSecondsWorkedToday] = useState(0);
  const [secondsConnectedToday, setSecondsConnectedToday] = useState(0);
  const [urgentTasks, setUrgentTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const firstName = user?.full_name?.split(' ')[0] || '';

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      navigate('/admin', { replace: true });
      return;
    }
    if (user?.role !== 'EMPLOYEE') return;

    Promise.all([taskService.getMyDay(), taskService.getTasks()])
      .then(([selection, allTasks]) => {
        const selectionValidated = selection.length > 0 && selection.every((item) => item.validated_at);
        const hasAvailableTasks = allTasks.some((task) => task.status === 'VALIDEE' || task.status === 'EN_COURS');
        setNoTasksAvailable(!hasAvailableTasks);
        setDayValidated(selectionValidated || !hasAvailableTasks);
        setTodoCount(selection.filter((item) => item.task_data.status === 'VALIDEE').length);
        setInProgressCount(selection.filter((item) => item.task_data.status === 'EN_COURS').length);
      })
      .finally(() => setLoading(false));

    taskService.getTasks({ priority: 'URGENT' }).then(setUrgentTasks);

    Promise.all([messageService.getConversations(), messageService.getMessageGroups()]).then(([conversations, groups]) => {
      const privateUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0);
      const groupUnread = groups.reduce((sum, group) => sum + (group.unread_count || 0), 0);
      setUnreadCount(privateUnread + groupUnread);
    });

    const date = todayDateString();
    statsService.getMyStats(date, date).then((stats) => {
      setSecondsWorkedToday(stats.summary.total_hours_worked_seconds);
      setSecondsConnectedToday(stats.summary.total_connected_seconds);
    });

    taskService.getMyActivity().then(setActivity);
  }, [user, navigate]);

  if (user?.role !== 'EMPLOYEE') {
    return null;
  }

  return (
    <EmployeeLayout title="Dashboard" breadcrumb={[{ label: 'Home' }]} subtitle="Welcome to your employee space" skeleton={loading ? 'dashboard' : null}>
      <div className="dashboard-top-grid">
        <div className="dash-hero">
          <div className="dash-hero-watermark">
            <img src="/logo-mark.png" alt="" />
          </div>
          <div className="dash-hero-info">
            <h2 className="dash-hero-title">Hello, {firstName} 👋</h2>
            <p className="dash-hero-text">
              {dayValidated
                ? noTasksAvailable
                  ? 'No task is assigned to you. Take the opportunity to explore the platform freely.'
                  : 'Glad to see you back! Here is an overview of your day.'
                : 'Validate your day to start working on your tasks.'}
            </p>
            <span className="status-badge status-badge--validated">
              <span className="status-dot" />
              Active account
            </span>
          </div>
          <div className="dash-hero-status">
            {dayValidated ? (
              <>
                <span className="dash-hero-check">
                  <IconCheckCircle />
                </span>
                <p className="dash-hero-status-title">
                  {noTasksAvailable ? 'Platform accessible' : 'Day validated'}
                </p>
                <p className="dash-hero-status-text">
                  {noTasksAvailable ? 'You can browse all your spaces.' : 'Have a productive day!'}
                </p>
              </>
            ) : (
              <>
                <span className="dash-hero-check dash-hero-check--pending">
                  <IconCalendarCheck />
                </span>
                <p className="dash-hero-status-title">Day not validated</p>
                <Link to="/my-day" className="app-link">
                  Validate my day <IconArrowRight />
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="side-card">
          <div className="side-card-header">
            <p className="side-card-title">Today</p>
            <Link to="/my-day" className="app-link">
              View my day <IconArrowRight />
            </Link>
          </div>
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--blue">
                <IconChecklist />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={todoCount} />
                <div className="stat-tile-label">Tasks to do</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--amber">
                <IconClock />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={inProgressCount} />
                <div className="stat-tile-label">In progress</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--purple">
                <IconChat />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={unreadCount} />
                <div className="stat-tile-label">Unread messages</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--green">
                <IconLayers />
              </span>
              <div>
                <AnimatedNumber
                  className="stat-tile-value"
                  value={secondsWorkedToday}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <div className="stat-tile-label">Time worked</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--cyan">
                <IconClock />
              </span>
              <div>
                <AnimatedNumber
                  className="stat-tile-value"
                  value={secondsConnectedToday}
                  format={(value) => formatDurationShort(Math.round(value))}
                />
                <div className="stat-tile-label">Connection time</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="app-section-title">Quick access</p>
      <div className="quick-grid">
        {QUICK_LINKS.map(({ to, label, icon: Icon, badgeKey }) => (
          <Link key={to} to={to} className="quick-card">
            <span className="quick-card-icon">
              <Icon />
            </span>
            <span className="quick-card-label">{label}</span>
            {badgeKey === 'messages' && unreadCount > 0 && <span className="quick-card-badge">{unreadCount}</span>}
          </Link>
        ))}
      </div>

      <div className="workspace-grid">
        <div className="workspace-main">
          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Urgent tasks</p>
              <Link to="/tasks" className="app-link">
                View all tasks <IconArrowRight />
              </Link>
            </div>
            {urgentTasks.length === 0 && <div className="empty-state">No urgent tasks at the moment.</div>}
            {urgentTasks.length > 0 && (
              <div className="task-table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Project / Context</th>
                      <th>Deadline</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {urgentTasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link to={`/tasks/${task.id}`} className="task-table-title">
                            {task.title}
                          </Link>
                        </td>
                        <td>{task.list_name && <span className="task-table-project">{task.list_name}</span>}</td>
                        <td className={isLate(task.deadline) ? 'urgent-card-deadline--late' : ''}>
                          {formatRelativeDeadline(task.deadline)}
                        </td>
                        <td>
                          <span className={`pill ${STATUS_PILL[task.status]?.className || ''}`}>
                            {STATUS_PILL[task.status]?.label || task.status}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${priorityPillClass(task.priority)}`}>{priorityLabel(task.priority)}</span>
                        </td>
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
        </div>

        <div className="workspace-side">
          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Recent activity</p>
            </div>
            {activity.length === 0 && <div className="empty-state">No recent activity.</div>}
            {activity.map((entry, index) => {
              const meta = ACTIVITY_META[entry.action];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div key={index} className="activity-item">
                  <span className={`activity-icon activity-icon--${meta.variant}`}>
                    <Icon />
                  </span>
                  <span className="activity-text">{meta.label(entry)}</span>
                  <span className="activity-time">{formatRelativeTime(entry.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </EmployeeLayout>
  );
}

export default Dashboard;
