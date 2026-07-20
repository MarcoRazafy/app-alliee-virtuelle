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

export function createTask(payload) {
  return api.post('/api/tasks', payload).then((res) => res.data);
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

export function startTimelog(taskId) {
  return api.post(`/api/timelog/${taskId}/start`).then((res) => res.data);
}

export function stopTimelog(taskId) {
  return api.post(`/api/timelog/${taskId}/stop`).then((res) => res.data);
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

export function getComments(taskId) {
  return api.get(`/api/tasks/${taskId}/comments`).then((res) => res.data);
}

export function createComment(taskId, content, type = 'COMMENT') {
  return api.post(`/api/tasks/${taskId}/comments`, { content, type }).then((res) => res.data);
}

export function getAttachments(taskId) {
  return api.get(`/api/tasks/${taskId}/attachments`).then((res) => res.data);
}

export function uploadAttachment(taskId, file) {
  const formData = new FormData();
  formData.append('file', file);
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
