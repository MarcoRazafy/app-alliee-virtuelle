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
  CREATE_TASK: 'a créé une tâche',
  START_TIMELOG: 'a démarré un chrono',
  STOP_TIMELOG: 'a arrêté un chrono',
  AUTO_STOP_TIMELOG: 'a arrêté automatiquement un chrono',
  AUTO_STOP_TIMELOG_LOGOUT: 'a arrêté un chrono en se déconnectant',
  AUTO_STOP_TIMELOG_DISCONNECT: 'a arrêté un chrono après une déconnexion',
  COMPLETE_TASK: 'a terminé une tâche',
  CONFIRM_TASK: 'a confirmé une tâche',
  REJECT_TASK: 'a renvoyé une tâche en cours',
  VALIDATE_MY_DAY: 'a validé sa journée',
  REQUEST_EXTRA_TASK: 'a demandé une tâche supplémentaire',
  APPROVE_EXTRA_TASK: 'a approuvé une demande de tâche',
  REJECT_EXTRA_TASK: 'a refusé une demande de tâche',
  DELETE_TASK_ATTACHMENT: 'a supprimé une pièce jointe',
  APPROVE_USER: 'a approuvé un compte',
  REJECT_USER: 'a refusé un compte',
  SUSPEND_USER: 'a suspendu un compte',
  ACTIVATE_USER: 'a réactivé un compte',
  PROMOTE_USER: 'a nommé un administrateur',
  CREATE_SPACE: 'a créé un espace client',
  UPDATE_SPACE: 'a modifié un espace client',
  DELETE_SPACE: 'a supprimé un espace client',
  CREATE_FOLDER: 'a créé un projet',
  UPDATE_FOLDER: 'a modifié un projet',
  DELETE_FOLDER: 'a supprimé un projet',
  CREATE_LIST: 'a créé une liste',
  UPDATE_LIST: 'a renommé une liste',
  DELETE_PROJECT: 'a supprimé une liste',
  CREATE_RESOURCE_FOLDER: 'a créé un dossier de ressources',
  RENAME_RESOURCE_FOLDER: 'a renommé un dossier de ressources',
  TRASH_RESOURCE_FOLDER: 'a placé un dossier dans la corbeille',
  RESTORE_RESOURCE_FOLDER: 'a restauré un dossier',
  PERMANENT_DELETE_RESOURCE_FOLDER: 'a supprimé définitivement un dossier',
  UPLOAD_RESOURCE_FILE: 'a ajouté un fichier',
  CREATE_RESOURCE_DOCUMENT: 'a créé un document',
  TRASH_RESOURCE_FILE: 'a placé un fichier dans la corbeille',
  RESTORE_RESOURCE_FILE: 'a restauré un fichier',
  PERMANENT_DELETE_RESOURCE_FILE: 'a supprimé définitivement un fichier',
  SHARE_FOLDER: 'a partagé un dossier',
  REVOKE_SHARE: 'a retiré un partage',
  CREATE_WEEKLY_PLANNING: 'a créé un planning',
  UPDATE_WEEKLY_PLANNING: 'a modifié un planning',
  SUBMIT_WEEKLY_PLANNING: 'a soumis un planning',
  ADMIN_UPDATE_WEEKLY_PLANNING: 'a corrigé un planning',
  SET_ATTENDANCE_OVERRIDE: 'a corrigé une présence',
  RESET_ATTENDANCE_OVERRIDE: 'a rétabli le calcul automatique de présence',
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
  const actor = item.actor_name || 'Le système';
  const action = ACTION_LABELS[item.action] || 'a effectué une action';
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
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
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
              <p>Activité de l’espace, hors messagerie</p>
            </div>
            <span className="notification-read-status">Tout est lu</span>
          </header>

          <div className="notification-list" aria-live="polite">
            {loading && <p className="notification-empty">Chargement…</p>}
            {!loading && loadError && (
              <button type="button" className="notification-retry" onClick={load}>
                Impossible de charger. Réessayer
              </button>
            )}
            {!loading && !loadError && items.length === 0 && (
              <div className="notification-empty">
                <IconBell />
                <strong>Aucun événement</strong>
                <span>Les nouvelles activités apparaîtront ici.</span>
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
