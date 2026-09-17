const { DateTime } = require('luxon');
const businessDay = require('./businessDay');

// Limite quotidienne du temps de connexion d'un employé (8 h par défaut).
//
// « Temps de connexion » = exactement le chiffre du tableau de temps de connexion des admins :
// les sessions de la journée de TRAVAIL (qui se termine à 2 h, voir businessDay), réparties
// sur les journées qu'elles traversent. Une session de 22 h à 3 h compte donc pour partie sur
// deux journées, et la limite ne peut pas diverger de ce que l'admin lit.

// Avertir l'employé avant la coupure, pour qu'il enregistre ce qu'il est en train de faire.
const WARNING_BEFORE_SECONDS = 10 * 60;

// Secondes de connexion tombant dans la journée de travail `day` ('YYYY-MM-DD').
// `sessions` : lignes de findSessionsOverlappingRange (login_at, effective_logout_at).
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

// « 8 h », « 7 h 30 ».
function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// Instant où l'employé pourra se reconnecter : le début de la journée de travail suivante.
function reconnectAt(day) {
  return businessDay.businessDayStart(day).plus({ days: 1 });
}

// Message affiché à la coupure et au refus de connexion. « aujourd'hui » à 1 h du matin : la
// journée de travail commencée la veille n'est pas encore finie, on se reconnecte à 2 h.
function limitReachedMessage({ limitHours, day, now = new Date() }) {
  const at = reconnectAt(day);
  const today = DateTime.fromJSDate(now, { zone: businessDay.TIMEZONE });
  const time = at.minute ? `${at.hour} h ${String(at.minute).padStart(2, '0')}` : `${at.hour} h`;
  let when;
  if (at.hasSame(today, 'day')) when = `aujourd'hui à ${time}`;
  else if (at.hasSame(today.plus({ days: 1 }), 'day')) when = `demain à ${time}`;
  else when = `le ${at.setLocale('fr').toFormat('cccc d MMMM')} à ${time}`;
  return `Vous avez atteint ${formatHours(limitHours)} de connexion aujourd'hui. Vous pourrez vous reconnecter ${when}.`;
}

module.exports = {
  WARNING_BEFORE_SECONDS,
  connectedSecondsForDay,
  limitStatus,
  formatHours,
  reconnectAt,
  limitReachedMessage,
};
