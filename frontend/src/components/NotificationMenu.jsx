import { useEffect, useRef, useState } from 'react';
import * as notificationService from '../services/notificationService';
import { getSocket } from '../services/socket';
import { getUser } from '../services/auth';
import { formatRelativeTime } from '../utils/formatters';
import {
  IconBell,
  IconCalendarWeek,
  IconCheckCircle,
  IconClock,
  IconFolder,
  IconTrash,
  IconUser,
  IconUsers,
  IconWorkspace,
} from './icons';
import '../styles/notifications.css';

const ACTION_LABELS = {
  CREATE_TASK: 'created a task',
  START_TIMELOG: 'started a timer',
  STOP_TIMELOG: 'stopped a timer',
  AUTO_STOP_TIMELOG: 'automatically stopped a timer',
  AUTO_STOP_TIMELOG_LOGOUT: 'stopped a timer on logout',
  AUTO_STOP_TIMELOG_DISCONNECT: 'stopped a timer after a disconnection',
  COMPLETE_TASK: 'completed a task',
  CONFIRM_TASK: 'confirmed a task',
  REJECT_TASK: 'sent a task back',
  VALIDATE_MY_DAY: 'validated their day',
  REQUEST_EXTRA_TASK: 'requested an extra task',
  APPROVE_EXTRA_TASK: 'approved a task request',
  REJECT_EXTRA_TASK: 'rejected a task request',
  DELETE_TASK_ATTACHMENT: 'deleted an attachment',
  APPROVE_USER: 'approved an account',
  REJECT_USER: 'rejected an account',
  SUSPEND_USER: 'suspended an account',
  ACTIVATE_USER: 'reactivated an account',
  PROMOTE_USER: 'appointed an administrator',
  CREATE_SPACE: 'created a client space',
  UPDATE_SPACE: 'updated a client space',
  DELETE_SPACE: 'deleted a client space',
  CREATE_FOLDER: 'created a project',
  UPDATE_FOLDER: 'updated a project',
  DELETE_FOLDER: 'deleted a project',
  CREATE_LIST: 'created a list',
  UPDATE_LIST: 'renamed a list',
  DELETE_PROJECT: 'deleted a list',
  CREATE_RESOURCE_FOLDER: 'created a resource folder',
  RENAME_RESOURCE_FOLDER: 'renamed a resource folder',
  TRASH_RESOURCE_FOLDER: 'moved a folder to the trash',
  RESTORE_RESOURCE_FOLDER: 'restored a folder',
  PERMANENT_DELETE_RESOURCE_FOLDER: 'permanently deleted a folder',
  UPLOAD_RESOURCE_FILE: 'added a file',
  CREATE_RESOURCE_DOCUMENT: 'created a document',
  TRASH_RESOURCE_FILE: 'moved a file to the trash',
  RESTORE_RESOURCE_FILE: 'restored a file',
  PERMANENT_DELETE_RESOURCE_FILE: 'permanently deleted a file',
  SHARE_FOLDER: 'shared a folder',
  REVOKE_SHARE: 'revoked a share',
  CREATE_WEEKLY_PLANNING: 'created a schedule',
  UPDATE_WEEKLY_PLANNING: 'updated a schedule',
  SUBMIT_WEEKLY_PLANNING: 'submitted a schedule',
  ADMIN_UPDATE_WEEKLY_PLANNING: 'corrected a schedule',
  SET_ATTENDANCE_OVERRIDE: 'corrected an attendance record',
  RESET_ATTENDANCE_OVERRIDE: 'reset automatic attendance calculation',
};

function getEventIcon(item) {
  if (item.action.includes('TIMELOG')) return IconClock;
  if (item.entity_type === 'task') return IconCheckCircle;
  if (item.entity_type === 'weekly_planning' || item.entity_type === 'attendance_override') return IconCalendarWeek;
  if (item.entity_type.startsWith('resources_')) return IconFolder;
  if (item.entity_type === 'user') return IconUsers;
  if (item.entity_type.startsWith('task_')) return IconWorkspace;
  if (item.action.includes('DELETE') || item.action.includes('TRASH')) return IconTrash;
  return IconUser;
}

function eventText(item) {
  const actor = item.actor_name || 'The system';
  const action = ACTION_LABELS[item.action] || 'performed an action';
  const subject = item.entity_name || item.details?.title || item.details?.file_name;
  return {
    title: `${actor} ${action}`,
    subject: subject ? `« ${subject} »` : null,
  };
}

function NotificationMenu() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const rootRef = useRef(null);

  async function load() {
    try {
      const data = await notificationService.getNotifications();
      setItems(data.items || []);
      setUnreadCount(data.unread_count || 0);
      setLoadError(false);
      return data;
    } catch {
      setLoadError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      await load();
    }

    poll();
    // Le polling n'est plus qu'un secours (le temps réel gère l'instantané) → intervalle allongé.
    const interval = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Temps réel : à chaque nouvelle activité (WebSocket), on rafraîchit immédiatement le
  // centre de notifications. On ignore nos propres actions (jamais notifiées à soi-même).
  useEffect(() => {
    const socket = getSocket();
    const me = getUser();
    function onNotification(payload) {
      if (payload?.actorId && me && payload.actorId === me.id) return;
      load();
    }
    socket.on('notification:new', onNotification);
    return () => socket.off('notification:new', onNotification);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  async function openMenu() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) return;

    const data = await load();
    if ((data?.unread_count || unreadCount) > 0) {
      setUnreadCount(0);
      setItems((current) => current.map((item) => ({ ...item, is_unread: false })));
      notificationService.markAllNotificationsRead().catch(() => load());
    }
  }

  return (
    <div className="notification-menu" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn${open ? ' icon-btn--active' : ''}`}
        onClick={openMenu}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
      >
        <IconBell />
        {unreadCount > 0 && <span className="icon-btn-badge">{Math.min(unreadCount, 99)}</span>}
      </button>

      {open && (
        <section className="notification-panel" role="dialog" aria-label="Centre de notifications">
          <header className="notification-panel-header">
            <div>
              <h2>Notifications</h2>
              <p>Workspace activity, excluding messaging</p>
            </div>
            <span className="notification-read-status">All read</span>
          </header>

          <div className="notification-list" aria-live="polite">
            {loading && <p className="notification-empty">Loading…</p>}
            {!loading && loadError && (
              <button type="button" className="notification-retry" onClick={load}>
                Unable to load. Retry
              </button>
            )}
            {!loading && !loadError && items.length === 0 && (
              <div className="notification-empty">
                <IconBell />
                <strong>No events</strong>
                <span>New activity will appear here.</span>
              </div>
            )}
            {!loading &&
              !loadError &&
              items.map((item) => {
                const EventIcon = getEventIcon(item);
                const text = eventText(item);
                return (
                  <article
                    key={item.id}
                    className={`notification-item${item.is_unread ? ' notification-item--unread' : ''}`}
                  >
                    <span className="notification-item-icon">
                      <EventIcon />
                    </span>
                    <div className="notification-item-copy">
                      <strong>{text.title}</strong>
                      {text.subject && <span>{text.subject}</span>}
                      <time dateTime={item.timestamp}>{formatRelativeTime(item.timestamp)}</time>
                    </div>
                    {item.is_unread && <span className="notification-unread-dot" aria-label="Non lue" />}
                  </article>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationMenu;
