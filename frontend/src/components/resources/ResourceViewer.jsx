import { useEffect, useRef, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import { notifyError } from '../../utils/toast';
import { IconX, IconDownload, IconPencil } from '../icons';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Visionneuse unifiée : aperçu d'un fichier uploadé (PDF/image) ou lecture d'un
// document HTML créé dans la plateforme, avec téléchargement (fichier ou PDF).
function ResourceViewer({ file, canManage = false, onClose, onEdit }) {
  const isDocument = file.kind === 'DOCUMENT';
  const docRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [exporting, setExporting] = useState(false);

  const mime = file.mime_type || '';
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');

  useEffect(() => {
    let objectUrl;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isDocument) {
          const full = await resourceService.getFile(file.id);
          if (!cancelled) setDocContent(full.content || '');
        } else if (isPdf || isImage) {
          const blob = await resourceService.getFilePreviewBlob(file.id);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setBlobUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Unable to load the preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, isDocument, isPdf, isImage]);

  async function handleDownloadFile() {
    try {
      const blob = await resourceService.downloadFileBlob(file.id);
      saveBlob(blob, file.file_name);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Download failed');
    }
  }

  async function handleDownloadPdf() {
    if (!docRef.current) return;
    setExporting(true);
    try {
      // Chargé à la demande : html2pdf (jsPDF + html2canvas) est lourd et n'est utile
      // qu'au moment d'exporter un document en PDF.
      const { default: html2pdf } = await import('html2pdf.js');
      await html2pdf()
        .set({
          margin: [12, 12],
          filename: `${file.file_name || 'document'}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(docRef.current)
        .save();
    } catch {
      notifyError('Unable to generate the PDF');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="resources-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="resources-modal resources-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={file.file_name}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="resources-modal-head">
          <div>
            <p className="resources-modal-eyebrow">{isDocument ? 'Document' : file.file_type || 'Fichier'}</p>
            <h2>{file.file_name}</h2>
          </div>
          <button type="button" className="resources-modal-close" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="resources-viewer-body">
          {loading && <div className="empty-state">Loading the preview…</div>}
          {!loading && error && <div className="empty-state">{error}</div>}

          {!loading && !error && isDocument && (
            <div className="resources-doc-page">
              <div
                ref={docRef}
                className="resource-doc-render"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: docContent || '<p><em>Empty document.</em></p>' }}
              />
            </div>
          )}

          {!loading && !error && !isDocument && isPdf && blobUrl && (
            <iframe className="resources-viewer-frame" src={blobUrl} title={file.file_name} />
          )}

          {!loading && !error && !isDocument && isImage && blobUrl && (
            <div className="resources-viewer-image-wrap">
              <img src={blobUrl} alt={file.file_name} />
            </div>
          )}

          {!loading && !error && !isDocument && !isPdf && !isImage && (
            <div className="empty-state">
              Preview unavailable for this format. Download the file to open it.
            </div>
          )}
        </div>

        <div className="resources-modal-foot">
          {canManage && isDocument && (
            <button type="button" className="btn-outline" onClick={() => onEdit?.(file)}>
              <IconPencil /> Edit
            </button>
          )}
          {isDocument ? (
            <button type="button" className="btn-primary" onClick={handleDownloadPdf} disabled={exporting}>
              <IconDownload /> {exporting ? 'Generating…' : 'Download as PDF'}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleDownloadFile}>
              <IconDownload /> Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResourceViewer;
