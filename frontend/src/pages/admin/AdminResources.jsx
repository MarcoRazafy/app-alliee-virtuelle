import { useEffect, useRef, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import * as userService from '../../services/userService';
import { formatBytes, formatDateTime } from '../../utils/formatters';
import { notifySuccess, notifyError } from '../../utils/toast';
import DocumentEditor from '../../components/resources/DocumentEditor';
import ResourceViewer from '../../components/resources/ResourceViewer';
import ResourceTrashModal from '../../components/resources/ResourceTrashModal';
import ResourceShareModal from '../../components/resources/ResourceShareModal';
import {
  IconFolder,
  IconFileText,
  IconTrash,
  IconUsers,
  IconPencil,
  IconSearch,
  IconDownload,
  IconArrowRight,
} from '../../components/icons';
import { PageSkeleton } from '../../components/Skeleton';
import '../../styles/resources.css';

const TABS = [
  { value: 'INTERNE', label: 'Interne' },
  { value: 'CLIENT', label: 'Client' },
  // Espace réservé à l'équipe d'administration : le serveur refuse ce type à un employé
  // (dossiers, listes de fichiers, aperçu et téléchargement), et la page employé ne
  // propose pas l'onglet. L'onglet n'existe donc QUE dans cette page admin.
  { value: 'ADMIN', label: 'Admin' },
];

function AdminResources() {
  const [tab, setTab] = useState('INTERNE');
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);
  const [editor, setEditor] = useState(null); // { document } (édition) ou { document: null } (création)
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState({ folders: [], files: [] });
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusyKey, setTrashBusyKey] = useState(null);
  const uploadInputRef = useRef(null);

  const [newFolderName, setNewFolderName] = useState('');

  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const [shareFolderId, setShareFolderId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [shareUserIds, setShareUserIds] = useState([]);
  const [sharePermission, setSharePermission] = useState('LECTURE_SEULE');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [shares, setShares] = useState([]);

  function loadFolders() {
    setLoadingFolders(true);
    return resourceService
      .getFolders(tab)
      .then(setFolders)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les dossiers'))
      .finally(() => setLoadingFolders(false));
  }

  async function loadTrash() {
    setTrashLoading(true);
    try {
      const data = await resourceService.getTrash();
      setTrash({ folders: data.folders || [], files: data.files || [] });
      return data;
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger la corbeille');
      return { folders: [], files: [] };
    } finally {
      setTrashLoading(false);
    }
  }

  useEffect(() => {
    setSelectedFolder(null);
    setFiles([]);
    setSelectedFileIds([]);
    setFileSearch('');
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    loadTrash();
  }, []);

  async function openFolder(folder) {
    setSelectedFolder(folder);
    setSelectedFileIds([]);
    setFileSearch('');
    setLoadingFiles(true);
    try {
      const data = await resourceService.getFolderFiles(folder.id);
      setFiles(data);
    } catch (err) {
      setFiles([]);
      notifyError(err.response?.data?.error || 'Impossible de charger les fichiers');
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await resourceService.createFolder({ name: newFolderName, type: tab });
      notifySuccess('Dossier créé');
      setNewFolderName('');
      loadFolders();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de créer le dossier');
    }
  }

  function startRename(folder) {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  }

  async function handleRename(folderId) {
    if (!renameValue.trim()) return;
    try {
      await resourceService.renameFolder(folderId, renameValue);
      notifySuccess('Dossier renommé');
      setRenamingFolderId(null);
      loadFolders();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renommer le dossier');
    }
  }

  async function handleDeleteFolder(folder) {
    if (
      !window.confirm(
        `Placer le dossier « ${folder.name} » dans la corbeille ?\n\nSon contenu pourra être restauré depuis la page Ressources.`
      )
    ) {
      return;
    }
    try {
      await resourceService.deleteFolder(folder.id);
      notifySuccess('Dossier placé dans la corbeille');
      if (selectedFolder?.id === folder.id) {
        setSelectedFolder(null);
        setFiles([]);
        setSelectedFileIds([]);
      }
      loadFolders();
      loadTrash();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer le dossier');
    }
  }

  async function refreshFiles() {
    if (!selectedFolder) return;
    try {
      const data = await resourceService.getFolderFiles(selectedFolder.id);
      setFiles(data);
      loadFolders();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de recharger les fichiers');
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedFolder) return;
    setUploading(true);
    try {
      await resourceService.uploadFile(selectedFolder.id, file);
      notifySuccess('Fichier importé');
      await refreshFiles();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'importer le fichier");
    } finally {
      setUploading(false);
    }
  }

  function openViewer(file) {
    setViewerFile(file);
  }

  function openNewDocument() {
    setEditor({ document: null });
  }

  function openEditDocument(doc) {
    setViewerFile(null);
    setEditor({ document: doc });
  }

  async function handleEditorSaved() {
    setEditor(null);
    await refreshFiles();
  }

  function toggleFileSelect(id) {
    setSelectedFileIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDeleteSelection() {
    if (!window.confirm(`Placer ${selectedFileIds.length} fichier(s) dans la corbeille ?`)) return;
    try {
      await Promise.all(selectedFileIds.map((id) => resourceService.deleteFile(id)));
      notifySuccess(`${selectedFileIds.length} fichier(s) placé(s) dans la corbeille`);
      setSelectedFileIds([]);
      const data = await resourceService.getFolderFiles(selectedFolder.id);
      setFiles(data);
      loadFolders();
      loadTrash();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer la sélection');
    }
  }

  async function openShareModal(folder) {
    setShareFolderId(folder.id);
    setShareUserIds([]);
    setSharePermission('LECTURE_SEULE');
    setShareExpiresAt('');
    try {
      const data = await resourceService.getFolderShares(folder.id);
      setShares(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les partages');
    }
  }

  function toggleShareUser(id) {
    setShareUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleShare(e) {
    e.preventDefault();
    if (shareUserIds.length === 0) return;
    try {
      await resourceService.shareFolder(shareFolderId, {
        user_ids: shareUserIds,
        permission_type: sharePermission,
        expires_at: shareExpiresAt || undefined,
      });
      notifySuccess('Dossier partagé');
      const data = await resourceService.getFolderShares(shareFolderId);
      setShares(data);
      setShareUserIds([]);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de partager le dossier');
    }
  }

  async function handleRevoke(shareId) {
    if (!window.confirm('Révoquer ce partage ?')) return;
    try {
      await resourceService.revokeShare(shareId);
      notifySuccess('Partage révoqué');
      const data = await resourceService.getFolderShares(shareFolderId);
      setShares(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de révoquer le partage');
    }
  }

  async function handleRestoreTrash(type, item) {
    const key = `${type}:${item.id}`;
    if (trashBusyKey) return;
    setTrashBusyKey(key);
    try {
      if (type === 'folder') await resourceService.restoreFolder(item.id);
      else await resourceService.restoreFile(item.id);
      notifySuccess(type === 'folder' ? 'Dossier restauré' : 'Fichier restauré');
      await Promise.all([loadTrash(), loadFolders()]);
      if (type === 'file' && selectedFolder?.id === item.folder_id) await refreshFiles();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de restaurer cet élément');
    } finally {
      setTrashBusyKey(null);
    }
  }

  async function handlePermanentDelete(type, item) {
    const key = `${type}:${item.id}`;
    if (trashBusyKey) return;
    const label = type === 'folder' ? `le dossier « ${item.name} » et tout son contenu` : `« ${item.file_name} »`;
    if (!window.confirm(`Supprimer définitivement ${label} ?\n\nCette action est irréversible.`)) return;

    setTrashBusyKey(key);
    try {
      if (type === 'folder') await resourceService.permanentlyDeleteFolder(item.id);
      else await resourceService.permanentlyDeleteFile(item.id);
      notifySuccess(type === 'folder' ? 'Dossier supprimé définitivement' : 'Fichier supprimé définitivement');
      await loadTrash();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer définitivement cet élément');
    } finally {
      setTrashBusyKey(null);
    }
  }

  const shareFolderName = folders.find((f) => f.id === shareFolderId)?.name;
  const trashCount = trash.folders.length + trash.files.length;
  const filteredFiles = files.filter((file) =>
    file.file_name.toLowerCase().includes(fileSearch.trim().toLowerCase())
  );

  if (loadingFolders && folders.length === 0) return <PageSkeleton variant="cards" />;

  return (
    <section className="resources-page">
      <div className="resources-toolbar">
        <div className="resources-tabs" role="tablist" aria-label="Type de ressources">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              className={`filter-chip${tab === item.value ? ' filter-chip--active' : ''}`}
              onClick={() => setTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="resources-trash-trigger"
          onClick={() => {
            setTrashOpen(true);
            loadTrash();
          }}
        >
          <IconTrash />
          Corbeille
          {trashCount > 0 && <span>{trashCount}</span>}
        </button>
      </div>

      <div className="resources-shell">
        <aside className="side-card resources-folder-panel">
          <div className="side-card-header">
            <p className="side-card-title">Dossiers</p>
            <span className="resources-count-pill">{folders.length}</span>
          </div>

          <form className="resources-create-form" onSubmit={handleCreateFolder}>
            <input
              className="form-input"
              placeholder="Nouveau dossier..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!newFolderName.trim()}>
              Ajouter
            </button>
          </form>

          {loadingFolders && <div className="empty-state">Chargement...</div>}
          {!loadingFolders && folders.length === 0 && (
            <div className="empty-state">Aucun dossier dans cet espace.</div>
          )}

          {!loadingFolders && folders.length > 0 && (
            <ul className="resources-folder-list">
              {folders.map((folder) => (
                <li key={folder.id}>
                  {renamingFolderId === folder.id ? (
                    <form
                      className="resources-rename-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleRename(folder.id);
                      }}
                    >
                      <input
                        className="form-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="btn-primary btn-sm">
                        OK
                      </button>
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => setRenamingFolderId(null)}
                      >
                        Annuler
                      </button>
                    </form>
                  ) : (
                    <div
                      className={`resources-folder-row${
                        selectedFolder?.id === folder.id ? ' resources-folder-row--active' : ''
                      }`}
                    >
                      <button type="button" className="resources-folder-item" onClick={() => openFolder(folder)}>
                        <span className="resources-folder-icon">
                          <IconFolder />
                        </span>
                        <span className="resources-folder-info">
                          <strong>{folder.name}</strong>
                          <span>
                            {folder.file_count} fichier{Number(folder.file_count) > 1 ? 's' : ''}
                          </span>
                        </span>
                      </button>
                      <div className="resources-folder-actions">
                        <button
                          type="button"
                          className="icon-link-btn"
                          onClick={() => startRename(folder)}
                          aria-label="Renommer le dossier"
                          title="Renommer"
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="icon-link-btn"
                          onClick={() => openShareModal(folder)}
                          aria-label="Partager le dossier"
                          title="Partager"
                        >
                          <IconUsers />
                        </button>
                        <button
                          type="button"
                          className="icon-link-btn icon-link-btn--danger"
                          onClick={() => handleDeleteFolder(folder)}
                          aria-label="Supprimer le dossier"
                          title="Supprimer"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="side-card resources-files-panel">
          <div className="side-card-header">
            <p className="side-card-title">{selectedFolder ? selectedFolder.name : 'Fichiers'}</p>
            {selectedFolder && selectedFileIds.length > 0 && (
              <button type="button" className="btn-danger btn-sm" onClick={handleDeleteSelection}>
                <IconTrash /> Supprimer ({selectedFileIds.length})
              </button>
            )}
          </div>

          {!selectedFolder && (
            <div className="empty-state">Sélectionnez un dossier pour gérer ses fichiers.</div>
          )}

          {selectedFolder && (
            <>
              <div className="resources-file-actions">
                <input
                  ref={uploadInputRef}
                  type="file"
                  hidden
                  onChange={handleUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt"
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                >
                  <IconDownload /> {uploading ? 'Import…' : 'Importer un fichier'}
                </button>
                <button type="button" className="btn-outline" onClick={openNewDocument}>
                  <IconPencil /> Nouveau document
                </button>
              </div>

              <label className="filter-search resources-search">
                <IconSearch />
                <input
                  type="search"
                  placeholder="Rechercher un fichier..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  aria-label="Rechercher un fichier"
                />
              </label>

              {loadingFiles && <div className="empty-state">Chargement...</div>}
              {!loadingFiles && filteredFiles.length === 0 && (
                <div className="empty-state">
                  {fileSearch.trim()
                    ? 'Aucun fichier ne correspond à cette recherche.'
                    : 'Ce dossier est vide. Importez un fichier ou créez un document.'}
                </div>
              )}

              {!loadingFiles && filteredFiles.length > 0 && (
                <div className="task-table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th className="resources-check-col" />
                        <th>Nom</th>
                        <th>Type</th>
                        <th>Taille</th>
                        <th>Ajouté par</th>
                        <th className="resources-actions-col" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFiles.map((file) => (
                        <tr key={file.id} className={selectedFileIds.includes(file.id) ? 'is-selected' : ''}>
                          <td className="resources-check-col">
                            <input
                              type="checkbox"
                              checked={selectedFileIds.includes(file.id)}
                              onChange={() => toggleFileSelect(file.id)}
                              aria-label={`Sélectionner ${file.file_name}`}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="resources-file-name-cell resources-file-name-btn"
                              onClick={() => openViewer(file)}
                            >
                              <span className="resources-file-icon">
                                {file.kind === 'DOCUMENT' ? <IconPencil /> : <IconFileText />}
                              </span>
                              {file.file_name}
                            </button>
                          </td>
                          <td>{file.file_type || '—'}</td>
                          <td>{file.kind === 'DOCUMENT' ? '—' : formatBytes(file.file_size)}</td>
                          <td>{file.created_by_name}</td>
                          <td className="resources-actions-col">
                            <div className="resources-row-actions">
                              {file.kind === 'DOCUMENT' && (
                                <button
                                  type="button"
                                  className="icon-link-btn"
                                  onClick={() => openEditDocument(file)}
                                  aria-label="Éditer le document"
                                  title="Éditer"
                                >
                                  <IconPencil />
                                </button>
                              )}
                              <button
                                type="button"
                                className="icon-link-btn"
                                onClick={() => openViewer(file)}
                                aria-label="Ouvrir"
                                title="Ouvrir"
                              >
                                <IconArrowRight />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editor && (
        <DocumentEditor
          folderId={selectedFolder?.id}
          document={editor.document}
          onClose={() => setEditor(null)}
          onSaved={handleEditorSaved}
        />
      )}

      {viewerFile && (
        <ResourceViewer
          file={viewerFile}
          canManage
          onClose={() => setViewerFile(null)}
          onEdit={openEditDocument}
        />
      )}

      {trashOpen && (
        <ResourceTrashModal
          onClose={() => setTrashOpen(false)}
          loading={trashLoading}
          count={trashCount}
          trash={trash}
          busyKey={trashBusyKey}
          onRestore={handleRestoreTrash}
          onPermanentDelete={handlePermanentDelete}
        />
      )}

      {shareFolderId && (
        <ResourceShareModal
          folderName={shareFolderName}
          onClose={() => setShareFolderId(null)}
          onSubmit={handleShare}
          employees={employees}
          selectedUserIds={shareUserIds}
          onToggleUser={toggleShareUser}
          permission={sharePermission}
          onPermissionChange={setSharePermission}
          expiresAt={shareExpiresAt}
          onExpiresChange={setShareExpiresAt}
          shares={shares}
          onRevoke={handleRevoke}
        />
      )}
    </section>
  );
}

export default AdminResources;
