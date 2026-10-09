import api from './api';

export function getEmails({ limit = 30, offset = 0 } = {}) {
  return api.get('/api/emails', { params: { limit, offset } }).then((res) => res.data);
}

export function getEmail(id) {
  return api.get(`/api/emails/${id}`).then((res) => res.data);
}

export function getUnreadCount() {
  return api.get('/api/emails/unread-count').then((res) => res.data);
}

export function markRead(id, isRead = true) {
  return api.patch(`/api/emails/${id}/read`, { is_read: isRead }).then((res) => res.data);
}

export function refreshInbox() {
  return api.post('/api/emails/refresh').then((res) => res.data);
}

export function replyEmail(id, body) {
  return api.post(`/api/emails/${id}/reply`, { body }).then((res) => res.data);
}
