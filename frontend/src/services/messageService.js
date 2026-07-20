import api from './api';

export function getGlobalMessages() {
  return api.get('/api/messages/global').then((res) => res.data);
}

export function sendGlobalMessage(content) {
  return api.post('/api/messages/global', { content }).then((res) => res.data);
}

export function getConversations() {
  return api.get('/api/conversations').then((res) => res.data);
}

export function getPrivateMessages(userId) {
  return api.get(`/api/messages/private/${userId}`).then((res) => res.data);
}

export function sendPrivateMessage(userId, content) {
  return api.post(`/api/messages/private/${userId}`, { content }).then((res) => res.data);
}

// Un message -> une conversation privée par destinataire. Chacun ne voit que sa propre conversation
// (DECISIONS.md : les destinataires ne voient jamais la liste des autres).
export function sendMessageToMultiple(userIds, content) {
  return Promise.all(userIds.map((userId) => sendPrivateMessage(userId, content)));
}

export function getMessageGroups() {
  return api.get('/api/message-groups').then((res) => res.data);
}

export function createMessageGroup(name, memberIds) {
  return api.post('/api/message-groups', { name, member_ids: memberIds }).then((res) => res.data);
}

export function getGroupMessages(groupId) {
  return api.get(`/api/message-groups/${groupId}/messages`).then((res) => res.data);
}

export function sendGroupMessage(groupId, content) {
  return api.post(`/api/message-groups/${groupId}/messages`, { content }).then((res) => res.data);
}
