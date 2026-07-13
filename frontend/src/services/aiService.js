import api from './api';

export function askAssistant(question) {
  return api.post('/api/ai/ask', { question }).then((res) => res.data);
}

export function getAiHistory(limit = 20) {
  return api.get('/api/ai/history', { params: { limit } }).then((res) => res.data);
}
