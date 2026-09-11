const { sqlToday } = require('./businessDay');

// Définition unique du « retard », côté serveur.
//
// Une tâche TERMINÉE ou CONFIRMÉE n'est JAMAIS en retard : le travail est fait, même s'il
// l'a été après l'échéance. Seul ce qui reste à faire peut l'être. Auparavant, seule
// CONFIRMEE était exclue — les tâches terminées mais pas encore confirmées par un admin
// gonflaient donc la liste des retards alors qu'elles n'appelaient plus rien de l'employé.
//
// L'expression vivait, recopiée, dans quatre requêtes. Elle est ici pour qu'il n'y ait plus
// qu'un endroit à changer le jour où la règle évolue.

const FINISHED_STATUSES = ['TERMINEE', 'CONFIRMEE'];

const TODAY = sqlToday();

// `prefix` : alias de la table dans la requête appelante (« t » → « t.deadline »).
function sqlIsLate(prefix = '') {
  const p = prefix ? `${prefix}.` : '';
  const finished = FINISHED_STATUSES.map((s) => `'${s}'`).join(', ');
  return `${p}deadline < ${TODAY} AND ${p}status NOT IN (${finished})`;
}

module.exports = { FINISHED_STATUSES, sqlIsLate };
