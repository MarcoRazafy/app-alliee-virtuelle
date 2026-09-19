import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconFileText, IconX } from './icons';
import { formatBytes } from '../utils/formatters';
import '../styles/media-preview.css';

// Visionneuse plein écran d'une image (ou d'un PDF) jointe : commentaires, pièces jointes de
// tâche, messagerie, documents, annonces. Elle remplace l'ouverture dans un nouvel onglet,
// qui faisait sortir de l'application.
//
// - `url` : adresse déjà chargée (objectURL d'un Blob, en général) ;
// - `type` : type MIME. Image → affichée ; PDF → dans un cadre ; autre format (Word, Excel…)
//   → fiche du fichier avec un bouton Télécharger : un navigateur ne sait pas les afficher,
//   et les ouvrir dans un onglet faisait quand même sortir de l'application ;
// - `size` : facultatif, taille en octets affichée sur la fiche ;
// - `onDownload` : facultatif, affiche le bouton de téléchargement.
//
// Rendue dans <body> par un portail : elle passe au-dessus de toute fenêtre ouverte (fiche de
// tâche en surimpression, visionneuse de document) sans en dépendre.
export function isPreviewableInApp(type) {
  return isImage(type) || type === 'application/pdf';
}

function isImage(type) {
  return !type || type === 'image' || String(type).startsWith('image/');
}

export default function MediaPreview({ url, type, name, size, onClose, onDownload }) {
  useEffect(() => {
    // Échap ne ferme QUE la visionneuse : écouté en phase de capture sur window, avant les
    // raccourcis de la page — sinon la fiche de tâche ouverte derrière se fermerait aussi.
    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    // La page derrière ne défile pas pendant l'aperçu.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const isPdf = type === 'application/pdf';
  const displayable = isPdf || isImage(type);
  const stop = (event) => event.stopPropagation();

  return createPortal(
    <div className="media-preview" role="dialog" aria-modal="true" aria-label={name || 'Aperçu'} onClick={onClose}>
      <div className="media-preview-bar" onClick={stop}>
        <span className="media-preview-name" title={name}>
          {name}
        </span>
        {onDownload && (
          <button type="button" className="media-preview-btn" onClick={onDownload} aria-label="Télécharger" title="Télécharger">
            <IconDownload />
          </button>
        )}
        <button type="button" className="media-preview-btn" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)">
          <IconX />
        </button>
      </div>
      {/* Un clic à côté de l'image ferme ; un clic SUR l'image ne ferme pas. */}
      <div className="media-preview-stage">
        {isPdf ? (
          <iframe className="media-preview-pdf" src={url} title={name || 'PDF'} onClick={stop} />
        ) : displayable ? (
          <img className="media-preview-img" src={url} alt={name || ''} onClick={stop} />
        ) : (
          <div className="media-preview-file" onClick={stop}>
            <span className="media-preview-file-icon">
              <IconFileText />
            </span>
            <strong className="media-preview-file-name">{name}</strong>
            {size ? <span className="media-preview-file-size">{formatBytes(size)}</span> : null}
            <p className="media-preview-file-hint">
              Ce type de fichier ne peut pas être affiché dans l'application. Téléchargez-le pour l'ouvrir.
            </p>
            {onDownload && (
              <button type="button" className="btn-primary media-preview-file-download" onClick={onDownload}>
                <IconDownload /> Télécharger
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
