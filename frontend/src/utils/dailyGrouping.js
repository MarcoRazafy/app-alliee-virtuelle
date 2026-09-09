// Regroupement des tâches de « Ma journée » / Daily, partagé par l'espace employé (MyDay)
// et la vue admin (AdminDaily) — les deux affichaient la même liste avec deux copies
// identiques de cette logique.
//
// Deux règles :
//  1. Ce qui est urgent se lit en premier — dans chaque groupe ET entre les groupes.
//  2. L'en-tête donne l'EMPLACEMENT complet (espace › dossier › liste), pas seulement le
//     nom de la liste : deux dossiers peuvent avoir une liste homonyme (« Suivi », « List »),
//     et le seul nom de liste ne dit pas où se trouve la tâche.

// Ordre décroissant d'importance. Une valeur inconnue passe en dernier plutôt que de
// remonter en tête par accident.
const PRIORITY_RANK = { URGENT: 0, HAUTE: 1, NORMALE: 2, FAIBLE: 3 };

export function priorityRank(priority) {
  const rank = PRIORITY_RANK[priority];
  return rank === undefined ? 99 : rank;
}

// « Espace Opérations › Clients › Facturation », en ignorant les niveaux absents.
export function projectPath(task) {
  const parts = [task?.space_name, task?.folder_name, task?.list_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' › ') : 'Sans projet';
}

export function groupByProject(tasks) {
  const map = new Map();
  for (const task of tasks || []) {
    const project = projectPath(task);
    if (!map.has(project)) map.set(project, []);
    map.get(project).push(task);
  }

  return [...map.entries()]
    .map(([project, list]) => ({
      project,
      // À priorité égale, on conserve l'ordre choisi par l'employé : le tri est stable en
      // JavaScript moderne, il suffit donc de ne comparer que la priorité.
      tasks: [...list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    }))
    .sort((a, b) => {
      // Un groupe se classe sur sa tâche la plus urgente : sinon un projet ne contenant que
      // des tâches faibles pourrait passer devant celui qui porte l'urgence du jour.
      const topA = priorityRank(a.tasks[0]?.priority);
      const topB = priorityRank(b.tasks[0]?.priority);
      if (topA !== topB) return topA - topB;
      return a.project.localeCompare(b.project, 'fr');
    });
}
