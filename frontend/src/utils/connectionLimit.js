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
    'vous serez alors déconnecté automatiquement, puis pourrez vous reconnecter. ' +
    'Pensez à enregistrer votre travail.'
  );
}

export const PRECISE_TIMER_WITHIN_SECONDS = 20 * 60;
export function limitCheckDelayMs(limit) {
  if (!limit || limit.remaining_seconds > PRECISE_TIMER_WITHIN_SECONDS) return null;
  return Math.max(0, limit.remaining_seconds) * 1000 + 1500;
}
