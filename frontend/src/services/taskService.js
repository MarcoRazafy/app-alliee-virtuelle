import api from './api';

export function getTasks(filters = {}) {
  return api.get('/api/tasks', { params: filters }).then((res) => res.data);
}

export function getTask(id) {
  return api.get(`/api/tasks/${id}`).then((res) => res.data);
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
