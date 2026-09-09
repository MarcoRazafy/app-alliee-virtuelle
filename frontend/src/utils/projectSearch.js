// Recherche dans une liste de projets (« Espace › Dossier › Liste »).
//
// Deux exigences tirées des vrais noms de projets de l'app :
//  - les accents ne doivent pas gêner : taper « operations » doit trouver « Opérations » ;
//  - chaque mot tapé doit compter séparément, sans ordre imposé : « factu clients » doit
//    trouver « Espace Opérations › Clients › Facturation », alors qu'une simple recherche
//    de sous-chaîne échouerait.

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    // Retire les diacritiques (é → e), pour que la recherche ignore les accents.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterProjects(projects, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...(projects || [])];
  return (projects || []).filter((project) => {
    const haystack = normalize(project?.path);
    return terms.every((term) => haystack.includes(term));
  });
}
