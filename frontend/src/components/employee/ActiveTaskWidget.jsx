import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import { getSocket } from '../../services/socket';
import { formatClock } from '../../utils/formatters';
import { IconClock } from '../icons';
import '../../styles/active-task-widget.css';

export default function ActiveTaskWidget() {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const activeRef = useRef(null);

  function refresh() {
    taskService
      .getActiveTask()
      .then((data) => {
        setActive(data);
        activeRef.current = data;
      })
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 15000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('timelog:changed', refresh);

    const socket = getSocket();
    const onNotif = (payload) => {
      if (!payload?.action || payload.action.includes('TIMELOG')) refresh();
    };
    socket.on('notification:new', onNotif);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('timelog:changed', refresh);
      socket.off('notification:new', onNotif);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return undefined;
    }
    function tick() {
      const startedAt = new Date(active.start_time).getTime();
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <button
      type="button"
      className="active-task-widget"
      onClick={() => navigate(`/tasks/${active.task_id}`)}
      title={`Tâche en cours : ${active.title}`}
    >
      <span className="active-task-widget-pulse" aria-hidden="true" />
      <IconClock />
      <span className="active-task-widget-title">{active.title}</span>
      <span className="active-task-widget-timer">{formatClock(elapsed)}</span>
    </button>
  );
}
