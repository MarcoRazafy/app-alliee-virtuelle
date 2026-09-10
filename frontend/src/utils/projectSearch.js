// Extension explicite : ce module est couvert par des tests exécutés directement par Node
// (node:test), qui ne résout pas les imports sans extension comme le fait Vite.
import { matchesTerms } from './textSearch.js';

// Recherche dans une liste de projets (« Espace › Dossier › Liste »).
//
// Deux exigences tirées des vrais noms de projets de l'app :
//  - les accents ne doivent pas gêner : taper « operations » doit trouver « Opérations » ;
//  - chaque mot tapé doit compter séparément, sans ordre imposé : « factu clients » doit
//    trouver « Espace Opérations › Clients › Facturation », alors qu'une simple recherche
//    de sous-chaîne échouerait.

// La normalisation et la règle « chaque mot compte » vivent dans utils/textSearch : elles
// servent aussi à la recherche de tâches, et deux copies finiraient par diverger.
export { normalize } from './textSearch.js';

export function filterProjects(projects, query) {
  return (projects || []).filter((project) => matchesTerms(project?.path, query));
}
