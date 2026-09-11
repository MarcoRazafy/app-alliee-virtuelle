// Quels numéros de page afficher quand il y en a trop pour tenir sur une ligne.
//
// La pagination affichait un bouton PAR page : avec 146 tâches à 10 par page, 15 boutons
// côte à côte formaient une barre de 856 px, soit plus du double d'un écran de téléphone.
// On n'en montre plus qu'une fenêtre autour de la page courante, avec les deux extrémités
// toujours visibles — aller à la première ou à la dernière page reste à un clic.
//
// Rend un tableau mêlant des numéros et la chaîne '…' (les trous).

export const GAP = '…';

// `siblings` : nombre de voisines affichées de chaque côté de la page courante.
export function paginationRange(page, totalPages, siblings = 1) {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), total);

  // Première + dernière + courante + ses voisines + les deux trous.
  const maxSlots = 5 + siblings * 2;
  if (total <= maxSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);

  // Un trou ne vaut la peine que s'il cache au moins deux pages : sinon il prendrait
  // la place du numéro qu'il remplace, sans rien faire gagner.
  const gapLeft = left > 2;
  const gapRight = right < total - 1;

  if (!gapLeft && gapRight) {
    const block = 3 + siblings * 2;
    return [...Array.from({ length: block }, (_, i) => i + 1), GAP, total];
  }

  if (gapLeft && !gapRight) {
    const block = 3 + siblings * 2;
    return [1, GAP, ...Array.from({ length: block }, (_, i) => total - block + 1 + i)];
  }

  return [1, GAP, ...Array.from({ length: right - left + 1 }, (_, i) => left + i), GAP, total];
}
