import { useEffect, useState } from 'react';
import * as announcementService from '../services/announcementService';
import { getSocket } from '../services/socket';

export default function useAnnouncementUnread() {
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState(null);

  function refresh() {
    return announcementService
      .getUnread()
      .then((data) => {
        setUnread(data.unread_count || 0);
        setLatest(data.latest || null);
        return data;
      })
      .catch(() => null);
  }

  useEffect(() => {
    refresh();
    const socket = getSocket();
    const onNew = () => refresh();
    socket.on('announcement:new', onNew);
    const poll = window.setInterval(refresh, 60000);
    return () => {
      socket.off('announcement:new', onNew);
      window.clearInterval(poll);
    };
  }, []);

  return { unread, latest, refresh, setUnread, setLatest };
}
