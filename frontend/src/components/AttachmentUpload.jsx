import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import { IconFileText, IconDownload, IconTrash, IconPaperclip } from './icons';

const MAX_SIZE = 5 * 1024 * 1024;

function AttachmentUpload({ taskId, canUpload }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const loadAttachments = useCallback(async () => {
    try {
      const data = await taskService.getAttachments(taskId);
      setAttachments(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to load attachments');
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
      notifyError('The file exceeds the maximum size of 5 MB');
      return;
    }

    setUploading(true);
    try {
      await taskService.uploadAttachment(taskId, file);
      notifySuccess('File added');
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
      notifyError(err.response?.data?.error || 'Unable to download the file');
    }
  }

  async function handleDelete(attachment) {
    if (!window.confirm(`Delete "${attachment.file_name}"?`)) return;
    try {
      await taskService.deleteAttachment(taskId, attachment.id);
      notifySuccess('File deleted');
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
            {uploading ? 'Uploading...' : 'Add a file'}
            <input type="file" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>
      )}

      {attachments.length === 0 && <div className="empty-state">No attachments yet.</div>}
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
              onClick={() => handleDownload(attachment)}
              aria-label="Download"
              title="Download"
            >
              <IconDownload />
            </button>
            {canUpload && (
              <button
                className="icon-link-btn"
                onClick={() => handleDelete(attachment)}
                aria-label="Delete"
                title="Delete"
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
