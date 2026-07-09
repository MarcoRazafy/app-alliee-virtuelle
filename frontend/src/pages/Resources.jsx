import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as resourceService from '../services/resourceService';

function formatBytes(bytes) {
  const n = Number(bytes);
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${n} o`;
}

function Resources() {
  const [tab, setTab] = useState('INTERNE');
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedFolder(null);
    setFiles([]);
    setSearch('');
    setError('');

    resourceService
      .getFolders(tab)
      .then(setFolders)
      .catch((err) => setError(err.response?.data?.error || 'Impossible de charger les dossiers'));
  }, [tab]);

  async function openFolder(folder) {
    setError('');
    setSelectedFolder(folder);
    try {
      const data = await resourceService.getFolderFiles(folder.id);
      setFiles(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les fichiers');
    }
  }

  const filteredFiles = files.filter((f) => f.file_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Ressources</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

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
        {selectedFolder && <> &gt; {selectedFolder.name}</>}
      </p>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
          <h2>Dossiers</h2>
          {folders.length === 0 && <p>Aucun dossier.</p>}
          <ul>
            {folders.map((folder) => (
              <li key={folder.id}>
                <button onClick={() => openFolder(folder)}>
                  {folder.name} ({folder.file_count} fichiers)
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 2, border: '1px solid black', padding: '10px' }}>
          <h2>Fichiers</h2>
          {!selectedFolder && <p>Sélectionnez un dossier.</p>}
          {selectedFolder && (
            <>
              <input placeholder="Rechercher un fichier" value={search} onChange={(e) => setSearch(e.target.value)} />
              {filteredFiles.length === 0 && <p>Aucun fichier.</p>}
              <ul>
                {filteredFiles.map((file) => (
                  <li key={file.id}>
                    {file.file_name} — {file.file_type} — {formatBytes(file.file_size)} —{' '}
                    {new Date(file.created_at).toLocaleDateString('fr-FR')}
                    <a href={file.file_path} download>
                      {' '}
                      Télécharger
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Resources;
