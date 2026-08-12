import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import { IconFileText, IconEye, IconDownload, IconTrash, IconPaperclip } from './icons';

const MAX_SIZE = 5 * 1024 * 1024;

function AttachmentUpload({ taskId, canUpload }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const loadAttachments = useCallback(async () => {
    try {
      const data = await taskService.getAttachments(taskId);
      setAttachments(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les pièces jointes');
    }
  }, [taskId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_SIZE) {
      notifyError('Le fichier dépasse la taille maximale de 5 Mo');
      return;
    }

    setUploading(true);
    try {
      await taskService.uploadAttachment(taskId, file);
      notifySuccess('Fichier ajouté');
      await loadAttachments();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter le fichier");
    } finally {
      setUploading(false);
    }
  }

  // Prévisualise le fichier dans un nouvel onglet (PDF, image… rendus par le navigateur).
  async function handleView(attachment) {
    // On ouvre l'onglet AVANT le fetch (asynchrone) pour éviter le blocage des popups.
    const win = window.open('', '_blank');
    try {
      const blob = await taskService.downloadAttachment(attachment.id);
      const url = window.URL.createObjectURL(blob);
      if (win) win.location = url;
      else window.open(url, '_blank');
      // Laisse le temps au nouvel onglet de charger avant de libérer l'URL.
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (win) win.close();
      notifyError(err.response?.data?.error || "Impossible d'ouvrir le fichier");
    }
  }

  async function handleDownload(attachment) {
    try {
      const blob = await taskService.downloadAttachment(attachment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de télécharger le fichier');
    }
  }

  async function handleDelete(attachment) {
    if (!window.confirm(`Supprimer "${attachment.file_name}" ?`)) return;
    try {
      await taskService.deleteAttachment(taskId, attachment.id);
      notifySuccess('Fichier supprimé');
      await loadAttachments();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer le fichier');
    }
  }

  return (
    <div>
      {canUpload && (
        <div className="upload-zone">
          <label className="upload-btn">
            <IconPaperclip />
            {uploading ? 'Envoi en cours...' : 'Ajouter un fichier'}
            <input type="file" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>
      )}

      {attachments.length === 0 && <div className="empty-state">Aucune pièce jointe pour le moment.</div>}
      {attachments.map((attachment) => (
        <div key={attachment.id} className="attachment-row">
          <span className="attachment-icon">
            <IconFileText />
          </span>
          <div className="attachment-info">
            <div className="attachment-name">{attachment.file_name}</div>
            <div className="attachment-meta">
              {formatBytes(attachment.file_size)} · {formatDateTime(attachment.created_at)}
            </div>
          </div>
          <div className="attachment-actions">
            <button
              className="icon-link-btn"
              onClick={() => handleView(attachment)}
              aria-label="Voir"
              title="Voir le fichier"
            >
              <IconEye />
            </button>
            <button
              className="icon-link-btn"
              onClick={() => handleDownload(attachment)}
              aria-label="Télécharger"
              title="Télécharger"
            >
              <IconDownload />
            </button>
            {canUpload && (
              <button
                className="icon-link-btn"
                onClick={() => handleDelete(attachment)}
                aria-label="Supprimer"
                title="Supprimer"
              >
                <IconTrash />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default AttachmentUpload;
