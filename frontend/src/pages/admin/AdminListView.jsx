import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import HierarchyTree from '../../components/admin/HierarchyTree';
import * as taskService from '../../services/taskService';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import MoveTasksDialog from '../../components/MoveTasksDialog';
import { IconChecklist, IconExternalLink, IconFolder, IconPlus, IconTrash } from '../../components/icons';
import '../../styles/admin.css';

const STATUS_GROUPS = [
  { key: 'DECLAREE', label: 'Déclarée (à valider)', pill: 'declared' },
  { key: 'VALIDEE', label: 'À faire', pill: 'todo' },
  { key: 'EN_COURS', label: 'En cours', pill: 'progress' },
  { key: 'TERMINEE', label: 'Terminée', pill: 'done' },
  { key: 'CONFIRMEE', label: 'Confirmée', pill: 'confirmed' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

function AdminListView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedListId, setSelectedListId] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [deletingProject, setDeletingProject] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [moveOpen, setMoveOpen] = useState(false);

  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));

  function toggleSelected(taskId) {
    setSelectedIds((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]));
  }

  function toggleGroup(groupTasks, allChecked) {
    const ids = groupTasks.map((task) => task.id);
    setSelectedIds((current) => (allChecked ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  }

  function loadTasks(listId) {
    taskService
      .getTasks({ list_id: listId, active_only: true })
      .then(setTasks)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches'));
  }

  function handleSelectList(listId, list) {
    setSelectedIds([]);
    setSelectedListId(listId);
    setSelectedList(list);
    loadTasks(listId);
  }

  useEffect(() => {
    const pre = location.state?.selectList;
    if (pre?.id) handleSelectList(pre.id, pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    function onTasksChanged() {
      setTreeRefreshKey((k) => k + 1);
      if (selectedListId) loadTasks(selectedListId);
    }
    window.addEventListener('tasks:changed', onTasksChanged);
    return () => window.removeEventListener('tasks:changed', onTasksChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  function goToCreateTask(list) {
    if (!list) return;
    navigate('/admin/create-task', {
      state: {
        backgroundLocation: location,
        prefill: {
          placement: { spaceId: list.spaceId, folderId: list.folderId, listId: list.id },
        },
      },
    });
  }

  function clearHierarchySelection() {
    setSelectedIds([]);
    setSelectedListId(null);
    setSelectedList(null);
    setTasks([]);
  }

  async function handleDeleteProject() {
    if (!selectedList || deletingProject) return;
    const confirmed = window.confirm(
      `Supprimer le projet « ${selectedList.name} » ?\n\nIl disparaîtra de l’arborescence, mais ses tâches et ses fichiers resteront conservés dans l’historique.`
    );
    if (!confirmed) return;

    setDeletingProject(true);
    try {
      await hierarchyService.deleteList(selectedList.id);
      notifySuccess('Projet supprimé');
      clearHierarchySelection();
      setTreeRefreshKey((value) => value + 1);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer le projet');
    } finally {
      setDeletingProject(false);
    }
  }

  return (
    <div className="lists-shell">
      <aside className="lists-panel lists-panel--tree">
        <div className="lists-panel-header">
          <h2 className="lists-panel-title">Arborescence</h2>
        </div>
        <HierarchyTree
          onSelectList={handleSelectList}
          onAddTask={(listId, list) => goToCreateTask(list)}
          onHierarchyDeleted={clearHierarchySelection}
          selectedListId={selectedListId}
          refreshKey={treeRefreshKey}
        />
      </aside>

      <section className="lists-panel lists-panel--content">
        {!selectedList ? (
          <div className="lists-empty">
            <span className="lists-empty-icon">
              <IconChecklist />
            </span>
            <h3>Aucune liste sélectionnée</h3>
            <p>Choisissez une liste dans l'arborescence pour voir ses tâches, regroupées par statut.</p>
          </div>
        ) : (
          <>
            <div className="lists-content-header">
              <div>
                <span className="lists-content-eyebrow">Projet</span>
                <h2 className="lists-content-title">{selectedList.name}</h2>
              </div>
              <div className="lists-content-actions">
                {selectedTasks.length > 0 && (
                  <div className="mt-bulk-bar">
                    <span>
                      {selectedTasks.length} sélectionnée{selectedTasks.length > 1 ? 's' : ''}
                    </span>
                    <button type="button" className="mt-bulk-clear" onClick={() => setSelectedIds([])}>
                      Annuler
                    </button>
                    <button type="button" className="btn-outline mt-bulk-move" onClick={() => setMoveOpen(true)}>
                      <IconFolder /> Déplacer vers un projet…
                    </button>
                  </div>
                )}
                <span className="lists-content-total">
                  {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  className="lists-delete-project-btn"
                  onClick={handleDeleteProject}
                  disabled={deletingProject}
                >
                  <IconTrash />
                  {deletingProject ? 'Suppression…' : 'Supprimer le projet'}
                </button>
              </div>
            </div>

            {STATUS_GROUPS.map((group) => {
              const groupTasks = tasks.filter((t) => t.status === group.key);
              const isDeclared = group.key === 'DECLAREE';
              const groupChecked = groupTasks.length > 0 && groupTasks.every((t) => selectedIds.includes(t.id));
              return (
                <div key={group.key} className="lists-group">
                  <div className="lists-group-header">
                    <span className={`pill pill--${group.pill}`}>{group.label}</span>
                    <span className="lists-group-count">{groupTasks.length}</span>
                    {group.key === 'CONFIRMEE' && (
                      <span className="lists-auto-hide-hint">Masquées automatiquement après 5 jours</span>
                    )}
                    {isDeclared && (
                      <button
                        type="button"
                        className="lists-add-btn"
                        onClick={() => goToCreateTask(selectedList)}
                      >
                        <IconPlus /> Ajouter une tâche
                      </button>
                    )}
                  </div>

                  {groupTasks.length === 0 ? (
                    <p className="lists-group-empty">Aucune tâche.</p>
                  ) : (
                    <div className="task-table-wrap">
                      <table className="task-table">
                        <thead>
                          <tr>
                            <th className="mt-select-col">
                              <input
                                type="checkbox"
                                checked={groupChecked}
                                onChange={() => toggleGroup(groupTasks, groupChecked)}
                                aria-label={`Sélectionner toutes les tâches « ${group.label} »`}
                              />
                            </th>
                            <th>Tâche</th>
                            <th>Assigné à</th>
                            <th>Échéance</th>
                            <th>Priorité</th>
                            <th aria-label="Ouvrir" />
                          </tr>
                        </thead>
                        <tbody>
                          {groupTasks.map((task) => (
                            <tr
                              key={task.id}
                              className={selectedIds.includes(task.id) ? 'mt-row--selected' : undefined}
                              onClick={() => navigate(`/tasks/${task.id}`, { state: { backgroundLocation: location } })}
                              style={{ cursor: 'pointer' }}
                            >
                              <td className="mt-select-col" onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(task.id)}
                                  onChange={() => toggleSelected(task.id)}
                                  aria-label={`Sélectionner « ${task.title} »`}
                                />
                              </td>
                              <td>
                                <Link
                                  to={`/tasks/${task.id}`}
                                  state={{ backgroundLocation: location }}
                                  className="task-table-title"
                                >
                                  {task.title}
                                </Link>
                              </td>
                              <td>{task.assigned_to_name || '—'}</td>
                              <td>{task.deadline ? formatDate(task.deadline) : '—'}</td>
                              <td>
                                <span className="lists-priority">
                                  <span
                                    className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`}
                                  />
                                  {task.priority}
                                </span>
                              </td>
                              <td>
                                <Link
                                  to={`/tasks/${task.id}`}
                                  state={{ backgroundLocation: location }}
                                  className="icon-link-btn"
                                  title="Ouvrir la tâche"
                                >
                                  <IconExternalLink />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      {moveOpen && (
        <MoveTasksDialog
          taskIds={selectedTasks.map((task) => task.id)}
          excludeListId={selectedListId}
          onClose={() => setMoveOpen(false)}
          onMoved={() => {
            setMoveOpen(false);
            setSelectedIds([]);
          }}
        />
      )}
    </div>
  );
}

export default AdminListView;
