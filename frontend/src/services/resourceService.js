import api, { apiBaseUrl } from './api';

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

export function uploadFile(folderId, file, onProgress) {
  const payload = new FormData();
  payload.append('file', file);
  return api
    .post(`/api/resources/folders/${folderId}/files`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: onProgress ? (event) => onProgress(event.loaded, event.total) : undefined,
    })
    .then((res) => res.data);
}

export function videoStreamUrl(id) {
  return `${apiBaseUrl}/api/resources/files/${id}/preview`;
}

export function getFile(id) {
  return api.get(`/api/resources/files/${id}`).then((res) => res.data);
}

export function getFilePreviewBlob(id) {
  return api.get(`/api/resources/files/${id}/preview`, { responseType: 'blob' }).then((res) => res.data);
}

export function downloadFileBlob(id) {
  return api.get(`/api/resources/files/${id}/download`, { responseType: 'blob' }).then((res) => res.data);
}

export function uploadDocumentMedia(folderId, file, { onProgress, signal } = {}) {
  const payload = new FormData();
  payload.append('file', file);
  return api
    .post(`/api/resources/folders/${folderId}/media`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      signal,
      onUploadProgress: onProgress ? (event) => onProgress(event.loaded, event.total) : undefined,
    })
    .then((res) => res.data);
}

export function deleteDocumentMedia(id) {
  return api.delete(`/api/resources/media/${id}`).then((res) => res.data);
}

export function getDocumentMediaBlob(id) {
  return api.get(`/api/resources/media/${id}`, { responseType: 'blob', timeout: 0 }).then((res) => res.data);
}

export function createDocument(folderId, payload) {
  return api.post(`/api/resources/folders/${folderId}/documents`, payload).then((res) => res.data);
}

export function updateDocument(id, payload) {
  return api.put(`/api/resources/files/${id}`, payload).then((res) => res.data);
}

export function deleteFile(id) {
  return api.delete(`/api/resources/files/${id}`).then((res) => res.data);
}

export function getTrash() {
  return api.get('/api/resources/trash').then((res) => res.data);
}

export function restoreFolder(id) {
  return api.post(`/api/resources/trash/folders/${id}/restore`).then((res) => res.data);
}

export function permanentlyDeleteFolder(id) {
  return api.delete(`/api/resources/trash/folders/${id}`).then((res) => res.data);
}

export function restoreFile(id) {
  return api.post(`/api/resources/trash/files/${id}/restore`).then((res) => res.data);
}

export function permanentlyDeleteFile(id) {
  return api.delete(`/api/resources/trash/files/${id}`).then((res) => res.data);
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
