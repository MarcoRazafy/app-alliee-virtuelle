export const STATUS_PILL = {
  DECLAREE: { label: 'Déclarée', className: 'pill--declared' },
  DECLAREE: { label: 'Déclarée', className: 'pill--declared' },
  VALIDEE: { label: 'À faire', className: 'pill--todo' },
  EN_COURS: { label: 'En cours', className: 'pill--progress' },
  // Statut synthétique calculé côté front (EN_COURS sans session de chrono active)
  A_REPRENDRE: { label: 'À reprendre', className: 'pill--paused' },
  TERMINEE: { label: 'Terminée', className: 'pill--done' },
  CONFIRMEE: { label: 'Confirmée', className: 'pill--confirmed' },
};

export function priorityPillClass(priority) {
  return priority === 'URGENT' || priority === 'HAUTE' ? 'pill--progress' : 'pill--todo';
}

export function formatRelativeDeadline(deadline) {
  const date = new Date(deadline);
  const startOfToday = new Date(new Date().toDateString());
  const diffDays = Math.round((date - startOfToday) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Demain';
  if (diffDays === -1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
