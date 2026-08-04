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

// FormData quand une image est fournie (upload), sinon JSON simple.
function buildBody({ title, body, is_important, is_pinned, file }) {
  if (file) {
    const form = new FormData();
    form.append('title', title);
    form.append('body', body);
    form.append('is_important', String(Boolean(is_important)));
    form.append('is_pinned', String(Boolean(is_pinned)));
    form.append('file', file);
    return form;
  }
  return { title, body, is_important, is_pinned };
}

export function createAnnouncement(payload) {
  return api.post('/api/announcements', buildBody(payload)).then((res) => res.data);
}

export function updateAnnouncement(id, payload) {
  return api.put(`/api/announcements/${id}`, buildBody(payload)).then((res) => res.data);
}

export function getAnnouncementImageBlob(id) {
  return api.get(`/api/announcements/${id}/image`, { responseType: 'blob' }).then((res) => res.data);
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
