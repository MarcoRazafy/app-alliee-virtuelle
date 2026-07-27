import { IconX } from '../icons';

const PERMISSION_LABELS = {
  LECTURE_SEULE: 'Lecture seule',
  LECTURE_ECRITURE: 'Lecture-écriture',
};

// Modale de partage d'un dossier de ressources — présentationnelle.
// Extraite de AdminResources ; reçoit l'état et les callbacks en props.
function ResourceShareModal({
  folderName,
  onClose,
  onSubmit,
  employees,
  selectedUserIds,
  onToggleUser,
  permission,
  onPermissionChange,
  expiresAt,
  onExpiresChange,
  shares,
  onRevoke,
}) {
  return (
    <div className="resources-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="resources-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="resources-modal-head">
          <div>
            <p className="resources-modal-eyebrow">Partage de dossier</p>
            <h2 id="share-title">{folderName}</h2>
          </div>
          <button type="button" className="resources-modal-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        <form className="resources-modal-body" onSubmit={onSubmit}>
          <p className="resources-modal-label">
            Employés ({selectedUserIds.length} sélectionné{selectedUserIds.length > 1 ? 's' : ''})
          </p>
          <div className="resources-share-members">
            {employees.length === 0 && <p className="empty-state">Aucun employé actif.</p>}
            {employees.map((emp) => (
              <label
                key={emp.id}
                className={`resources-member-chip${selectedUserIds.includes(emp.id) ? ' resources-member-chip--on' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(emp.id)}
                  onChange={() => onToggleUser(emp.id)}
                />
                {emp.full_name}
              </label>
            ))}
          </div>

          <div className="resources-modal-row">
            <label className="form-field">
              <span className="form-label">Permission</span>
              <select className="form-select" value={permission} onChange={(e) => onPermissionChange(e.target.value)}>
                <option value="LECTURE_SEULE">Lecture seule</option>
                <option value="LECTURE_ECRITURE">Lecture-écriture</option>
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Expiration (optionnelle)</span>
              <input
                className="form-input"
                type="date"
                value={expiresAt}
                onChange={(e) => onExpiresChange(e.target.value)}
              />
            </label>
          </div>

          <div className="resources-modal-foot">
            <button type="button" className="btn-outline" onClick={onClose}>
              Fermer
            </button>
            <button type="submit" className="btn-primary" disabled={selectedUserIds.length === 0}>
              Partager
            </button>
          </div>
        </form>

        <div className="resources-share-existing">
          <p className="resources-modal-label">Partages existants</p>
          {shares.length === 0 && <p className="empty-state">Aucun partage pour l'instant.</p>}
          {shares.length > 0 && (
            <ul className="resources-share-list">
              {shares.map((share) => (
                <li key={share.id}>
                  <span className="resources-share-info">
                    <strong>{share.shared_with_name}</strong>
                    <span>
                      {PERMISSION_LABELS[share.permission_type] || share.permission_type}
                      {share.expires_at && ` · expire le ${new Date(share.expires_at).toLocaleDateString('fr-FR')}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="icon-link-btn icon-link-btn--danger"
                    onClick={() => onRevoke(share.id)}
                    aria-label="Révoquer le partage"
                    title="Révoquer"
                  >
                    <IconX />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResourceShareModal;
