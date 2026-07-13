import api from './api';

export function getSpacesTree() {
  return api.get('/api/spaces/tree').then((res) => res.data);
}

export function getSpaces() {
  return api.get('/api/spaces').then((res) => res.data);
}

export function createSpace(payload) {
  return api.post('/api/spaces', payload).then((res) => res.data);
}

export function updateSpace(id, payload) {
  return api.put(`/api/spaces/${id}`, payload).then((res) => res.data);
}

export function deleteSpace(id) {
  return api.delete(`/api/spaces/${id}`).then((res) => res.data);
}

export function getFolders(spaceId) {
  return api.get('/api/folders', { params: { space_id: spaceId } }).then((res) => res.data);
}

export function createFolder(payload) {
  return api.post('/api/folders', payload).then((res) => res.data);
}

export function updateFolder(id, name) {
  return api.put(`/api/folders/${id}`, { name }).then((res) => res.data);
}

export function deleteFolder(id) {
  return api.delete(`/api/folders/${id}`).then((res) => res.data);
}

export function getLists(folderId) {
  return api.get('/api/lists', { params: { folder_id: folderId } }).then((res) => res.data);
}

export function createList(payload) {
  return api.post('/api/lists', payload).then((res) => res.data);
}

export function updateList(id, name) {
  return api.put(`/api/lists/${id}`, { name }).then((res) => res.data);
}

export function deleteList(id) {
  return api.delete(`/api/lists/${id}`).then((res) => res.data);
}
