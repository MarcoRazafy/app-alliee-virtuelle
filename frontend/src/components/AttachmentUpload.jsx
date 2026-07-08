import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';

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
        <div>
          <input type="file" onChange={handleFileChange} disabled={uploading} />
          {uploading && <span> Envoi en cours...</span>}
        </div>
      )}

      {attachments.length === 0 && <p>Aucune pièce jointe pour le moment.</p>}
      <ul>
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            {attachment.file_name} — {formatBytes(attachment.file_size)} — {formatDateTime(attachment.created_at)}
            <button onClick={() => handleDownload(attachment)}>Télécharger</button>
            {canUpload && <button onClick={() => handleDelete(attachment)}>Supprimer</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AttachmentUpload;
