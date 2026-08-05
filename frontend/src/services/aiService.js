import api from './api';

// Une génération IA (surtout une réponse longue comme un guide) peut dépasser le timeout
// global de 10 s. On accorde un délai plus large aux requêtes qui appellent le modèle.
const AI_TIMEOUT = 60000;

export function askAssistant(question, sessionId, file = null) {
  if (file) {
    const form = new FormData();
    form.append('question', question);
    if (sessionId) form.append('session_id', sessionId);
    form.append('file', file);
    return api.post('/api/ai/ask', form, { timeout: AI_TIMEOUT }).then((res) => res.data);
  }
  return api
    .post('/api/ai/ask', { question, session_id: sessionId }, { timeout: AI_TIMEOUT })
    .then((res) => res.data);
}

export function getAiHistory(limit = 200) {
  return api.get('/api/ai/history', { params: { limit } }).then((res) => res.data);
}

export function editConversation(id, question) {
  return api
    .patch(`/api/ai/conversations/${id}`, { question }, { timeout: AI_TIMEOUT })
    .then((res) => res.data);
}

export function deleteConversation(id) {
  return api.delete(`/api/ai/conversations/${id}`).then((res) => res.data);
}

export function renameSession(sessionId, title) {
  return api.patch(`/api/ai/sessions/${sessionId}`, { title }).then((res) => res.data);
}

export function deleteSession(sessionId) {
  return api.delete(`/api/ai/sessions/${sessionId}`).then((res) => res.data);
}

export function getConversationAttachmentBlob(id) {
  return api.get(`/api/ai/conversations/${id}/attachment`, { responseType: 'blob' }).then((res) => res.data);
}
