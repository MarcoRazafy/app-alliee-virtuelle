import { useEffect, useState } from 'react';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';

// Arbre Space > Folder > List, sans mise en forme (le style viendra plus tard).
// onSelectList(listId, list) est appelé au clic sur une liste, pour que la page
// parente puisse filtrer ses tâches sur cette liste.
function HierarchyTree({ onSelectList, selectedListId }) {
  const [tree, setTree] = useState([]);
  // Un seul formulaire de création ouvert à la fois : { type: 'space'|'folder'|'list', parentId }
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState('');

  function loadTree() {
    hierarchyService
      .getSpacesTree()
      .then(setTree)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'arborescence"));
  }

  useEffect(loadTree, []);

  function startCreating(type, parentId) {
    setCreating({ type, parentId });
    setNewName('');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !creating) return;
    try {
      if (creating.type === 'space') {
        await hierarchyService.createSpace({ name: newName });
        notifySuccess('Espace créé');
      } else if (creating.type === 'folder') {
        await hierarchyService.createFolder({ name: newName, space_id: creating.parentId });
        notifySuccess('Dossier créé');
      } else if (creating.type === 'list') {
        await hierarchyService.createList({ name: newName, folder_id: creating.parentId });
        notifySuccess('Liste créée');
      }
      setCreating(null);
      setNewName('');
      loadTree();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de créer cet élément');
    }
  }

  function renderCreateForm(type, parentId) {
    if (!creating || creating.type !== type || creating.parentId !== parentId) return null;
    return (
      <form onSubmit={handleCreate} style={{ display: 'inline' }}>
        <input placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
        <button type="submit">Créer</button>
        <button type="button" onClick={() => setCreating(null)}>
          Annuler
        </button>
      </form>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => startCreating('space', null)}>
        + Nouvel espace
      </button>
      {renderCreateForm('space', null)}

      {tree.length === 0 && <p>Aucun espace créé pour le moment.</p>}

      <ul>
        {tree.map((space) => (
          <li key={space.id}>
            {space.name}
            <button type="button" onClick={() => startCreating('folder', space.id)}>
              + Nouveau dossier
            </button>
            {renderCreateForm('folder', space.id)}

            {space.folders.length === 0 && <ul><li>Aucun dossier</li></ul>}
            {space.folders.length > 0 && (
              <ul>
                {space.folders.map((folder) => (
                  <li key={folder.id}>
                    {folder.name}
                    <button type="button" onClick={() => startCreating('list', folder.id)}>
                      + Nouvelle liste
                    </button>
                    {renderCreateForm('list', folder.id)}

                    {folder.lists.length === 0 && <ul><li>Aucune liste</li></ul>}
                    {folder.lists.length > 0 && (
                      <ul>
                        {folder.lists.map((list) => (
                          <li key={list.id}>
                            <button
                              onClick={() => onSelectList && onSelectList(list.id, list)}
                              style={{ fontWeight: selectedListId === list.id ? 'bold' : 'normal' }}
                            >
                              {list.name} ({list.task_count} tâche{list.task_count > 1 ? 's' : ''})
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HierarchyTree;
