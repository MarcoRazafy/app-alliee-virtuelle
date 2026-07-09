import { useEffect, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import * as userService from '../../services/userService';
import { formatBytes } from '../../utils/formatters';
import { notifySuccess, notifyError } from '../../utils/toast';

function AdminResources() {
  const [tab, setTab] = useState('INTERNE');
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFile, setNewFile] = useState({ file_name: '', file_type: '', file_size: '' });

  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const [shareFolderId, setShareFolderId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [shareUserIds, setShareUserIds] = useState([]);
  const [sharePermission, setSharePermission] = useState('LECTURE_SEULE');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [shares, setShares] = useState([]);

  function loadFolders() {
    resourceService
      .getFolders(tab)
      .then(setFolders)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les dossiers'));
  }

  useEffect(() => {
    setSelectedFolder(null);
    setFiles([]);
    setSelectedFileIds([]);
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    userService.getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' }).then(setEmployees);
  }, []);

  async function openFolder(folder) {
    setSelectedFolder(folder);
    setSelectedFileIds([]);
    try {
      const data = await resourceService.getFolderFiles(folder.id);
      setFiles(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les fichiers');
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
    if (!window.confirm(`Supprimer le dossier "${folder.name}" ?`)) return;
    try {
      await resourceService.deleteFolder(folder.id);
      notifySuccess('Dossier supprimé');
      if (selectedFolder?.id === folder.id) setSelectedFolder(null);
      loadFolders();
    } catch (err) {
      if (err.response?.status === 409) {
        notifyError(err.response.data.error);
      } else {
        notifyError(err.response?.data?.error || 'Impossible de supprimer le dossier');
      }
    }
  }

  async function handleAddFile(e) {
    e.preventDefault();
    if (!newFile.file_name.trim() || !selectedFolder) return;
    try {
      await resourceService.createFile(selectedFolder.id, {
        file_name: newFile.file_name,
        file_type: newFile.file_type,
        file_size: Number(newFile.file_size) || 0,
      });
      notifySuccess('Fichier ajouté');
      setNewFile({ file_name: '', file_type: '', file_size: '' });
      const data = await resourceService.getFolderFiles(selectedFolder.id);
      setFiles(data);
      loadFolders();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter le fichier");
    }
  }

  function toggleFileSelect(id) {
    setSelectedFileIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDeleteSelection() {
    if (!window.confirm(`Supprimer ${selectedFileIds.length} fichier(s) ?`)) return;
    try {
      await Promise.all(selectedFileIds.map((id) => resourceService.deleteFile(id)));
      notifySuccess(`${selectedFileIds.length} fichier(s) supprimé(s)`);
      setSelectedFileIds([]);
      const data = await resourceService.getFolderFiles(selectedFolder.id);
      setFiles(data);
      loadFolders();
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

  const shareFolderName = folders.find((f) => f.id === shareFolderId)?.name;

  return (
    <div>
      <h1>Ressources</h1>

      <div>
        <button onClick={() => setTab('INTERNE')} disabled={tab === 'INTERNE'}>
          Interne
        </button>
        <button onClick={() => setTab('CLIENT')} disabled={tab === 'CLIENT'}>
          Client
        </button>
      </div>

      <p>
        Ressources &gt; {tab === 'INTERNE' ? 'Interne' : 'Client'}
        {selectedFolder && (
          <>
            {' '}
            &gt; <button onClick={() => setSelectedFolder(selectedFolder)}>{selectedFolder.name}</button>
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
          <h2>Dossiers</h2>
          <form onSubmit={handleCreateFolder}>
            <input placeholder="Nom du nouveau dossier" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
            <button type="submit">Ajouter un dossier</button>
          </form>

          <ul>
            {folders.map((folder) => (
              <li key={folder.id} style={{ marginBottom: '8px' }}>
                {renamingFolderId === folder.id ? (
                  <span>
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                    <button onClick={() => handleRename(folder.id)}>Valider</button>
                    <button onClick={() => setRenamingFolderId(null)}>Annuler</button>
                  </span>
                ) : (
                  <span>
                    <button onClick={() => openFolder(folder)}>
                      {folder.name} ({folder.file_count} fichiers)
                    </button>
                    <button onClick={() => startRename(folder)}>Renommer</button>
                    <button onClick={() => handleDeleteFolder(folder)}>Supprimer</button>
                    <button onClick={() => openShareModal(folder)}>Partager</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 2, border: '1px solid black', padding: '10px' }}>
          <h2>Fichiers</h2>
          {!selectedFolder && <p>Sélectionnez un dossier.</p>}
          {selectedFolder && (
            <>
              <form onSubmit={handleAddFile}>
                <input
                  placeholder="Nom du fichier"
                  value={newFile.file_name}
                  onChange={(e) => setNewFile({ ...newFile, file_name: e.target.value })}
                />
                <input
                  placeholder="Type (PDF, DOCX...)"
                  value={newFile.file_type}
                  onChange={(e) => setNewFile({ ...newFile, file_type: e.target.value })}
                />
                <input
                  placeholder="Taille (octets)"
                  type="number"
                  value={newFile.file_size}
                  onChange={(e) => setNewFile({ ...newFile, file_size: e.target.value })}
                />
                <button type="submit">Ajouter le fichier</button>
              </form>

              {selectedFileIds.length > 0 && (
                <button onClick={handleDeleteSelection}>Supprimer la sélection ({selectedFileIds.length})</button>
              )}

              {files.length === 0 && <p>Aucun fichier.</p>}
              {files.length > 0 && (
                <table border="1" cellPadding="6">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Nom</th>
                      <th>Type</th>
                      <th>Taille</th>
                      <th>Créé par</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedFileIds.includes(file.id)}
                            onChange={() => toggleFileSelect(file.id)}
                          />
                        </td>
                        <td>{file.file_name}</td>
                        <td>{file.file_type}</td>
                        <td>{formatBytes(file.file_size)}</td>
                        <td>{file.created_by_name}</td>
                        <td>{new Date(file.created_at).toLocaleDateString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {shareFolderId && (
        <div style={{ border: '1px solid black', padding: '10px', marginTop: '20px' }}>
          <h2>Partager "{shareFolderName}"</h2>
          <form onSubmit={handleShare}>
            {employees.map((emp) => (
              <label key={emp.id} style={{ marginRight: '10px' }}>
                <input type="checkbox" checked={shareUserIds.includes(emp.id)} onChange={() => toggleShareUser(emp.id)} />
                {emp.full_name}
              </label>
            ))}
            <div>
              <select value={sharePermission} onChange={(e) => setSharePermission(e.target.value)}>
                <option value="LECTURE_SEULE">Lecture seule</option>
                <option value="LECTURE_ECRITURE">Lecture-écriture</option>
              </select>
              <label>
                Expiration (optionnelle) :
                <input type="date" value={shareExpiresAt} onChange={(e) => setShareExpiresAt(e.target.value)} />
              </label>
              <button type="submit" disabled={shareUserIds.length === 0}>
                Partager
              </button>
              <button type="button" onClick={() => setShareFolderId(null)}>
                Fermer
              </button>
            </div>
          </form>

          <h3>Partages existants</h3>
          {shares.length === 0 && <p>Aucun partage.</p>}
          <ul>
            {shares.map((share) => (
              <li key={share.id}>
                {share.shared_with_name} — {share.permission_type}
                {share.expires_at && <span> — expire le {new Date(share.expires_at).toLocaleDateString('fr-FR')}</span>}
                <button onClick={() => handleRevoke(share.id)}>Révoquer</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AdminResources;
