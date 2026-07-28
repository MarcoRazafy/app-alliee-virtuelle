import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as messageService from '../services/messageService';
import { notifyInfo } from '../utils/toast';
import { IconChat, IconSparkle } from './icons';
import NotificationMenu from './NotificationMenu';

function TopbarTools({ messagingPath, assistantPath, locked = false }) {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const previousUnreadRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function pollUnread() {
      try {
        const [conversations, groups] = await Promise.all([
          messageService.getConversations(),
          messageService.getMessageGroups(),
        ]);
        if (cancelled) return;

        const privateUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0);
        const groupUnread = groups.reduce((sum, group) => sum + (group.unread_count || 0), 0);
        setUnreadMessages(privateUnread + groupUnread);

        const previous = previousUnreadRef.current;
        if (previous && !location.pathname.startsWith(messagingPath)) {
          conversations.forEach((conversation) => {
            const before = previous.get(conversation.other_user_id) || 0;
            if ((conversation.unread_count || 0) > before) {
              notifyInfo(`Nouveau message de ${conversation.other_user_name}`);
            }
          });
        }
        previousUnreadRef.current = new Map(
          conversations.map((conversation) => [conversation.other_user_id, conversation.unread_count || 0])
        );
      } catch {
        if (!cancelled) setUnreadMessages(0);
      }
    }

    pollUnread();
    const interval = window.setInterval(pollUnread, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [location.pathname, messagingPath]);

  return (
    <div className="topbar-tools" aria-label="Communication et notifications">
      {locked ? (
        <span className="icon-btn icon-btn--disabled" aria-label="Messaging locked" title="Messaging locked">
          <IconChat />
        </span>
      ) : (
        <Link to={messagingPath} className="icon-btn" aria-label="Messagerie" title="Messagerie">
          <IconChat />
          {unreadMessages > 0 && <span className="icon-btn-badge">{Math.min(unreadMessages, 99)}</span>}
        </Link>
      )}

      <NotificationMenu />

      {locked ? (
        <span className="icon-btn icon-btn--disabled" aria-label="Chatbot locked" title="Chatbot locked">
          <IconSparkle />
        </span>
      ) : (
        <Link to={assistantPath} className="icon-btn" aria-label="Chatbot" title="Chatbot">
          <IconSparkle />
        </Link>
      )}
    </div>
  );
}

export default TopbarTools;
