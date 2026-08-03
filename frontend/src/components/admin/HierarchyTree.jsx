import { Fragment, useEffect, useState } from 'react';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconLayers, IconFolder, IconChecklist, IconChevronDown, IconPlus, IconPencil, IconTrash, IconDots } from '../icons';

// Menu d'actions d'un nœud : un seul bouton « … » qui déplie Ajouter / Renommer / Supprimer.
function NodeActionsMenu({ open, onToggle, onClose, actions, disabled, triggerLabel }) {
  return (
    <span className="tree-node-actions tree-menu">
      <button
        type="button"
        className="tree-menu-trigger"
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        <IconDots />
      </button>
      {open && (
        <div className="tree-menu-panel" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`tree-menu-item${action.danger ? ' tree-menu-item--danger' : ''}`}
              onClick={() => {
                onClose();
                action.onClick();
              }}
            >
              <action.icon />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

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
  // Renommage inline : { type, id } du nœud en cours de renommage.
  const [renaming, setRenaming] = useState(null);
  const [renameName, setRenameName] = useState('');
  // Noeuds repliés (par id d'espace/dossier). Par défaut tout est déplié.
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);
  // Menu « … » actuellement ouvert, identifié par une clé unique (`type:id`).
  const [openMenu, setOpenMenu] = useState(null);

  // Ferme le menu ouvert dès qu'on clique en dehors de tout menu d'actions.
  useEffect(() => {
    if (!openMenu) return undefined;
    function handleClickOutside(e) {
      if (!e.target.closest('.tree-menu')) setOpenMenu(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

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
    setRenaming(null);
  }

  function startRenaming(type, item) {
    setRenaming({ type, id: item.id });
    setRenameName(item.name);
    setCreating(null);
  }

  async function handleRename(e, type, id) {
    e.preventDefault();
    if (!renameName.trim()) return;
    try {
      if (type === 'space') await hierarchyService.updateSpace(id, { name: renameName.trim() });
      if (type === 'folder') await hierarchyService.updateFolder(id, renameName.trim());
      if (type === 'list') await hierarchyService.updateList(id, renameName.trim());
      notifySuccess(type === 'space' ? 'Espace renommé' : type === 'folder' ? 'Projet renommé' : 'Liste renommée');
      setRenaming(null);
      loadTree();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renommer cet élément');
    }
  }

  function renderRenameForm(type, id) {
    if (!renaming || renaming.type !== type || renaming.id !== id) return null;
    return (
      <form className="tree-create-form" onSubmit={(e) => handleRename(e, type, id)}>
        <input
          className="form-input"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          autoFocus
        />
        <button type="submit" className="tree-create-save">
          Renommer
        </button>
        <button type="button" className="tree-create-cancel" onClick={() => setRenaming(null)}>
          Annuler
        </button>
      </form>
    );
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

  async function handleDelete(type, item) {
    if (busyId) return;
    const messages = {
      space: `Supprimer l’espace « ${item.name} » ?\n\nIl disparaîtra avec ses projets de l’arborescence. Les tâches resteront conservées dans l’historique.`,
      folder: `Supprimer le projet « ${item.name} » ?\n\nIl disparaîtra avec ses listes de l’arborescence. Les tâches resteront conservées dans l’historique.`,
      list: `Supprimer « ${item.name} » ?\n\nSes tâches resteront conservées dans l’historique.`,
    };
    if (!window.confirm(messages[type])) return;

    setBusyId(item.id);
    try {
      if (type === 'space') await hierarchyService.deleteSpace(item.id);
      if (type === 'folder') await hierarchyService.deleteFolder(item.id);
      if (type === 'list') await hierarchyService.deleteList(item.id);
      notifySuccess(type === 'space' ? 'Espace supprimé' : type === 'folder' ? 'Projet supprimé' : 'Liste supprimée');
      setCreating(null);
      onHierarchyDeleted?.();
      loadTree();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer cet élément');
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
              <span className="tree-label" title={space.name}>{space.name}</span>
              <NodeActionsMenu
                open={openMenu === `space:${space.id}`}
                onToggle={() => setOpenMenu((cur) => (cur === `space:${space.id}` ? null : `space:${space.id}`))}
                onClose={() => setOpenMenu(null)}
                disabled={Boolean(busyId)}
                triggerLabel={`Actions pour l’espace ${space.name}`}
                actions={[
                  { label: 'Ajouter un projet', icon: IconPlus, onClick: () => startCreating('folder', space.id) },
                  { label: 'Renommer l’espace', icon: IconPencil, onClick: () => startRenaming('space', space) },
                  { label: 'Supprimer l’espace', icon: IconTrash, danger: true, onClick: () => handleDelete('space', space) },
                ]}
              />
            </div>
            {renderRenameForm('space', space.id)}
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
                        aria-label={folderOpen ? 'Replier' : 'Déplier'}
                      >
                        <IconChevronDown />
                      </button>
                      <span className="tree-icon">
                        <IconFolder />
                      </span>
                      <span className="tree-label" title={folder.name}>{folder.name}</span>
                      <NodeActionsMenu
                        open={openMenu === `folder:${folder.id}`}
                        onToggle={() => setOpenMenu((cur) => (cur === `folder:${folder.id}` ? null : `folder:${folder.id}`))}
                        onClose={() => setOpenMenu(null)}
                        disabled={Boolean(busyId)}
                        triggerLabel={`Actions pour le projet ${folder.name}`}
                        actions={[
                          { label: 'Ajouter une liste', icon: IconPlus, onClick: () => startCreating('list', folder.id) },
                          { label: 'Renommer le projet', icon: IconPencil, onClick: () => startRenaming('folder', folder) },
                          { label: 'Supprimer le projet', icon: IconTrash, danger: true, onClick: () => handleDelete('folder', folder) },
                        ]}
                      />
                    </div>
                    {renderRenameForm('folder', folder.id)}
                    {renderCreateForm('list', folder.id, 'Nom de la liste')}

                    {folderOpen && folder.lists.length === 0 && (
                      <p className="tree-empty tree-empty--nested">Aucune liste</p>
                    )}
                    {folderOpen &&
                      folder.lists.map((list) => (
                        <Fragment key={list.id}>
                        <div
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
                            <span className="tree-label" title={list.name}>{list.name}</span>
                            <span className="tree-count">{list.task_count}</span>
                          </button>
                          <NodeActionsMenu
                            open={openMenu === `list:${list.id}`}
                            onToggle={() => setOpenMenu((cur) => (cur === `list:${list.id}` ? null : `list:${list.id}`))}
                            onClose={() => setOpenMenu(null)}
                            disabled={Boolean(busyId)}
                            triggerLabel={`Actions pour la liste ${list.name}`}
                            actions={[
                              { label: 'Ajouter une tâche', icon: IconPlus, onClick: () => onAddTask?.(list.id, list) },
                              { label: 'Renommer la liste', icon: IconPencil, onClick: () => startRenaming('list', list) },
                              { label: 'Supprimer la liste', icon: IconTrash, danger: true, onClick: () => handleDelete('list', list) },
                            ]}
                          />
                        </div>
                        {renderRenameForm('list', list.id)}
                        </Fragment>
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
