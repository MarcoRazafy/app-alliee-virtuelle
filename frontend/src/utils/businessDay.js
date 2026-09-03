// Journée de TRAVAIL, qui se termine à 2 h du matin et non à minuit : des employés
// travaillent la nuit et peuvent finir à 1 h. Ce qu'ils font alors appartient à la journée
// COMMENCÉE la veille — sinon leurs heures et leur « Ma journée » se coupent en plein poste.
//
// Cette constante DOIT rester alignée sur BUSINESS_DAY_CUTOFF_HOUR côté serveur
// (backend/src/utils/businessDay.js), qui est l'autorité : c'est lui qui range les données
// par jour. Demander une autre journée que celle qu'il calcule renverrait les chiffres
// d'un jour voisin.
export const DAY_CUTOFF_HOUR = 2;

const MS_PER_HOUR = 3600 * 1000;

// Journée de travail d'un instant, en 'YYYY-MM-DD'. Reculer de la durée de la coupure avant
// de ne garder que la date suffit : 01:00 mardi → 23:00 lundi → lundi.
export function businessDayOf(date = new Date()) {
  const shifted = new Date(date.getTime() - DAY_CUTOFF_HOUR * MS_PER_HOUR);
  if (Number.isNaN(shifted.getTime())) return null;
  // Getters LOCAUX, jamais toISOString() : celui-ci convertit en UTC et fait glisser la
  // date d'un jour dès que le fuseau du navigateur n'est pas UTC (piège classique).
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Journée de travail en cours.
export function businessDayNow() {
  return businessDayOf(new Date());
}

// Journée de travail décalée de `days` (négatif = passé), pour les plages de statistiques.
export function businessDayShifted(days) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return businessDayOf(base);
}
