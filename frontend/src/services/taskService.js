import api from './api';

export function validateTask(id) {
  return api.post(`/api/tasks/${id}/validate`).then((res) => res.data);
}

export function getTasks(filters = {}) {
  return api.get('/api/tasks', { params: filters }).then((res) => res.data);
}

export function getTask(id) {
  return api.get(`/api/tasks/${id}`).then((res) => res.data);
}

export function getTaskDetail(id) {
  return api.get(`/api/tasks/${id}/detail`).then((res) => res.data);
}

export function getSubtasks(id) {
  return api.get(`/api/tasks/${id}/subtasks`).then((res) => res.data);
}

// Signale aux listes ouvertes qu'une tâche a été créée/supprimée, pour qu'elles se
// rechargent sans que l'utilisateur ait à actualiser la page.
function notifyTasksChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasks:changed'));
}

export function createTask(payload) {
  return api.post('/api/tasks', payload).then((res) => {
    notifyTasksChanged();
    return res.data;
  });
}

export function deleteTask(id) {
  return api.delete(`/api/tasks/${id}`).then((res) => {
    notifyTasksChanged();
    return res.data;
  });
}

// Modifie une tâche (titre, description, priorité, échéance).
export function updateTask(id, payload) {
  return api.patch(`/api/tasks/${id}`, payload).then((res) => res.data);
}

// Change le statut d'une tâche (admin) : VALIDEE / EN_COURS / TERMINEE / CONFIRMEE.
export function updateTaskStatus(id, status) {
  return api.patch(`/api/tasks/${id}/status`, { status }).then((res) => res.data);
}

// Transfère la tâche à une autre personne (change le destinataire).
export function reassignTask(id, assignedTo) {
  return api.post(`/api/tasks/${id}/reassign`, { assigned_to: assignedTo }).then((res) => res.data);
}

// Ajoute une personne à la tâche (assignation multiple partagée).
export function addTaskAssignee(id, assignedTo) {
  return api.post(`/api/tasks/${id}/add-assignee`, { assigned_to: assignedTo }).then((res) => res.data);
}

// Retire une personne de la tâche.
export function removeTaskAssignee(id, userId) {
  return api.delete(`/api/tasks/${id}/assignees/${userId}`).then((res) => res.data);
}

export function confirmTask(id) {
  return api.post(`/api/tasks/${id}/confirm`).then((res) => res.data);
}

export function rejectTask(id, motif) {
  return api.post(`/api/tasks/${id}/reject`, { motif }).then((res) => res.data);
}

export function completeTask(id) {
  return api.post(`/api/tasks/${id}/complete`).then((res) => res.data);
}

// Signale au widget « tâche en cours » qu'un chrono vient de démarrer/s'arrêter,
// pour qu'il se rafraîchisse tout de suite (sans attendre le polling de 15 s).
function notifyTimelogChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('timelog:changed'));
}

export function startTimelog(taskId) {
  return api.post(`/api/timelog/${taskId}/start`).then((res) => {
    notifyTimelogChanged();
    return res.data;
  });
}

export function stopTimelog(taskId) {
  return api.post(`/api/timelog/${taskId}/stop`).then((res) => {
    notifyTimelogChanged();
    return res.data;
  });
}

// Correction d'une session chronométrée (admin) : chrono oublié, doublon.
export function updateTimelogEntry(entryId, payload) {
  return api.patch(`/api/timelog/entry/${entryId}`, payload).then((res) => res.data);
}

export function deleteTimelogEntry(entryId) {
  return api.delete(`/api/timelog/entry/${entryId}`).then((res) => res.data);
}

export function addManualTimelog(taskId, payload) {
  return api.post(`/api/timelog/${taskId}/manual`, payload).then((res) => res.data);
}

export function getActiveTask() {
  return api.get('/api/timelog/active').then((res) => res.data);
}

export function getTimelogHistory(taskId) {
  return api.get(`/api/timelog/${taskId}`).then((res) => res.data);
}

export function getMyDay() {
  return api.get('/api/my-day').then((res) => res.data);
}

export function setMyDay(taskIds) {
  return api.post('/api/my-day', { task_ids: taskIds }).then((res) => res.data);
}

export function validateMyDay() {
  return api.post('/api/my-day/validate').then((res) => res.data);
}

export function getMyActivity() {
  return api.get('/api/my-activity').then((res) => res.data);
}

// --- Demandes de tâche supplémentaire ---

export function createExtraTaskRequest(taskId, message) {
  return api.post('/api/tasks/extra-requests', { task_id: taskId, message }).then((res) => res.data);
}

export function getMyExtraTaskRequests() {
  return api.get('/api/tasks/extra-requests/me').then((res) => res.data);
}

export function getExtraTaskRequests(status) {
  return api.get('/api/tasks/extra-requests', { params: status ? { status } : {} }).then((res) => res.data);
}

export function approveExtraTaskRequest(id) {
  return api.post(`/api/tasks/extra-requests/${id}/approve`).then((res) => res.data);
}

export function rejectExtraTaskRequest(id, note) {
  return api.post(`/api/tasks/extra-requests/${id}/reject`, { note }).then((res) => res.data);
}

export function getComments(taskId) {
  return api.get(`/api/tasks/${taskId}/comments`).then((res) => res.data);
}

export function createComment(taskId, content, type = 'COMMENT') {
  return api.post(`/api/tasks/${taskId}/comments`, { content, type }).then((res) => res.data);
}

export function getAttachments(taskId) {
  return api.get(`/api/tasks/${taskId}/attachments`).then((res) => res.data);
}

// `commentId` (optionnel) rattache le fichier à un commentaire : il s'affiche alors dans la
// bulle du message, en plus de rester listé dans les pièces jointes de la tâche.
export function uploadAttachment(taskId, file, commentId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (commentId) formData.append('comment_id', commentId);
  return api
    .post(`/api/tasks/${taskId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data);
}

export function downloadAttachment(fileId) {
  return api.get(`/api/attachments/${fileId}/download`, { responseType: 'blob' }).then((res) => res.data);
}

export function deleteAttachment(taskId, fileId) {
  return api.delete(`/api/tasks/${taskId}/attachments/${fileId}`).then((res) => res.data);
}

export function getNotes(taskId) {
  return api.get(`/api/tasks/${taskId}/notes`).then((res) => res.data);
}

export function createNote(taskId, content) {
  return api.post(`/api/tasks/${taskId}/notes`, { content }).then((res) => res.data);
}

export function getLateTasks() {
  return api.get('/api/tasks/late').then((res) => res.data);
}
