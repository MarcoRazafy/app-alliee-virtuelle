import api from './api';

// Liste paginée des emails reçus (+ totaux et état de la config IMAP).
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

// Force une synchronisation IMAP immédiate.
export function refreshInbox() {
  return api.post('/api/emails/refresh').then((res) => res.data);
}

// Répond à un email (envoyé depuis l'adresse de la boîte).
export function replyEmail(id, body) {
  return api.post(`/api/emails/${id}/reply`, { body }).then((res) => res.data);
}
