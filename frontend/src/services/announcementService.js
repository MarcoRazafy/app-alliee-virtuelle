import api from './api';

export function getAnnouncements() {
  return api.get('/api/announcements').then((res) => res.data);
}

export function getUnread() {
  return api.get('/api/announcements/unread').then((res) => res.data);
}

export function getAnnouncement(id) {
  return api.get(`/api/announcements/${id}`).then((res) => res.data);
}

export function createAnnouncement(payload) {
  return api.post('/api/announcements', payload).then((res) => res.data);
}

export function updateAnnouncement(id, payload) {
  return api.put(`/api/announcements/${id}`, payload).then((res) => res.data);
}

export function deleteAnnouncement(id) {
  return api.delete(`/api/announcements/${id}`).then((res) => res.data);
}

export function markAnnouncementRead(id) {
  return api.post(`/api/announcements/${id}/read`).then((res) => res.data);
}

export function getAnnouncementReaders(id) {
  return api.get(`/api/announcements/${id}/readers`).then((res) => res.data);
}
