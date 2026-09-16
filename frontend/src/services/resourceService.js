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

// Upload réel d'un fichier (PDF, image, Word, vidéo...) via multipart/form-data.
// `onProgress(loaded, total)` : suivi de l'envoi, indispensable pour une vidéo de plusieurs
// centaines de Mo — sans lui, l'import semble figé pendant de longues minutes.
export function uploadFile(folderId, file, onProgress) {
  const payload = new FormData();
  payload.append('file', file);
  return api
    .post(`/api/resources/folders/${folderId}/files`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Aucun délai maximal : le délai global de l'API (10 s) coupait tout import un peu
      // gros, et une vidéo peut légitimement mettre de longues minutes à partir.
      timeout: 0,
      onUploadProgress: onProgress ? (event) => onProgress(event.loaded, event.total) : undefined,
    })
    .then((res) => res.data);
}

// Adresse de lecture d'une vidéo, donnée directement à la balise <video>. Contrairement aux
// PDF et images, on ne la charge PAS en Blob : il faudrait recevoir le fichier entier avant
// la première image, et le lecteur ne pourrait plus sauter au milieu. Le cookie de session
// accompagne la requête, l'API étant servie depuis la même origine.
export function videoStreamUrl(id) {
  return `${apiBaseUrl}/api/resources/files/${id}/preview`;
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

// Média (photo, vidéo, PDF) à insérer dans un document. Mêmes règles que uploadFile : pas de
// délai maximal, progression suivie, et `signal` pour abandonner si l'éditeur se ferme.
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

// Retire un média abandonné. Le serveur refuse (409) s'il est encore cité par un document.
export function deleteDocumentMedia(id) {
  return api.delete(`/api/resources/media/${id}`).then((res) => res.data);
}

// PDF inséré dans un document, chargé en Blob pour la visionneuse.
export function getDocumentMediaBlob(id) {
  return api.get(`/api/resources/media/${id}`, { responseType: 'blob', timeout: 0 }).then((res) => res.data);
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
