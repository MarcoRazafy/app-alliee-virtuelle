const businessDay = require('./businessDay');

const WARNING_BEFORE_SECONDS = 10 * 60;

function connectedSecondsForDay(sessions, day) {
  return (sessions || []).reduce((sum, session) => {
    const buckets = businessDay.splitSecondsByBusinessDay(session.login_at, session.effective_logout_at);
    return sum + (buckets[day] || 0);
  }, 0);
}

function limitStatus(connectedSeconds, limitSeconds) {
  const remaining = Math.max(0, limitSeconds - connectedSeconds);
  return {
    limit_seconds: limitSeconds,
    connected_seconds: connectedSeconds,
    remaining_seconds: remaining,
    reached: connectedSeconds >= limitSeconds,
    warn: remaining <= WARNING_BEFORE_SECONDS,
  };
}

function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function limitReachedMessage({ limitHours }) {
  return `Vous avez atteint ${formatHours(limitHours)} de connexion aujourd'hui. Vous pouvez vous reconnecter pour continuer.`;
}

module.exports = {
  WARNING_BEFORE_SECONDS,
  connectedSecondsForDay,
  limitStatus,
  formatHours,
  limitReachedMessage,
};
