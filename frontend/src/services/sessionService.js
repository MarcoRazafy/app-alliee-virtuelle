import api, { apiBaseUrl } from './api';
import { getToken } from './auth';

export function getMySessionsForWeek(weekStartDate) {
  return api.get('/api/sessions/week', { params: { week_start_date: weekStartDate } }).then((res) => res.data);
}

export function getUserSessionsForWeek(userId, weekStartDate) {
  return api
    .get('/api/sessions/admin/week', { params: { user_id: userId, week_start_date: weekStartDate } })
    .then((res) => res.data);
}

export function getMyCurrentSession() {
  return api.get('/api/sessions/current').then((res) => res.data);
}

export function heartbeatSession() {
  return api.post('/api/sessions/heartbeat').then((res) => res.data);
}

export function signalSessionDisconnect() {
  const token = getToken();
  if (!token) return;
  fetch(`${apiBaseUrl}/api/sessions/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
}

export function getUserSessionsAdmin(userId, range) {
  return api
    .get('/api/sessions/admin/list', { params: { user_id: userId, start: range.start, end: range.end } })
    .then((res) => res.data);
}

export function updateUserSessionAdmin(sessionId, payload) {
  return api.patch(`/api/sessions/admin/${sessionId}`, payload).then((res) => res.data);
}

export function deleteUserSessionAdmin(sessionId) {
  return api.delete(`/api/sessions/admin/${sessionId}`).then((res) => res.data);
}
