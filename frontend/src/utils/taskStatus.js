export const STATUS_PILL = {
  DECLAREE: { label: 'Declared', className: 'pill--declared' },
  VALIDEE: { label: 'To do', className: 'pill--todo' },
  EN_COURS: { label: 'In progress', className: 'pill--progress' },
  // Statut synthétique calculé côté front (EN_COURS sans session de chrono active)
  A_REPRENDRE: { label: 'To resume', className: 'pill--paused' },
  TERMINEE: { label: 'Completed', className: 'pill--done' },
  CONFIRMEE: { label: 'Confirmed', className: 'pill--confirmed' },
};

// Libellés anglais des priorités (les valeurs restent les enums backend FAIBLE/NORMALE/HAUTE/URGENT).
export const PRIORITY_LABEL = {
  FAIBLE: 'Low',
  NORMALE: 'Normal',
  HAUTE: 'High',
  URGENT: 'Urgent',
};

export function priorityLabel(priority) {
  return PRIORITY_LABEL[priority] || priority;
}

// Libellés anglais des statuts de compte (valeurs enum backend en français).
export const USER_STATUS_LABEL = {
  ACTIF: 'Active',
  SUSPENDU: 'Suspended',
  EN_ATTENTE: 'Pending',
  REJETE: 'Rejected',
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
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}
