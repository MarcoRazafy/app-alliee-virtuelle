import api from './api';

export function getFolders(type) {
  return api.get('/api/resources/folders', { params: { type } }).then((res) => res.data);
}

export function getFolderFiles(folderId) {
  return api.get(`/api/resources/folders/${folderId}/files`).then((res) => res.data);
}
