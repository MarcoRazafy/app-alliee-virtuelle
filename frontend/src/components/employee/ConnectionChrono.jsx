import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as sessionService from '../../services/sessionService';
import { getSocket } from '../../services/socket';
import { formatClock } from '../../utils/formatters';
import { IconClock } from '../icons';
import '../../styles/connection-chrono.css';

const POS_STORAGE_KEY = 'connection-chrono-pos';

function clampPos(x, y, w, h) {
  const margin = 8;
  const maxX = window.innerWidth - w - margin;
  const maxY = window.innerHeight - h - margin;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
    y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
  };
}

function ConnectionChrono({ className = '' }) {
  const [loginAt, setLoginAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(POS_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
      }
    } catch {
    }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef(null);
  const dragRef = useRef(null);
  const gotRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function fetchSession() {
      if (gotRef.current) return;
      sessionService
        .getMyCurrentSession()
        .then((data) => {
          if (!cancelled && data.login_at) {
            gotRef.current = true;
            setLoginAt(new Date(data.login_at).getTime());
          }
        })
        .catch(() => {});
    }

    fetchSession();
    const socket = getSocket();
    socket.on('connect', fetchSession);
    window.addEventListener('focus', fetchSession);
    return () => {
      cancelled = true;
      socket.off('connect', fetchSession);
      window.removeEventListener('focus', fetchSession);
    };
  }, []);

  useEffect(() => {
    if (!loginAt) return undefined;

    function tick() {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - loginAt) / 1000)));
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [loginAt]);

  useLayoutEffect(() => {
    if (!loginAt || !pos || !nodeRef.current) return;
    const r = nodeRef.current.getBoundingClientRect();
    const next = clampPos(pos.x, pos.y, r.width, r.height);
    if (next.x !== pos.x || next.y !== pos.y) {
      setPos(next);
      try {
        localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(next));
      } catch {
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginAt]);

  useEffect(() => {
    function onResize() {
      setPos((prev) => {
        if (!prev || !nodeRef.current) return prev;
        const r = nodeRef.current.getBoundingClientRect();
        return clampPos(prev.x, prev.y, r.width, r.height);
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function onPointerDown(e) {
    if (!nodeRef.current) return;
    const r = nodeRef.current.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      width: r.width,
      height: r.height,
    };
    setDragging(true);
    try {
      nodeRef.current.setPointerCapture(e.pointerId);
    } catch {
    }
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const next = clampPos(e.clientX - d.offsetX, e.clientY - d.offsetY, d.width, d.height);
    setPos(next);
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setPos((prev) => {
      if (prev) {
        try {
          localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(prev));
        } catch {
        }
      }
      return prev;
    });
  }

  if (!loginAt) return null;

  const style = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div
      ref={nodeRef}
      className={`connection-chrono${className ? ` ${className}` : ''}${dragging ? ' connection-chrono--dragging' : ''}`}
      style={style}
      title="Temps de connexion — glissez pour déplacer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="connection-chrono-grip" aria-hidden="true" />
      <span className="connection-chrono-icon">
        <IconClock />
      </span>
      <span className="connection-chrono-value">{formatClock(elapsedSeconds)}</span>
    </div>
  );
}

export default ConnectionChrono;
