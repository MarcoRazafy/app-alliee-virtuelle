import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import * as taskService from '../services/taskService';
import * as statsService from '../services/statsService';
import * as messageService from '../services/messageService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AnimatedNumber from '../components/AnimatedNumber';
import LottieIcon from '../components/LottieIcon';
import { formatDurationShort, formatRelativeTime } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline } from '../utils/taskStatus';
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
  IconMegaphone,
} from '../components/icons';
import { businessDayNow } from '../utils/businessDay';

// « Aujourd'hui » au sens de la journée de travail (fin à 2 h du matin), comme le serveur :
// à 1 h, un employé de nuit doit voir le temps de la journée qu'il est en train de finir.
const todayDateString = businessDayNow;

const QUICK_LINKS = [
  { to: '/workspace', label: 'Mon espace', icon: IconWorkspace },
  { to: '/my-day', label: 'Ma journée', icon: IconCalendarCheck },
  { to: '/tasks', label: 'Mes tâches', icon: IconChecklist },
  { to: '/messaging', label: 'Messagerie', icon: IconChat, badgeKey: 'messages' },
  { to: '/stats', label: 'Stats', icon: IconBarChart },
  { to: '/planning', label: 'Planning', icon: IconCalendarWeek },
  { to: '/resources', label: 'Ressources', icon: IconFolder },
  { to: '/announcements', label: 'Annonces', icon: IconMegaphone },
  { to: '/profile', label: 'Profil', icon: IconUser },
];

const ACTIVITY_META = {
  VALIDATE_MY_DAY: { icon: IconCheckCircle, variant: 'success', label: () => 'Vous avez validé votre journée' },
  START_TIMELOG: { icon: IconPlay, variant: 'info', label: (a) => `Chrono démarré sur « ${a.task_title || 'une tâche'} »` },
  STOP_TIMELOG: { icon: IconStop, variant: 'muted', label: (a) => `Chrono arrêté sur « ${a.task_title || 'une tâche'} »` },
  AUTO_STOP_TIMELOG: { icon: IconClock, variant: 'muted', label: (a) => `Chrono basculé depuis « ${a.task_title || 'une tâche'} »` },
  AUTO_STOP_TIMELOG_LOGOUT: {
    icon: IconClock,
    variant: 'muted',
    label: () => 'Chrono arrêté automatiquement à la déconnexion',
  },
  COMPLETE_TASK: { icon: IconCheckCircle, variant: 'success', label: (a) => `Tâche « ${a.task_title || ''} » terminée` },
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
    <EmployeeLayout title="Dashboard" breadcrumb={[{ label: 'Accueil' }]} subtitle="Bienvenue sur votre espace employé" skeleton={loading ? 'dashboard' : null}>
      <div className="dashboard-top-grid">
        <div className="dash-hero">
          <div className="dash-hero-watermark">
            <img src="/logo-mark.png" alt="" />
          </div>
          <div className="dash-hero-info">
            <h2 className="dash-hero-title">
              Bonjour, {firstName}{' '}
              <span className="wave-emoji" role="img" aria-label="Bonjour">👋</span>
            </h2>
            <p className="dash-hero-text">
              {dayValidated
                ? noTasksAvailable
                  ? "Aucune tâche ne vous est assignée. Profitez-en pour parcourir librement la plateforme."
                  : 'Heureux de vous revoir ! Voici un aperçu de votre journée.'
                : 'Validez votre journée pour commencer à travailler sur vos tâches.'}
            </p>
          </div>
          <div className="dash-hero-status">
            {dayValidated ? (
              <>
                <LottieIcon
                  src="/icone/success.json"
                  className="dash-hero-lottie"
                  style={{ width: 72, height: 72 }}
                  loop
                  fallback={
                    <span className="dash-hero-check">
                      <IconCheckCircle />
                    </span>
                  }
                />
                <p className="dash-hero-status-title">
                  {noTasksAvailable ? 'Plateforme accessible' : 'Journée validée'}
                </p>
                <p className="dash-hero-status-text">
                  {noTasksAvailable ? 'Vous pouvez consulter tous vos espaces.' : 'Belle journée productive !'}
                </p>
              </>
            ) : (
              <>
                <span className="dash-hero-check dash-hero-check--pending">
                  <IconCalendarCheck />
                </span>
                <p className="dash-hero-status-title">Journée non validée</p>
                <Link to="/my-day" className="app-link">
                  Valider ma journée <IconArrowRight />
                </Link>
              </>
            )}
          </div>
          <span className="status-badge status-badge--validated dash-hero-badge">
            <span className="status-dot" />
            Compte actif
          </span>
        </div>

        <div className="side-card">
          <div className="side-card-header">
            <p className="side-card-title">Aujourd'hui</p>
            <Link to="/my-day" className="app-link">
              Voir ma journée <IconArrowRight />
            </Link>
          </div>
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--blue">
                <IconChecklist />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={todoCount} />
                <div className="stat-tile-label">Tâches à faire</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--amber">
                <IconClock />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={inProgressCount} />
                <div className="stat-tile-label">En cours</div>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon stat-tile-icon--purple">
                <IconChat />
              </span>
              <div>
                <AnimatedNumber className="stat-tile-value" value={unreadCount} />
                <div className="stat-tile-label">Messages non lus</div>
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
                <div className="stat-tile-label">Temps travaillé</div>
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
                <div className="stat-tile-label">Temps de connexion</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="workspace-main">
          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Tâches urgentes</p>
              <Link to="/tasks" className="app-link">
                Voir toutes les tâches <IconArrowRight />
              </Link>
            </div>
            {urgentTasks.length === 0 && <div className="empty-state">Aucune tâche urgente pour le moment.</div>}
            {urgentTasks.length > 0 && (
              <div className="task-table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>Tâche</th>
                      <th>Projet / Contexte</th>
                      <th>Échéance</th>
                      <th>Statut</th>
                      <th>Priorité</th>
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
                          <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
                        </td>
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
        </div>

        <div className="workspace-side">
          <div className="side-card">
            <div className="side-card-header">
              <p className="side-card-title">Accès rapides</p>
            </div>
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
          </div>
        </div>
      </div>

      <div className="side-card">
        <div className="side-card-header">
          <p className="side-card-title">Activité récente</p>
        </div>
        {activity.length === 0 && <div className="empty-state">Aucune activité récente.</div>}
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
    </EmployeeLayout>
  );
}

export default Dashboard;
