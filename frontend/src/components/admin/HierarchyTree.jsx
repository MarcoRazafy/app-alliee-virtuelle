import { useEffect, useState } from 'react';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconLayers, IconFolder, IconChecklist, IconChevronDown } from '../icons';

// Arbre Space > Folder > List. onSelectList(listId, list) est appelé au clic sur
// une liste, pour que la page parente puisse filtrer ses tâches sur cette liste.
function HierarchyTree({ onSelectList, selectedListId }) {
  const [tree, setTree] = useState([]);
  // Un seul formulaire de création ouvert à la fois : { type: 'space'|'folder'|'list', parentId }
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState('');
  // Noeuds repliés (par id d'espace/dossier). Par défaut tout est déplié.
  const [collapsed, setCollapsed] = useState(() => new Set());

  function loadTree() {
    hierarchyService
      .getSpacesTree()
      .then(setTree)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'arborescence"));
  }

  useEffect(loadTree, []);

  function toggle(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  function renderCreateForm(type, parentId, placeholder) {
    if (!creating || creating.type !== type || creating.parentId !== parentId) return null;
    return (
      <form className="tree-create-form" onSubmit={handleCreate}>
        <input
          className="form-input"
          placeholder={placeholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
        <button type="submit" className="tree-create-save">
          Créer
        </button>
        <button type="button" className="tree-create-cancel" onClick={() => setCreating(null)}>
          Annuler
        </button>
      </form>
    );
  }

  return (
    <div className="lists-tree">
      <button type="button" className="tree-add-root" onClick={() => startCreating('space', null)}>
        + Nouvel espace
      </button>
      {renderCreateForm('space', null, "Nom de l'espace")}

      {tree.length === 0 && <p className="tree-empty">Aucun espace créé pour le moment.</p>}

      {tree.map((space) => {
        const spaceOpen = !collapsed.has(space.id);
        return (
          <div key={space.id} className="tree-space">
            <div className="tree-row tree-row--space">
              <button
                type="button"
                className={`tree-toggle${spaceOpen ? ' tree-toggle--open' : ''}`}
                onClick={() => toggle(space.id)}
                aria-label={spaceOpen ? 'Replier' : 'Déplier'}
              >
                <IconChevronDown />
              </button>
              <span className="tree-icon">
                <IconLayers />
              </span>
              <span className="tree-label">{space.name}</span>
              <button
                type="button"
                className="tree-add-btn"
                title="Nouveau dossier"
                onClick={() => startCreating('folder', space.id)}
              >
                +
              </button>
            </div>
            {renderCreateForm('folder', space.id, 'Nom du dossier')}

            {spaceOpen &&
              space.folders.map((folder) => {
                const folderOpen = !collapsed.has(folder.id);
                return (
                  <div key={folder.id} className="tree-folder">
                    <div className="tree-row tree-row--folder">
                      <button
                        type="button"
                        className={`tree-toggle${folderOpen ? ' tree-toggle--open' : ''}`}
                        onClick={() => toggle(folder.id)}
                        aria-label={folderOpen ? 'Replier' : 'Déplier'}
                      >
                        <IconChevronDown />
                      </button>
                      <span className="tree-icon">
                        <IconFolder />
                      </span>
                      <span className="tree-label">{folder.name}</span>
                      <button
                        type="button"
                        className="tree-add-btn"
                        title="Nouvelle liste"
                        onClick={() => startCreating('list', folder.id)}
                      >
                        +
                      </button>
                    </div>
                    {renderCreateForm('list', folder.id, 'Nom de la liste')}

                    {folderOpen && folder.lists.length === 0 && (
                      <p className="tree-empty tree-empty--nested">Aucune liste</p>
                    )}
                    {folderOpen &&
                      folder.lists.map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          className={`tree-row tree-list-item${
                            selectedListId === list.id ? ' tree-list-item--active' : ''
                          }`}
                          onClick={() => onSelectList && onSelectList(list.id, list)}
                        >
                          <span className="tree-icon">
                            <IconChecklist />
                          </span>
                          <span className="tree-label">{list.name}</span>
                          <span className="tree-count">{list.task_count}</span>
                        </button>
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

export default HierarchyTree;
