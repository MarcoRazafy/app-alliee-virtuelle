import { useRef } from 'react';
import * as resourceService from '../../../services/resourceService';
import {
  ALIGNMENTS,
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_NAME_CHARS,
  PHOTO_ACCEPT,
  VIDEO_ACCEPT,
  isUploadToken,
  lienVideo,
} from '../../../utils/pageBlocks';
import { ToolButton, ColorPicker } from './EditorControls';
import { IconAlignLeft, IconAlignCenter, IconAlignRight, IconFileText, IconImage, IconPaperclip, IconVideo } from '../../icons';

const ALIGN_ICONS = { '': IconAlignLeft, centre: IconAlignCenter, droite: IconAlignRight };

function mediaSource(block, pageId) {
  if (block.apercu) return block.apercu;
  if (block.fichier && !isUploadToken(block.fichier) && pageId) return resourceService.pageMediaUrl(pageId, block.fichier);
  return null;
}

function UploadState({ block }) {
  if (block.progression != null) {
    return (
      <div className="rpe-upload">
        <div className="rpe-progress" role="progressbar" aria-valuenow={block.progression} aria-valuemin={0} aria-valuemax={100} aria-label="Envoi du fichier">
          <span style={{ width: `${block.progression}%` }} />
        </div>
        <span className="rpe-upload-label">Envoi… {block.progression} %</span>
      </div>
    );
  }
  if (block.erreur) {
    return (
      <p className="rpe-field-error" role="alert">
        {block.erreur}
      </p>
    );
  }
  return null;
}

function FilePicker({ accept, inputRef, onPickFile }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) onPickFile(file);
      }}
    />
  );
}

export function TitleBlock({ block, onChange }) {
  const alignClass = block.alignement ? ` rp-align-${block.alignement}` : '';
  return (
    <div className="rpe-title-block">
      <div className="rpe-toolbar" role="toolbar" aria-label="Mise en forme du titre">
        <ToolButton label="Titre (h2)" active={block.niveau !== 3} onClick={() => onChange({ niveau: 2 })}>
          <span className="rpe-level">H2</span>
        </ToolButton>
        <ToolButton label="Sous-titre (h3)" active={block.niveau === 3} onClick={() => onChange({ niveau: 3 })}>
          <span className="rpe-level">H3</span>
        </ToolButton>
        <span className="rpe-toolbar-sep" aria-hidden="true" />
        {ALIGNMENTS.map((alignment) => {
          const Icon = ALIGN_ICONS[alignment.value];
          return (
            <ToolButton
              key={alignment.label}
              label={alignment.label}
              active={(block.alignement || '') === alignment.value}
              onClick={() => onChange({ alignement: alignment.value || undefined })}
            >
              <Icon />
            </ToolButton>
          );
        })}
        <ColorPicker label="Couleur du titre" value={block.couleur} onPick={(couleur) => onChange({ couleur: couleur || undefined })} />
      </div>
      <input
        className={`rpe-title-input rp-titre rp-titre--h${block.niveau === 3 ? 3 : 2}${alignClass}`}
        style={block.couleur ? { color: block.couleur } : undefined}
        value={block.texte}
        maxLength={200}
        placeholder={block.niveau === 3 ? 'Sous-titre' : 'Titre de section'}
        aria-label={block.niveau === 3 ? 'Texte du sous-titre' : 'Texte du titre'}
        onChange={(event) => onChange({ texte: event.target.value.replace(/[\r\n]+/g, ' ') })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
    </div>
  );
}

export function PhotoBlock({ block, pageId, onChange, onPickFile }) {
  const inputRef = useRef(null);
  const source = mediaSource(block, pageId);
  const busy = block.progression != null;
  return (
    <div className="rpe-media">
      {source ? (
        <figure className="rpe-photo-preview">
          <img src={source} alt={block.legende || 'Aperçu de la photo'} />
        </figure>
      ) : (
        <button type="button" className="rpe-dropzone" onClick={() => inputRef.current?.click()}>
          <IconImage />
          <strong>Choisir une photo</strong>
          <span>ou glissez-la ici — JPEG, PNG, WebP ou GIF, 15 Mo au plus</span>
        </button>
      )}
      <FilePicker accept={PHOTO_ACCEPT} inputRef={inputRef} onPickFile={onPickFile} />
      <UploadState block={block} />
      {source && (
        <button type="button" className="btn-outline btn-sm rpe-replace" onClick={() => inputRef.current?.click()} disabled={busy}>
          Remplacer la photo
        </button>
      )}
      <input
        className="rpe-caption"
        value={block.legende || ''}
        maxLength={300}
        placeholder="Légende (facultative)"
        aria-label="Légende de la photo"
        onChange={(event) => onChange({ legende: event.target.value })}
      />
    </div>
  );
}

export function VideoBlock({ block, pageId, onChange, onPickFile }) {
  const inputRef = useRef(null);
  const isLink = block.source === 'lien';
  const parsed = isLink && block.url ? lienVideo(block.url) : null;
  const source = isLink ? null : mediaSource(block, pageId);
  const busy = block.progression != null;
  return (
    <div className="rpe-media">
      <div className="rpe-segmented" role="group" aria-label="Source de la vidéo">
        <button
          type="button"
          className={`rpe-segment${!isLink ? ' rpe-segment--active' : ''}`}
          aria-pressed={!isLink}
          onClick={() => onChange({ source: 'fichier' })}
        >
          Fichier vidéo
        </button>
        <button
          type="button"
          className={`rpe-segment${isLink ? ' rpe-segment--active' : ''}`}
          aria-pressed={isLink}
          onClick={() => onChange({ source: 'lien' })}
        >
          Lien YouTube ou Vimeo
        </button>
      </div>

      {isLink ? (
        <>
          <input
            className="form-input rpe-url-input"
            type="url"
            inputMode="url"
            value={block.url || ''}
            placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…"
            aria-label="Lien de la vidéo YouTube ou Vimeo"
            onChange={(event) => onChange({ url: event.target.value })}
          />
          {block.url && !parsed && (
            <p className="rpe-field-error" role="alert">
              Collez un lien YouTube ou Vimeo valide.
            </p>
          )}
          {parsed && (
            <div className="rp-embed">
              <iframe
                src={parsed.url}
                title="Aperçu de la vidéo"
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
        </>
      ) : (
        <>
          {source ? (
            <div className="rp-video">
              <video src={source} controls preload="metadata" playsInline />
            </div>
          ) : (
            <button type="button" className="rpe-dropzone" onClick={() => inputRef.current?.click()}>
              <IconVideo />
              <strong>Choisir une vidéo</strong>
              <span>ou glissez-la ici — MP4, WebM ou MOV</span>
            </button>
          )}
          <FilePicker accept={VIDEO_ACCEPT} inputRef={inputRef} onPickFile={onPickFile} />
          <UploadState block={block} />
          {source && (
            <button type="button" className="btn-outline btn-sm rpe-replace" onClick={() => inputRef.current?.click()} disabled={busy}>
              Remplacer la vidéo
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function DocumentBlock({ block, onChange, onPickFile }) {
  const inputRef = useRef(null);
  const busy = block.progression != null;
  const attached = Boolean(block.fichier);
  let status = 'PDF joint : les lecteurs le voient page par page.';
  if (busy) status = 'Envoi en cours…';
  else if (isUploadToken(block.fichier)) status = 'PDF prêt : ses pages s’afficheront après l’enregistrement.';
  return (
    <div className="rpe-media">
      {attached || busy ? (
        <div className="rpe-doc-card">
          <span className="rp-document-icon" aria-hidden="true">
            <IconFileText />
          </span>
          <span className="rpe-doc-text">
            <strong>{block.nom || 'Document PDF'}</strong>
            <span>{status}</span>
          </span>
        </div>
      ) : (
        <button type="button" className="rpe-dropzone" onClick={() => inputRef.current?.click()}>
          <IconPaperclip />
          <strong>Choisir un document PDF</strong>
          <span>ou glissez-le ici — PDF, 20 Mo au plus</span>
        </button>
      )}
      <FilePicker accept={DOCUMENT_ACCEPT} inputRef={inputRef} onPickFile={onPickFile} />
      <UploadState block={block} />
      {attached && (
        <button type="button" className="btn-outline btn-sm rpe-replace" onClick={() => inputRef.current?.click()} disabled={busy}>
          Remplacer le document
        </button>
      )}
      <input
        className="rpe-caption"
        value={block.nom || ''}
        maxLength={MAX_DOCUMENT_NAME_CHARS}
        placeholder="Nom affiché du document"
        aria-label="Nom affiché du document"
        onChange={(event) => onChange({ nom: event.target.value })}
      />
    </div>
  );
}
