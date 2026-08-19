export const STATUS_PILL = {
  DECLAREE: { label: 'Non validée', className: 'pill--declared' },
  VALIDEE: { label: 'À faire', className: 'pill--todo' },
  EN_COURS: { label: 'En cours', className: 'pill--progress' },
  // Statut synthétique calculé côté front (EN_COURS sans session de chrono active)
  A_REPRENDRE: { label: 'À reprendre', className: 'pill--paused' },
  TERMINEE: { label: 'Terminée', className: 'pill--done' },
  CONFIRMEE: { label: 'Confirmée', className: 'pill--confirmed' },
};

// Libellés français des priorités (les valeurs restent les enums backend FAIBLE/NORMALE/HAUTE/URGENT).
export const PRIORITY_LABEL = {
  FAIBLE: 'Faible',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENT: 'Urgent',
};

export function priorityLabel(priority) {
  return PRIORITY_LABEL[priority] || priority;
}

// Libellés français des statuts de compte (valeurs enum backend en français).
export const USER_STATUS_LABEL = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
  EN_ATTENTE: 'En attente',
  REJETE: 'Refusé',
};

export function userStatusLabel(status) {
  return USER_STATUS_LABEL[status] || status;
}

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
