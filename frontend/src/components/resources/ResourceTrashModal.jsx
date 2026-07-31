import { formatDateTime, formatBytes } from '../../utils/formatters';
import { IconX, IconTrash, IconFolder, IconFileText, IconRestore } from '../icons';

// Modale "Corbeille" des ressources (dossiers/fichiers supprimés) — présentationnelle.
// Extraite de AdminResources ; reçoit les données et les callbacks en props.
function ResourceTrashModal({ onClose, loading, count, trash, busyKey, onRestore, onPermanentDelete }) {
  return (
    <div className="resources-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="resources-modal resources-trash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resources-trash-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="resources-modal-head">
          <div>
            <p className="resources-modal-eyebrow">Ressources supprimées</p>
            <h2 id="resources-trash-title">Corbeille</h2>
          </div>
          <button type="button" className="resources-modal-close" onClick={onClose} aria-label="Fermer la corbeille">
            <IconX />
          </button>
        </div>

        <p className="resources-trash-hint">
          Restaurez vos dossiers et fichiers, ou supprimez-les définitivement pour libérer de l’espace.
        </p>

        <div className="resources-trash-content" aria-live="polite">
          {loading && <div className="resources-trash-empty">Chargement de la corbeille…</div>}
          {!loading && count === 0 && (
            <div className="resources-trash-empty">
              <IconTrash />
              <strong>La corbeille est vide</strong>
              <span>Les éléments supprimés depuis Ressources apparaîtront ici.</span>
            </div>
          )}

          {!loading && trash.folders.length > 0 && (
            <section className="resources-trash-section" aria-labelledby="trash-folders-title">
              <h3 id="trash-folders-title">Dossiers ({trash.folders.length})</h3>
              {trash.folders.map((folder) => {
                const key = `folder:${folder.id}`;
                const busy = busyKey === key;
                return (
                  <article key={folder.id} className="resources-trash-row">
                    <span className="resources-trash-item-icon">
                      <IconFolder />
                    </span>
                    <div className="resources-trash-info">
                      <strong>{folder.name}</strong>
                      <span>
                        {folder.type === 'CLIENT' ? 'Client' : 'Interne'} · {folder.file_count} fichier
                        {Number(folder.file_count) > 1 ? 's' : ''}
                      </span>
                      <small>
                        Supprimé {formatDateTime(folder.deleted_at)}
                        {folder.deleted_by_name ? ` par ${folder.deleted_by_name}` : ''}
                      </small>
                    </div>
                    <div className="resources-trash-actions">
                      <button
                        type="button"
                        className="resources-trash-restore"
                        onClick={() => onRestore('folder', folder)}
                        disabled={busy || Boolean(busyKey)}
                      >
                        <IconRestore />
                        {busy ? 'Traitement…' : 'Restaurer'}
                      </button>
                      <button
                        type="button"
                        className="resources-trash-delete"
                        onClick={() => onPermanentDelete('folder', folder)}
                        disabled={busy || Boolean(busyKey)}
                        aria-label={`Supprimer définitivement le dossier ${folder.name}`}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {!loading && trash.files.length > 0 && (
            <section className="resources-trash-section" aria-labelledby="trash-files-title">
              <h3 id="trash-files-title">Fichiers ({trash.files.length})</h3>
              {trash.files.map((file) => {
                const key = `file:${file.id}`;
                const busy = busyKey === key;
                return (
                  <article key={file.id} className="resources-trash-row">
                    <span className="resources-trash-item-icon">
                      <IconFileText />
                    </span>
                    <div className="resources-trash-info">
                      <strong>{file.file_name}</strong>
                      <span>
                        Dossier : {file.folder_name} ·{' '}
                        {file.kind === 'DOCUMENT' ? 'Document' : formatBytes(file.file_size || 0)}
                      </span>
                      <small>
                        Supprimé {formatDateTime(file.deleted_at)}
                        {file.deleted_by_name ? ` par ${file.deleted_by_name}` : ''}
                      </small>
                    </div>
                    <div className="resources-trash-actions">
                      <button
                        type="button"
                        className="resources-trash-restore"
                        onClick={() => onRestore('file', file)}
                        disabled={busy || Boolean(busyKey)}
                      >
                        <IconRestore />
                        {busy ? 'Traitement…' : 'Restaurer'}
                      </button>
                      <button
                        type="button"
                        className="resources-trash-delete"
                        onClick={() => onPermanentDelete('file', file)}
                        disabled={busy || Boolean(busyKey)}
                        aria-label={`Supprimer définitivement ${file.file_name}`}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResourceTrashModal;
