import { useEffect, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import * as resourceService from '../services/resourceService';
import { formatBytes } from '../utils/formatters';
import { notifyError } from '../utils/toast';
import ResourceViewer from '../components/resources/ResourceViewer';
import { IconFolder, IconFileText, IconSearch, IconArrowRight, IconPencil } from '../components/icons';
import '../styles/resources.css';

const TABS = [
  { value: 'INTERNE', label: 'Internal' },
  { value: 'CLIENT', label: 'Client' },
];

function Resources() {
  const [tab, setTab] = useState('INTERNE');
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [search, setSearch] = useState('');
  const [viewerFile, setViewerFile] = useState(null);

  useEffect(() => {
    setSelectedFolder(null);
    setFiles([]);
    setSearch('');
    setLoadingFolders(true);
    resourceService
      .getFolders(tab)
      .then(setFolders)
      .catch((err) => notifyError(err.response?.data?.error || 'Unable to load folders'))
      .finally(() => setLoadingFolders(false));
  }, [tab]);

  async function openFolder(folder) {
    setSelectedFolder(folder);
    setSearch('');
    setLoadingFiles(true);
    try {
      const data = await resourceService.getFolderFiles(folder.id);
      setFiles(data);
    } catch (err) {
      setFiles([]);
      notifyError(err.response?.data?.error || 'Unable to load files');
    } finally {
      setLoadingFiles(false);
    }
  }

  const filteredFiles = files.filter((file) => file.file_name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <EmployeeLayout
      skeleton={loadingFolders && folders.length === 0 ? 'cards' : null}
      title="Resources"
      breadcrumb={[
        { label: 'Home', to: '/dashboard' },
        { label: 'Resources' },
        ...(selectedFolder ? [{ label: selectedFolder.name }] : []),
      ]}
      subtitle="Internal documents and files shared with clients"
    >
      <section className="resources-page">
        <div className="resources-tabs" role="tablist" aria-label="Resource type">
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

        <div className="resources-shell">
          <aside className="side-card resources-folder-panel">
            <div className="side-card-header">
              <p className="side-card-title">Folders</p>
            </div>

            {loadingFolders && <div className="empty-state">Loading...</div>}
            {!loadingFolders && folders.length === 0 && <div className="empty-state">No folder available.</div>}

            {!loadingFolders && folders.length > 0 && (
              <ul className="resources-folder-list">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className={`resources-folder-item${
                        selectedFolder?.id === folder.id ? ' resources-folder-item--active' : ''
                      }`}
                      onClick={() => openFolder(folder)}
                    >
                      <span className="resources-folder-icon">
                        <IconFolder />
                      </span>
                      <span className="resources-folder-info">
                        <strong>{folder.name}</strong>
                        <span>
                          {folder.file_count} file{Number(folder.file_count) > 1 ? 's' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="side-card resources-files-panel">
            <div className="side-card-header">
              <p className="side-card-title">{selectedFolder ? selectedFolder.name : 'Files'}</p>
            </div>

            {!selectedFolder && (
              <div className="empty-state">Select a folder to view its files.</div>
            )}

            {selectedFolder && (
              <>
                <label className="filter-search resources-search">
                  <IconSearch />
                  <input
                    type="search"
                    placeholder="Search a file..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search a file"
                  />
                </label>

                {loadingFiles && <div className="empty-state">Loading...</div>}
                {!loadingFiles && filteredFiles.length === 0 && (
                  <div className="empty-state">
                    {search.trim() ? 'No file matches this search.' : 'This folder is empty.'}
                  </div>
                )}

                {!loadingFiles && filteredFiles.length > 0 && (
                  <div className="task-table-wrap">
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Added on</th>
                          <th className="resources-actions-col" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFiles.map((file) => (
                          <tr key={file.id}>
                            <td>
                              <button
                                type="button"
                                className="resources-file-name-cell resources-file-name-btn"
                                onClick={() => setViewerFile(file)}
                              >
                                <span className="resources-file-icon">
                                  {file.kind === 'DOCUMENT' ? <IconPencil /> : <IconFileText />}
                                </span>
                                {file.file_name}
                              </button>
                            </td>
                            <td>{file.file_type || '—'}</td>
                            <td>{file.kind === 'DOCUMENT' ? '—' : formatBytes(file.file_size)}</td>
                            <td>{new Date(file.created_at).toLocaleDateString('en-US')}</td>
                            <td className="resources-actions-col">
                              <button
                                type="button"
                                className="icon-link-btn"
                                onClick={() => setViewerFile(file)}
                                aria-label="Open"
                                title="Open"
                              >
                                <IconArrowRight />
                              </button>
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

        {viewerFile && <ResourceViewer file={viewerFile} onClose={() => setViewerFile(null)} />}
      </section>
    </EmployeeLayout>
  );
}

export default Resources;
