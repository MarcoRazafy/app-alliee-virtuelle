const { DateTime } = require('luxon');
const env = require('../config/env');

// --- Journée de TRAVAIL (et non journée calendaire) --------------------------------------
//
// Des employés travaillent la nuit et peuvent terminer à 1 h du matin. Découper la journée à
// minuit coupait leur poste en deux : « Ma journée » se vidait sous leurs yeux, leurs heures
// basculaient sur le lendemain et leur présence disparaissait de la journée en cours.
// La journée de travail va donc de CUTOFF:00 à CUTOFF:00 le lendemain (2 h par défaut) :
// tout instant avant la coupure appartient à la journée COMMENCÉE la veille.
//
// Tout calcul de « jour » doit passer par ce fichier. Avant, deux frontières coexistaient
// sans que rien ne le signale : Node calculait le jour en UTC (`toISOString()`, soit 3 h du
// matin à Antananarivo) tandis que PostgreSQL utilisait `CURRENT_DATE`, c'est-à-dire le
// fuseau de sa session — qui n'est pas le même en local et sur Railway. Les deux pouvaient
// donc désigner deux jours différents pour un même instant.

const TIMEZONE = env.planningTimezone;
const CUTOFF_HOUR = env.businessDayCutoffHour;

// Ces deux valeurs sont interpolées dans du SQL (voir plus bas). Elles viennent de la
// configuration du serveur, jamais d'une requête, mais on les valide quand même : une
// configuration douteuse doit faire échouer le démarrage, pas produire du SQL inattendu.
if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(TIMEZONE)) {
  throw new Error(`PLANNING_TIMEZONE invalide : ${TIMEZONE}`);
}
if (!Number.isInteger(CUTOFF_HOUR) || CUTOFF_HOUR < 0 || CUTOFF_HOUR > 12) {
  throw new Error(`BUSINESS_DAY_CUTOFF_HOUR invalide : ${CUTOFF_HOUR}`);
}
if (!DateTime.now().setZone(TIMEZONE).isValid) {
  throw new Error(`PLANNING_TIMEZONE inconnu de luxon : ${TIMEZONE}`);
}

const DATE_FORMAT = 'yyyy-MM-dd';

// Journée de travail d'un instant donné, en 'YYYY-MM-DD'. Reculer de la durée de la coupure
// avant de ne garder que la date suffit : 01:00 mardi → 23:00 lundi → lundi.
function businessDayOf(value = new Date()) {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: TIMEZONE })
      : DateTime.fromISO(String(value), { zone: TIMEZONE });
  if (!dt.isValid) return null;
  return dt.minus({ hours: CUTOFF_HOUR }).toFormat(DATE_FORMAT);
}

// Journée de travail en cours.
function businessDayNow() {
  return businessDayOf(new Date());
}

// Journée de travail décalée de `days` (négatif = passé), utile pour les plages de statistiques.
function businessDayShifted(days) {
  return DateTime.fromISO(businessDayNow(), { zone: TIMEZONE })
    .plus({ days })
    .toFormat(DATE_FORMAT);
}

// Instant exact où commence une journée de travail donnée ('YYYY-MM-DD' → DateTime).
function businessDayStart(dateString) {
  return DateTime.fromISO(dateString, { zone: TIMEZONE }).startOf('day').plus({ hours: CUTOFF_HOUR });
}

// --- Équivalents SQL ---------------------------------------------------------------------
// On convertit d'abord la colonne dans le fuseau de l'organisation, pour ne PLUS dépendre du
// fuseau de la session PostgreSQL (différent en local et sur Railway), puis on recule de la
// coupure avant de ne garder que la date.

// Journée de travail d'une colonne TIMESTAMPTZ (remplace `ma_colonne::date`).
function sqlBusinessDay(column) {
  return `(((${column}) AT TIME ZONE '${TIMEZONE}') - interval '${CUTOFF_HOUR} hours')::date`;
}

// Journée de travail en cours (remplace `CURRENT_DATE`).
function sqlToday() {
  return sqlBusinessDay('now()');
}

module.exports = {
  TIMEZONE,
  CUTOFF_HOUR,
  businessDayOf,
  businessDayNow,
  businessDayShifted,
  businessDayStart,
  sqlBusinessDay,
  sqlToday,
};
