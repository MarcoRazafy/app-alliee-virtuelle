import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconX } from './icons';
import '../styles/media-preview.css';

// Visionneuse plein écran d'une image (ou d'un PDF) jointe : commentaires, pièces jointes de
// tâche, messagerie, documents, annonces. Elle remplace l'ouverture dans un nouvel onglet,
// qui faisait sortir de l'application.
//
// - `url` : adresse déjà chargée (objectURL d'un Blob, en général) ;
// - `type` : type MIME — un PDF s'affiche dans un cadre, tout le reste comme une image ;
// - `onDownload` : facultatif, affiche le bouton de téléchargement.
//
// Rendue dans <body> par un portail : elle passe au-dessus de toute fenêtre ouverte (fiche de
// tâche en surimpression, visionneuse de document) sans en dépendre.
export default function MediaPreview({ url, type, name, onClose, onDownload }) {
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
        ) : (
          <img className="media-preview-img" src={url} alt={name || ''} onClick={stop} />
        )}
      </div>
    </div>,
    document.body
  );
}
