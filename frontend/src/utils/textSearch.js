// Recherche textuelle partagée par les filtres de l'application.
//
// Deux règles, tirées des vrais contenus saisis ici :
//  - les accents ne doivent pas gêner : taper « operations » doit trouver « Opérations » ;
//  - chaque mot tapé compte séparément, sans ordre imposé : « contrat relire » doit trouver
//    « Relire le contrat », qu'une simple recherche de sous-chaîne manquerait.

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    // Retire les diacritiques (é → e), pour que la recherche ignore les accents.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// `haystack` peut être une chaîne ou un tableau de morceaux (titre, projet…), qui sont
// alors concaténés : chercher « facturation relire » doit pouvoir croiser le titre ET le
// nom du projet.
export function matchesTerms(haystack, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = normalize(Array.isArray(haystack) ? haystack.filter(Boolean).join(' ') : haystack);
  return terms.every((term) => text.includes(term));
}
