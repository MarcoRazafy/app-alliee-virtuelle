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

// Upload réel d'un fichier (PDF, image, Word...) via multipart/form-data.
export function uploadFile(folderId, file) {
  const payload = new FormData();
  payload.append('file', file);
  return api
    .post(`/api/resources/folders/${folderId}/files`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

// Métadonnées + contenu d'un fichier/document.
export function getFile(id) {
  return api.get(`/api/resources/files/${id}`).then((res) => res.data);
}

// Binaire du fichier (aperçu inline) sous forme de Blob → URL objet côté client.
export function getFilePreviewBlob(id) {
  return api.get(`/api/resources/files/${id}/preview`, { responseType: 'blob' }).then((res) => res.data);
}

// Binaire du fichier en pièce jointe (téléchargement) sous forme de Blob.
export function downloadFileBlob(id) {
  return api.get(`/api/resources/files/${id}/download`, { responseType: 'blob' }).then((res) => res.data);
}

// Documents éditables créés dans la plateforme.
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
