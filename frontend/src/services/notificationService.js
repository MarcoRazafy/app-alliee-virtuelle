import api from './api';

export function getNotifications(limit = 30) {
  return api.get('/api/notifications', { params: { limit } }).then((res) => res.data);
}

export function markAllNotificationsRead() {
  return api.post('/api/notifications/read').then((res) => res.data);
}
