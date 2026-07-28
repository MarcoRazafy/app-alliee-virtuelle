import { useEffect, useState } from 'react';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconLayers, IconFolder, IconChecklist, IconChevronDown, IconPlus, IconTrash } from '../icons';

// Arbre Space > Folder > List. onSelectList(listId, list) est appelé au clic sur
// une liste, pour que la page parente puisse filtrer ses tâches sur cette liste.
function HierarchyTree({
  onSelectList,
  onAddTask,
  onHierarchyDeleted,
  selectedListId,
  refreshKey = 0,
}) {
  const [tree, setTree] = useState([]);
  // Un seul formulaire de création ouvert à la fois : { type: 'space'|'folder'|'list', parentId }
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState('');
  // Noeuds repliés (par id d'espace/dossier). Par défaut tout est déplié.
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);

  function loadTree() {
    hierarchyService
      .getSpacesTree()
      .then(setTree)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'arborescence"));
  }

  useEffect(loadTree, [refreshKey]);

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
        notifySuccess('Space created');
      } else if (creating.type === 'folder') {
        await hierarchyService.createFolder({ name: newName, space_id: creating.parentId });
        notifySuccess('Folder created');
      } else if (creating.type === 'list') {
        await hierarchyService.createList({ name: newName, folder_id: creating.parentId });
        notifySuccess('List created');
      }
      setCreating(null);
      setNewName('');
      loadTree();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to create this item');
    }
  }

  async function handleDelete(type, item) {
    if (busyId) return;
    const messages = {
      space: `Delete the space “${item.name}”?\n\nIt will disappear with its projects from the tree. Tasks will be kept in the history.`,
      folder: `Delete the project “${item.name}”?\n\nIt will disappear with its lists from the tree. Tasks will be kept in the history.`,
      list: `Delete “${item.name}”?\n\nIts tasks will be kept in the history.`,
    };
    if (!window.confirm(messages[type])) return;

    setBusyId(item.id);
    try {
      if (type === 'space') await hierarchyService.deleteSpace(item.id);
      if (type === 'folder') await hierarchyService.deleteFolder(item.id);
      if (type === 'list') await hierarchyService.deleteList(item.id);
      notifySuccess(type === 'space' ? 'Space deleted' : type === 'folder' ? 'Project deleted' : 'List deleted');
      setCreating(null);
      onHierarchyDeleted?.();
      loadTree();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to delete this item');
    } finally {
      setBusyId(null);
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
          Create
        </button>
        <button type="button" className="tree-create-cancel" onClick={() => setCreating(null)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="lists-tree">
      <button type="button" className="tree-add-root" onClick={() => startCreating('space', null)}>
        + New space
      </button>
      {renderCreateForm('space', null, 'Space name')}

      {tree.length === 0 && <p className="tree-empty">No space created yet.</p>}

      {tree.map((space) => {
        const spaceOpen = !collapsed.has(space.id);
        return (
          <div key={space.id} className="tree-space">
            <div className="tree-row tree-row--space">
              <button
                type="button"
                className={`tree-toggle${spaceOpen ? ' tree-toggle--open' : ''}`}
                onClick={() => toggle(space.id)}
                aria-label={spaceOpen ? 'Collapse' : 'Expand'}
              >
                <IconChevronDown />
              </button>
              <span className="tree-icon">
                <IconLayers />
              </span>
              <span className="tree-label">{space.name}</span>
              <span className="tree-node-actions">
                <button
                  type="button"
                  className="tree-node-action"
                  title="Add a project"
                  aria-label={`Ajouter un projet dans ${space.name}`}
                  onClick={() => startCreating('folder', space.id)}
                  disabled={Boolean(busyId)}
                >
                  <IconPlus />
                </button>
                <button
                  type="button"
                  className="tree-node-action tree-node-action--danger"
                  title="Delete the space"
                  aria-label={`Supprimer l’espace ${space.name}`}
                  onClick={() => handleDelete('space', space)}
                  disabled={Boolean(busyId)}
                >
                  <IconTrash />
                </button>
              </span>
            </div>
            {renderCreateForm('folder', space.id, 'Nom du projet')}

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
                        aria-label={folderOpen ? 'Collapse' : 'Expand'}
                      >
                        <IconChevronDown />
                      </button>
                      <span className="tree-icon">
                        <IconFolder />
                      </span>
                      <span className="tree-label">{folder.name}</span>
                      <span className="tree-node-actions">
                        <button
                          type="button"
                          className="tree-node-action"
                          title="Add a list"
                          aria-label={`Ajouter une liste dans ${folder.name}`}
                          onClick={() => startCreating('list', folder.id)}
                          disabled={Boolean(busyId)}
                        >
                          <IconPlus />
                        </button>
                        <button
                          type="button"
                          className="tree-node-action tree-node-action--danger"
                          title="Delete the project"
                          aria-label={`Supprimer le projet ${folder.name}`}
                          onClick={() => handleDelete('folder', folder)}
                          disabled={Boolean(busyId)}
                        >
                          <IconTrash />
                        </button>
                      </span>
                    </div>
                    {renderCreateForm('list', folder.id, 'Nom de la liste')}

                    {folderOpen && folder.lists.length === 0 && (
                      <p className="tree-empty tree-empty--nested">No list</p>
                    )}
                    {folderOpen &&
                      folder.lists.map((list) => (
                        <div
                          key={list.id}
                          className={`tree-row tree-list-item${
                            selectedListId === list.id ? ' tree-list-item--active' : ''
                          }`}
                        >
                          <button
                            type="button"
                            data-list-id={list.id}
                            className="tree-list-main"
                            onClick={() => onSelectList?.(list.id, list)}
                          >
                            <span className="tree-icon">
                              <IconChecklist />
                            </span>
                            <span className="tree-label">{list.name}</span>
                            <span className="tree-count">{list.task_count}</span>
                          </button>
                          <span className="tree-node-actions">
                            <button
                              type="button"
                              className="tree-node-action"
                              title="Add a task"
                              aria-label={`Add a task in ${list.name}`}
                              onClick={() => onAddTask?.(list.id, list)}
                              disabled={Boolean(busyId)}
                            >
                              <IconPlus />
                            </button>
                            <button
                              type="button"
                              className="tree-node-action tree-node-action--danger"
                              title="Delete the list"
                              aria-label={`Supprimer la liste ${list.name}`}
                              onClick={() => handleDelete('list', list)}
                              disabled={Boolean(busyId)}
                            >
                              <IconTrash />
                            </button>
                          </span>
                        </div>
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
