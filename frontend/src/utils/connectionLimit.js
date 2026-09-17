// Limite quotidienne de connexion (employés) : textes et calage côté application.
// Le serveur décide seul de la coupure (heartbeat) ; l'application prévient et se recale.

// « 8 h », « 7 h 30 ».
export function formatLimit(seconds) {
  const totalMinutes = Math.round((seconds || 0) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function limitWarningMessage(limit) {
  const minutes = Math.max(1, Math.ceil((limit?.remaining_seconds || 0) / 60));
  return (
    `Vous atteindrez ${formatLimit(limit?.limit_seconds)} de connexion dans ${minutes} min : ` +
    'vous serez alors déconnecté automatiquement. Pensez à enregistrer votre travail.'
  );
}

// Délai avant de redemander au serveur, pour couper à l'instant exact au lieu d'attendre le
// prochain heartbeat — que le navigateur peut espacer à une minute en arrière-plan.
// null : trop loin pour valoir un minuteur dédié, les heartbeats réguliers suffisent.
export const PRECISE_TIMER_WITHIN_SECONDS = 20 * 60;
export function limitCheckDelayMs(limit) {
  if (!limit || limit.remaining_seconds > PRECISE_TIMER_WITHIN_SECONDS) return null;
  // Petite marge : le serveur doit constater la limite atteinte, pas une seconde avant.
  return Math.max(0, limit.remaining_seconds) * 1000 + 1500;
}
