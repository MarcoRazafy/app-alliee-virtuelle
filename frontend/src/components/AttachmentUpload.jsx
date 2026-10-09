import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconFileText, IconEye, IconDownload, IconTrash, IconPaperclip } from './icons';
import MediaPreview from './MediaPreview';

const PREVIEWABLE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

const MAX_SIZE = 5 * 1024 * 1024;

function AttachmentUpload({ taskId, canUpload, inputId, hideTrigger = false }) {
  const currentUser = useAuthStore((state) => state.user);
  const canDelete = (attachment) =>
    canUpload && (currentUser?.role === 'ADMIN' || attachment.uploaded_by === currentUser?.id);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

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

  async function handleView(attachment) {
    if (PREVIEWABLE_TYPES.includes(attachment.file_type)) {
      try {
        const blob = await taskService.downloadAttachment(attachment.id);
        setPreview({ url: URL.createObjectURL(blob), type: attachment.file_type, name: attachment.file_name, attachment });
      } catch (err) {
        notifyError(err.response?.data?.error || "Impossible d'ouvrir le fichier");
      }
      return;
    }
    setPreview({ url: null, type: attachment.file_type, name: attachment.file_name, size: attachment.file_size, attachment });
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
      {canUpload && hideTrigger && (
        <input
          id={inputId}
          className="attach-hidden-input"
          type="file"
          onChange={handleFileChange}
          disabled={uploading}
        />
      )}

      {canUpload && !hideTrigger && (
        <div className="upload-zone">
          <label className="upload-btn">
            <IconPaperclip />
            {uploading ? 'Envoi en cours...' : 'Ajouter un fichier'}
            <input type="file" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>
      )}

      {hideTrigger && uploading && <div className="attach-uploading">Envoi en cours…</div>}
      {attachments.map((attachment) => (
        <div key={attachment.id} className="attachment-row">
          <span className="attachment-icon">
            <IconFileText />
          </span>
          <div className="attachment-info">
            <button
              type="button"
              className="attachment-name attachment-name-btn"
              onClick={() => handleView(attachment)}
              title="Voir le fichier"
            >
              {attachment.file_name}
            </button>
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
            {canDelete(attachment) && (
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

      {preview && (
        <MediaPreview
          url={preview.url}
          type={preview.type}
          name={preview.name}
          size={preview.size}
          onClose={() => {
            if (preview.url) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
          onDownload={() => handleDownload(preview.attachment)}
        />
      )}
    </div>
  );
}

export default AttachmentUpload;
