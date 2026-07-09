import api from './api';

export function getFolders(type) {
  return api.get('/api/resources/folders', { params: { type } }).then((res) => res.data);
}

export function getFolderFiles(folderId) {
  return api.get(`/api/resources/folders/${folderId}/files`).then((res) => res.data);
}

export function createFolder(payload) {
  return api.post('/api/resources/folders', payload).then((res) => res.data);
}

export function renameFolder(id, name) {
  return api.put(`/api/resources/folders/${id}`, { name }).then((res) => res.data);
}

export function deleteFolder(id) {
  return api.delete(`/api/resources/folders/${id}`).then((res) => res.data);
}

export function createFile(folderId, payload) {
  return api.post(`/api/resources/folders/${folderId}/files`, payload).then((res) => res.data);
}

export function deleteFile(id) {
  return api.delete(`/api/resources/files/${id}`).then((res) => res.data);
}

export function shareFolder(folderId, payload) {
  return api.post(`/api/resources/folders/${folderId}/share`, payload).then((res) => res.data);
}

export function getFolderShares(folderId) {
  return api.get(`/api/resources/folders/${folderId}/shares`).then((res) => res.data);
}

export function revokeShare(id) {
  return api.delete(`/api/resources/shares/${id}`).then((res) => res.data);
}
