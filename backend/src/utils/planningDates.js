const { DateTime } = require('luxon');
const env = require('../config/env');

// Toute la logique de date du planning hebdomadaire doit passer par ce fichier et
// utiliser PLANNING_TIMEZONE (fuseau organisationnel), jamais le fuseau du serveur/navigateur.
const PLANNING_TIMEZONE = env.planningTimezone;

const DATE_FORMAT = 'yyyy-MM-dd';

// Statuts techniques (voir migrations/005_weekly_planning.sql)
const PLANNING_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  LOCKED: 'LOCKED',
  ADMIN_MODIFIED: 'ADMIN_MODIFIED',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
};

const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  PARTIALLY_AVAILABLE: 'PARTIALLY_AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  LEAVE: 'LEAVE',
  SICK: 'SICK',
};

// LEAVE et SICK sont réservés aux administrateurs (règle métier §4)
const EMPLOYEE_AVAILABILITY_STATUSES = [
  AVAILABILITY_STATUS.AVAILABLE,
  AVAILABILITY_STATUS.PARTIALLY_AVAILABLE,
  AVAILABILITY_STATUS.UNAVAILABLE,
];

function nowInPlanningZone() {
  return DateTime.now().setZone(PLANNING_TIMEZONE);
}

// Luxon expose .weekday en ISO (1 = lundi ... 7 = dimanche) quel que soit le locale,
// contrairement à .startOf('week') qui dépend du locale : on calcule le lundi à la main.
function getWeekStart(dateTime) {
  return dateTime.minus({ days: dateTime.weekday - 1 }).startOf('day');
}

function getCurrentWeekStart(referenceDateTime = nowInPlanningZone()) {
  return getWeekStart(referenceDateTime);
}

function getNextWeekStart(referenceDateTime = nowInPlanningZone()) {
  return getCurrentWeekStart(referenceDateTime).plus({ days: 7 });
}

function getWeekEnd(weekStartDateTime) {
  return weekStartDateTime.plus({ days: 6 }).startOf('day');
}

// Fenêtre employé : samedi 00h00 -> dimanche 23h59:59.999, dans PLANNING_TIMEZONE.
// Samedi = ISO weekday 6, dimanche = ISO weekday 7.
function isEmployeeWindowOpen(referenceDateTime = nowInPlanningZone()) {
  if (env.planningForceEditWindow) return true; // bascule de test, voir config/env.js
  return referenceDateTime.weekday === 6 || referenceDateTime.weekday === 7;
}

// Bornes de la fenêtre de saisie (le week-end qui précède la semaine "referenceDateTime + 7j" à préparer).
function getEditingWindowBounds(referenceDateTime = nowInPlanningZone()) {
  const weekStart = getCurrentWeekStart(referenceDateTime);
  const opensAt = weekStart.plus({ days: 5 }).startOf('day'); // samedi 00:00
  const closesAt = weekStart.plus({ days: 6 }).endOf('day'); // dimanche 23:59:59.999
  return { opensAt, closesAt };
}

function formatDate(dateTime) {
  return dateTime.toFormat(DATE_FORMAT);
}

// Parse une date 'YYYY-MM-DD' comme un début de journée dans PLANNING_TIMEZONE,
// sans jamais dépendre du fuseau du serveur (new Date(str) utiliserait le fuseau local).
function parsePlanningDate(dateString) {
  return DateTime.fromISO(dateString, { zone: PLANNING_TIMEZONE }).startOf('day');
}

function isDateInWeek(dateString, weekStartDateString) {
  const date = parsePlanningDate(dateString);
  const weekStart = parsePlanningDate(weekStartDateString);
  const weekEnd = weekStart.plus({ days: 6 });
  return date >= weekStart && date <= weekEnd;
}

// Un employé prépare normalement la semaine suivante, uniquement pendant la fenêtre samedi/dimanche.
// Exception "rattrapage" : la semaine EN COURS reste modifiable si l'employé n'a JAMAIS créé de
// planning pour la semaine prochaine ET que sa semaine en cours n'est pas encore soumise
// (nouveau compte arrivé en milieu de semaine, ou oubli de soumettre pendant la fenêtre).
// Les deux drapeaux viennent de la base (fournis par l'appelant) ; par défaut (undefined),
// seule la règle normale s'applique — donc aucun changement pour les appelants existants.
function canEmployeeEditWeek(weekStartDateString, referenceDateTime = nowInPlanningZone(), options = {}) {
  const nextWeekStart = formatDate(getNextWeekStart(referenceDateTime));
  if (weekStartDateString === nextWeekStart && isEmployeeWindowOpen(referenceDateTime)) return true;

  const currentWeekStart = formatDate(getCurrentWeekStart(referenceDateTime));
  if (
    weekStartDateString === currentWeekStart &&
    options.hasNextWeekPlanning === false &&
    options.currentWeekSubmitted === false
  ) {
    return true;
  }
  return false;
}

// La sécurité ne doit jamais dépendre uniquement du statut stocké en base : ce calcul
// est fait à chaque lecture/écriture pour refléter la fermeture effective de la fenêtre,
// même si aucun job planifié n'a encore mis à jour la colonne status.
function computeEffectiveStatus({ status, weekStartDateString, referenceDateTime = nowInPlanningZone() }) {
  const weekStart = parsePlanningDate(weekStartDateString);
  const now = referenceDateTime.startOf('day');
  // La fenêtre de saisie de "weekStart" se termine dimanche 23:59, juste avant que
  // la semaine ne commence (lundi 00:00) : donc "fermée" <=> on a atteint/dépassé le lundi.
  const windowClosedForWeek = now >= weekStart;

  if (!status) {
    return windowClosedForWeek ? PLANNING_STATUS.NOT_SUBMITTED : PLANNING_STATUS.DRAFT;
  }

  if (status === PLANNING_STATUS.ADMIN_MODIFIED) {
    return PLANNING_STATUS.ADMIN_MODIFIED;
  }

  if (windowClosedForWeek) {
    if (status === PLANNING_STATUS.SUBMITTED) return PLANNING_STATUS.LOCKED;
    return PLANNING_STATUS.NOT_SUBMITTED;
  }

  return status;
}

// Formate une date 'YYYY-MM-DD' en français pour les messages d'erreur ("lundi 20 juillet").
function formatFrenchDayDate(dateString) {
  return parsePlanningDate(dateString).setLocale('fr').toFormat('cccc d MMMM');
}

// Les 7 dates (lundi -> dimanche) de la semaine commençant à weekStartDateString.
function getWeekDates(weekStartDateString) {
  const weekStart = parsePlanningDate(weekStartDateString);
  return Array.from({ length: 7 }, (_, i) => formatDate(weekStart.plus({ days: i })));
}

// Les colonnes DATE remontent de `pg` sous forme d'objets Date construits avec les
// getters/setters LOCAUX (new Date(year, month, day)), pas UTC. Il faut donc relire les
// composantes avec les getters locaux — surtout pas toISOString(), qui convertit en UTC
// et peut faire glisser la date d'un jour selon le fuseau du serveur (piège classique).
function formatDbDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Découpe un intervalle [startIso, endIso[ (deux timestamps ISO, ex: login_at/logout_at
// d'une session de connexion) en segments par jour calendaire dans PLANNING_TIMEZONE.
// Utilisé pour superposer les périodes de connexion réelle sur la grille de planning,
// qui raisonne en journées locales. Un segment qui va jusqu'à minuit exact se termine à
// "24:00" (et non "00:00" du jour suivant) pour rester positionnable sur une grille 0-24h.
function splitRangeIntoDaySegments(startIso, endIso) {
  const start = DateTime.fromISO(startIso, { zone: PLANNING_TIMEZONE });
  const end = DateTime.fromISO(endIso, { zone: PLANNING_TIMEZONE });
  const segments = [];
  let cursor = start;

  while (cursor < end) {
    const nextMidnight = cursor.plus({ days: 1 }).startOf('day');
    const segmentEnd = end < nextMidnight ? end : nextMidnight;
    const endLabel = segmentEnd.equals(nextMidnight) ? '24:00' : segmentEnd.toFormat('HH:mm');
    segments.push({ date: formatDate(cursor), start_time: cursor.toFormat('HH:mm'), end_time: endLabel });
    cursor = segmentEnd;
  }

  return segments;
}

module.exports = {
  PLANNING_TIMEZONE,
  PLANNING_STATUS,
  AVAILABILITY_STATUS,
  EMPLOYEE_AVAILABILITY_STATUSES,
  nowInPlanningZone,
  getCurrentWeekStart,
  getNextWeekStart,
  getWeekEnd,
  isEmployeeWindowOpen,
  getEditingWindowBounds,
  formatDate,
  parsePlanningDate,
  isDateInWeek,
  canEmployeeEditWeek,
  computeEffectiveStatus,
  formatFrenchDayDate,
  getWeekDates,
  formatDbDate,
  splitRangeIntoDaySegments,
};
