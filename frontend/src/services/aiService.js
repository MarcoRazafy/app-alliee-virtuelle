import api from './api';

export function askAssistant(question, sessionId) {
  return api.post('/api/ai/ask', { question, session_id: sessionId }).then((res) => res.data);
}

export function getAiHistory(limit = 200) {
  return api.get('/api/ai/history', { params: { limit } }).then((res) => res.data);
}
