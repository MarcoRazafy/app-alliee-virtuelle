// Glisser-déposer sur une liste FILTRÉE par une recherche.
//
// Le composant de glisser-déposer ne connaît que ce qu'on lui affiche : si une recherche
// masque des tâches, il rend une liste amputée. L'appliquer telle quelle supprimerait les
// tâches masquées. Cette fonction recompose la liste complète à partir de la liste filtrée
// renvoyée : les tâches masquées gardent leur place, les visibles suivent le nouvel ordre.

// `full` : liste complète avant le geste ; `filteredNew` : liste filtrée après le geste ;
// `matches` : prédicat de la recherche (une tâche masquée rend false).
export function mergeFilteredMove(full, filteredNew, matches) {
  const newIds = new Set(filteredNew.map((item) => item.id));
  const fullIds = new Set(full.map((item) => item.id));

  // Ce qui reste : les masquées (jamais touchées) et les visibles encore présentes.
  const kept = full.filter((item) => !matches(item) || newIds.has(item.id));
  // Les visibles, dans leur NOUVEL ordre, limitées à celles déjà connues de la liste.
  const reordered = filteredNew.filter((item) => fullIds.has(item.id));

  let next = 0;
  const result = kept.map((item) => (matches(item) ? reordered[next++] || item : item));
  // Tâches arrivées de l'autre colonne : ajoutées à la fin, comme un double-clic.
  const arrivals = filteredNew.filter((item) => !fullIds.has(item.id));
  return [...result, ...arrivals];
}
