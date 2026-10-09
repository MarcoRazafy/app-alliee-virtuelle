export const STATUS_PILL = {
  DECLAREE: { label: 'Non validée', className: 'pill--declared' },
  VALIDEE: { label: 'À faire', className: 'pill--todo' },
  EN_COURS: { label: 'En cours', className: 'pill--progress' },
  A_REPRENDRE: { label: 'À reprendre', className: 'pill--paused' },
  TERMINEE: { label: 'Terminée', className: 'pill--done' },
  CONFIRMEE: { label: 'Confirmée', className: 'pill--confirmed' },
};

export const PRIORITY_LABEL = {
  FAIBLE: 'Faible',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENT: 'Urgent',
};

export function priorityLabel(priority) {
  return PRIORITY_LABEL[priority] || priority;
}

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

export function displayStatusOf(task) {
  if (!task) return null;
  if (task.status === 'EN_COURS' && !task.has_active_session) return 'A_REPRENDRE';
  return task.status;
}

export const FINISHED_STATUSES = ['TERMINEE', 'CONFIRMEE'];

export function isTaskLate(task, todayYMD) {
  if (!task?.deadline) return false;
  if (FINISHED_STATUSES.includes(task.status)) return false;
  return String(task.deadline).slice(0, 10) < todayYMD;
}
