import api from './api';

function buildBody(content, file) {
  if (file) {
    const form = new FormData();
    if (content) form.append('content', content);
    form.append('file', file);
    return form;
  }
  return { content };
}

export function getGlobalMessages() {
  return api.get('/api/messages/global').then((res) => res.data);
}

export function sendGlobalMessage(content, file = null) {
  return api.post('/api/messages/global', buildBody(content, file)).then((res) => res.data);
}

export function createPoll({ scope, target_id, question, options, allow_multiple }) {
  return api
    .post('/api/messages/polls', { scope, target_id, question, options, allow_multiple })
    .then((res) => res.data);
}

export function votePoll(pollId, optionIds) {
  return api.post(`/api/messages/polls/${pollId}/vote`, { option_ids: optionIds }).then((res) => res.data);
}

export function getConversations() {
  return api.get('/api/conversations').then((res) => res.data);
}

export function getPrivateMessages(userId) {
  return api.get(`/api/messages/private/${userId}`).then((res) => res.data);
}

export function sendPrivateMessage(userId, content, file = null) {
  return api.post(`/api/messages/private/${userId}`, buildBody(content, file)).then((res) => res.data);
}

export function sendMessageToMultiple(userIds, content) {
  return Promise.all(userIds.map((userId) => sendPrivateMessage(userId, content)));
}

export function getMessageGroups() {
  return api.get('/api/message-groups').then((res) => res.data);
}

export function createMessageGroup(name, memberIds, file = null) {
  if (file) {
    const form = new FormData();
    form.append('name', name);
    form.append('member_ids', JSON.stringify(memberIds));
    form.append('file', file);
    return api.post('/api/message-groups', form).then((res) => res.data);
  }
  return api.post('/api/message-groups', { name, member_ids: memberIds }).then((res) => res.data);
}

export function getGroupAvatarBlob(groupId) {
  return api.get(`/api/message-groups/${groupId}/avatar`, { responseType: 'blob' }).then((res) => res.data);
}

export function updateGroup(groupId, { name, file } = {}) {
  if (file) {
    const form = new FormData();
    if (name) form.append('name', name);
    form.append('file', file);
    return api.patch(`/api/message-groups/${groupId}`, form).then((res) => res.data);
  }
  return api.patch(`/api/message-groups/${groupId}`, { name }).then((res) => res.data);
}

export function deleteGroup(groupId) {
  return api.delete(`/api/message-groups/${groupId}`).then((res) => res.data);
}

export function addGroupMembers(groupId, memberIds) {
  return api.post(`/api/message-groups/${groupId}/members`, { member_ids: memberIds }).then((res) => res.data);
}

export function removeGroupMember(groupId, userId) {
  return api.delete(`/api/message-groups/${groupId}/members/${userId}`).then((res) => res.data);
}

export function leaveGroup(groupId) {
  return api.post(`/api/message-groups/${groupId}/leave`).then((res) => res.data);
}

export function getGroupMessages(groupId) {
  return api.get(`/api/message-groups/${groupId}/messages`).then((res) => res.data);
}

export function sendGroupMessage(groupId, content, file = null) {
  return api.post(`/api/message-groups/${groupId}/messages`, buildBody(content, file)).then((res) => res.data);
}

export function editMessage(id, content) {
  return api.patch(`/api/messages/${id}`, { content }).then((res) => res.data);
}

export function deleteMessage(id) {
  return api.delete(`/api/messages/${id}`).then((res) => res.data);
}

export function reactMessage(id, emoji) {
  return api.post(`/api/messages/${id}/react`, { emoji }).then((res) => res.data);
}

export function forwardMessage(id, target) {
  return api
    .post(`/api/messages/${id}/forward`, { target_type: target.type, target_id: target.id })
    .then((res) => res.data);
}

export function getOnlineUsers() {
  return api.get('/api/messages/online-users').then((res) => res.data);
}

export function getAttachmentBlob(messageId) {
  return api.get(`/api/messages/${messageId}/attachment`, { responseType: 'blob' }).then((res) => res.data);
}
