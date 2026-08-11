import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as sessionService from '../../services/sessionService';
import { getSocket } from '../../services/socket';
import { formatClock } from '../../utils/formatters';
import { IconClock } from '../icons';
import '../../styles/connection-chrono.css';

const POS_STORAGE_KEY = 'connection-chrono-pos';

// Garde la pastille visible dans le viewport (avec une petite marge).
function clampPos(x, y, w, h) {
  const margin = 8;
  const maxX = window.innerWidth - w - margin;
  const maxY = window.innerHeight - h - margin;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
    y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
  };
}

// Chrono de connexion (présence) flottant, visible sur toutes les pages employé.
// Indépendant du chrono de tâche : ne fait qu'afficher le temps écoulé depuis la connexion
// (login_at), recalculé localement chaque seconde pour éviter tout polling réseau.
// Déplaçable (souris + tactile) : pratique en mobile pour le dégager de la zone de saisie
// des messages. La position choisie est mémorisée (localStorage).
function ConnectionChrono() {
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
      /* ignore */
    }
    return null; // null = position par défaut (CSS : bas-droite)
  });
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef(null);
  const dragRef = useRef(null); // { offsetX, offsetY, moved }
  const gotRef = useRef(false); // login_at déjà obtenu → on arrête de re-tenter

  // Récupère login_at de la session ouverte (lecture seule via /current : le maintien de la
  // présence est assuré par le heartbeat global de App.jsx). RÉSILIENT : si le 1er appel
  // échoue (course avec la redirection de connexion, socket en veille, coupure réseau), on
  // re-tente à la (re)connexion du socket et au retour sur l'onglet, jusqu'à l'obtenir. Sans
  // ça, un unique échec silencieux laissait le chrono invisible jusqu'au rechargement.
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

  // Au montage (dès que le chrono s'affiche) : ramène dans le viewport une position
  // mémorisée devenue hors-cadre. Sans ça, un viewport plus petit qu'au moment du drag
  // (redimensionnement, rotation mobile, écran différent) laissait le chrono dessiné en
  // dehors de l'écran → il « ne s'affichait plus » alors qu'il était bien monté.
  useLayoutEffect(() => {
    if (!loginAt || !pos || !nodeRef.current) return;
    const r = nodeRef.current.getBoundingClientRect();
    const next = clampPos(pos.x, pos.y, r.width, r.height);
    if (next.x !== pos.x || next.y !== pos.y) {
      setPos(next);
      try {
        localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginAt]);

  // Re-clampe la position si la fenêtre est redimensionnée / passe en mobile.
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
      /* ignore */
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
          /* ignore */
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
      className={`connection-chrono${dragging ? ' connection-chrono--dragging' : ''}`}
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
