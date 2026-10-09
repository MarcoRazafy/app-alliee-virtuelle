import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as resourceService from '../../services/resourceService';
import { notifyError } from '../../utils/toast';
import { IconX, IconDownload, IconPencil } from '../icons';
import { linkifyHtml } from '../../utils/sanitizeHtml';
import { isVideoMime } from '../../utils/resourceMedia';
import MediaPreview from '../MediaPreview';

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

function ResourceViewer({ file, canManage = false, onClose, onEdit }) {
  const isDocument = file.kind === 'DOCUMENT';
  const docRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [exporting, setExporting] = useState(false);
  const [openedPdf, setOpenedPdf] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);

  const mime = file.mime_type || '';
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');
  const isVideo = isVideoMime(mime);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;

    if (isVideo) {
      setError(null);
      setLoading(false);
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isDocument) {
          const full = await resourceService.getFile(file.id);
          if (!cancelled) setDocContent(full.content || '');
        } else if (isPdf || isImage) {
          const blob = file.media
            ? await resourceService.getDocumentMediaBlob(file.id)
            : await resourceService.getFilePreviewBlob(file.id);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setBlobUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Impossible de charger l'aperçu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.media, isDocument, isPdf, isImage, isVideo]);

  async function handleDownloadFile() {
    try {
      const blob = file.media
        ? await resourceService.getDocumentMediaBlob(file.id)
        : await resourceService.downloadFileBlob(file.id);
      saveBlob(blob, file.file_name);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Téléchargement impossible');
    }
  }

  async function handleDownloadPdf() {
    if (!docRef.current) return;
    setExporting(true);
    try {
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
      notifyError("Impossible de générer le PDF");
    } finally {
      setExporting(false);
    }
  }

  function handleDocumentClick(event) {
    const image = event.target.closest('img');
    if (image) {
      setZoomedImage({ url: image.currentSrc || image.src, name: image.alt || file.file_name });
      return;
    }
    const card = event.target.closest('a.resource-doc-pdf');
    if (!card) return;
    event.preventDefault();
    setOpenedPdf({ id: card.dataset.mediaId, name: card.dataset.fileName || card.textContent });
  }

  function handleDocumentContextMenu(event) {
    if (event.target.closest('video')) event.preventDefault();
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
          <button type="button" className="resources-modal-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        <div className="resources-viewer-body">
          {loading && <div className="empty-state">Chargement de l'aperçu…</div>}
          {!loading && error && <div className="empty-state">{error}</div>}

          {!loading && !error && isDocument && (
            <div className="resources-doc-page">
              <div
                ref={docRef}
                onClick={handleDocumentClick}
                onContextMenu={handleDocumentContextMenu}
                className="resource-doc-render"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: linkifyHtml(docContent || '<p><em>Document vide.</em></p>') }}
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

          {!loading && !error && !isDocument && isVideo && (
            <div className="resources-viewer-video-wrap">
              <video
                key={file.id}
                className="resources-viewer-video"
                src={resourceService.videoStreamUrl(file.id)}
                controls
                controlsList="nodownload noremoteplayback"
                disableRemotePlayback
                playsInline
                preload="metadata"
                onContextMenu={(e) => e.preventDefault()}
                onError={() =>
                  setError(
                    'Lecture impossible : la vidéo est introuvable ou son format n’est pas pris en charge par ce navigateur.'
                  )
                }
              >
                Votre navigateur ne sait pas lire cette vidéo.
              </video>
            </div>
          )}

          {!loading && !error && !isDocument && !isPdf && !isImage && !isVideo && (
            <div className="empty-state">
              Aperçu indisponible pour ce format. Téléchargez le fichier pour l'ouvrir.
            </div>
          )}
        </div>

        {!isVideo && (
        <div className="resources-modal-foot">
          {canManage && isDocument && (
            <button type="button" className="btn-outline" onClick={() => onEdit?.(file)}>
              <IconPencil /> Éditer
            </button>
          )}
          {isDocument && (
            <button type="button" className="btn-primary" onClick={handleDownloadPdf} disabled={exporting}>
              <IconDownload /> {exporting ? 'Génération…' : 'Télécharger en PDF'}
            </button>
          )}
          {!isDocument && (
            <button type="button" className="btn-primary" onClick={handleDownloadFile}>
              <IconDownload /> Télécharger
            </button>
          )}
        </div>
        )}

        {zoomedImage && (
          <MediaPreview url={zoomedImage.url} type="image" name={zoomedImage.name} onClose={() => setZoomedImage(null)} />
        )}

        {openedPdf &&
          createPortal(
            <ResourceViewer
              file={{
                id: openedPdf.id,
                file_name: openedPdf.name,
                file_type: 'PDF',
                mime_type: 'application/pdf',
                kind: 'FILE',
                media: true,
              }}
              onClose={() => setOpenedPdf(null)}
            />,
            window.document.body
          )}
      </div>

    </div>
  );
}

export default ResourceViewer;
