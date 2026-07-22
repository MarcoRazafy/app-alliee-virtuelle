import { useEffect, useState } from 'react';
import * as sessionService from '../../services/sessionService';
import { formatClock } from '../../utils/formatters';
import { IconClock } from '../icons';
import '../../styles/connection-chrono.css';

// Chrono de connexion (présence) flottant, visible sur toutes les pages employé.
// Indépendant du chrono de tâche : ne fait qu'afficher le temps écoulé depuis la connexion
// (login_at), recalculé localement chaque seconde pour éviter tout polling réseau.
function ConnectionChrono() {
  const [loginAt, setLoginAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    sessionService
      .heartbeatSession()
      .then((data) => {
        if (!cancelled && data.login_at) setLoginAt(new Date(data.login_at).getTime());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
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

  if (!loginAt) return null;

  return (
    <div className="connection-chrono" title="Temps de connexion depuis votre arrivée">
      <span className="connection-chrono-icon">
        <IconClock />
      </span>
      <span className="connection-chrono-value">{formatClock(elapsedSeconds)}</span>
    </div>
  );
}

export default ConnectionChrono;
