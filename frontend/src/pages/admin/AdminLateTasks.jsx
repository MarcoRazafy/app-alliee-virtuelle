import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import { notifyError, notifySuccess } from '../../utils/toast';
import { matchesTerms } from '../../utils/textSearch';
import { IconAlert, IconSearch, IconExternalLink, IconTrash, IconLayers } from '../../components/icons';
import { PageSkeleton } from '../../components/Skeleton';
import StatusDropdown from '../../components/StatusDropdown';
import Pagination from '../../components/Pagination';
import DeadlineEditor from '../../components/DeadlineEditor';
import { displayStatusOf } from '../../utils/taskStatus';
import '../../styles/admin.css';

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

// Sévérité du retard → intensité du badge (plus c'est long, plus c'est rouge)
function lateSeverity(days) {
  if (days <= 2) return 'mild';
  if (days <= 6) return 'high';
  return 'severe';
}

// La liste s'affiche en cartes, comme l'onglet « À valider » : mêmes informations au même
// endroit (priorité, employé, échéance, chemin du projet), le retard en plus. Le tableau
// d'avant n'avait ni le chemin du projet, ni de place pour lui sur un écran étroit.
function AdminLateTasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortDirection, setSortDirection] = useState('desc');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  // Sélection pour suppression groupée : un admin peut supprimer n'importe quelle tâche.
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(
    () =>
      taskService
        .getLateTasks()
        .then(setTasks)
        .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches en retard'))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // La sélection porte sur la liste FILTRÉE : « tout sélectionner » doit couvrir ce que
  // l'admin voit après filtrage, pas les 50 tâches en retard de toute l'équipe.
  function toggleSelected(taskId) {
    setSelectedIds((cur) => (cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]));
  }

  async function deleteSelected(visible) {
    const cibles = visible.filter((t) => selectedIds.includes(t.id));
    if (cibles.length === 0 || deleting) return;
    const n = cibles.length;
    const message =
      `Supprimer ${n} tâche${n > 1 ? 's' : ''} en retard ?\n\n` +
      'Cette action est définitive et supprime aussi leurs commentaires, chronos et pièces jointes.';
    if (!window.confirm(message)) return;

    setDeleting(true);
    try {
      // En série : si l'une échoue, les précédentes sont déjà parties et le rechargement
      // montre exactement ce qui reste.
      for (const task of cibles) {
        await taskService.deleteTask(task.id);
      }
      setSelectedIds([]);
      await load();
      notifySuccess(`${n} tâche${n > 1 ? 's supprimées' : ' supprimée'}`);
    } catch (err) {
      await load();
      notifyError(err.response?.data?.error || 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  }

  function openTask(taskId) {
    navigate(`/tasks/${taskId}`, { state: { backgroundLocation: location } });
  }

  // Clic sur la carte → détail de la tâche, SAUF sur un élément interactif (case, statut,
  // lien, chemin du projet) qui garde son propre comportement.
  function openTaskFromCard(event, taskId) {
    if (event.target.closest('button, a, input, label, select, textarea')) return;
    openTask(taskId);
  }

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      // Mot par mot, sans accents : « campagne julien » trouve la tâche de Julien Petit.
      const matchesQuery = matchesTerms(
        [task.title, task.assigned_to_name, task.space_name, task.folder_name, task.list_name],
        query
      );
      const matchesPriority = !priorityFilter || task.priority === priorityFilter;
      return matchesQuery && matchesPriority;
    });
    return filtered.sort((a, b) =>
      sortDirection === 'desc' ? b.days_late - a.days_late : a.days_late - b.days_late
    );
  }, [tasks, query, priorityFilter, sortDirection]);

  // Un changement de recherche, de filtre ou d'ordre remet à la première page : rester en
  // page 4 d'une liste qui n'en compte plus que 2 afficherait une page vide.
  useEffect(() => {
    setPage(1);
  }, [query, priorityFilter, sortDirection]);

  const pagedTasks =
    pageSize === Infinity ? visibleTasks : visibleTasks.slice((page - 1) * pageSize, page * pageSize);

  const maxDays = tasks.reduce((max, t) => Math.max(max, t.days_late), 0);
  const hasFilters = Boolean(query.trim() || priorityFilter);
  const selectedVisible = visibleTasks.filter((t) => selectedIds.includes(t.id));
  const allVisibleSelected = visibleTasks.length > 0 && selectedVisible.length === visibleTasks.length;

  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="late-page">
      <div className="late-summary">
        <span className="late-summary-icon">
          <IconAlert />
        </span>
        <div className="late-summary-copy">
          <strong>
            {tasks.length} tâche{tasks.length > 1 ? 's' : ''} en retard
          </strong>
          <span>Une tâche confirmée n'est jamais considérée en retard.</span>
        </div>
        {maxDays > 0 && (
          <div className="late-summary-worst">
            <span className="late-summary-worst-value">{maxDays}</span>
            <span className="late-summary-worst-label">jours max</span>
          </div>
        )}
      </div>

      <div className="admin-filter-bar">
        <div className="filter-search admin-filter-search">
          <IconSearch />
          <input
            type="text"
            placeholder="Rechercher une tâche, un employé, un projet…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Toutes priorités</option>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="FAIBLE">Faible</option>
          </select>
          {/* L'ordre vivait dans l'en-tête de colonne « Retard » du tableau : sans tableau,
              il lui faut son propre réglage. */}
          <select
            className="filter-select"
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value)}
            aria-label="Ordre du retard"
          >
            <option value="desc">Plus en retard d'abord</option>
            <option value="asc">Moins en retard d'abord</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              className="admin-filter-reset"
              onClick={() => {
                setQuery('');
                setPriorityFilter('');
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {visibleTasks.length > 0 && (
        <div className="validate-listhead">
          <label className="validate-selectall">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => setSelectedIds(e.target.checked ? visibleTasks.map((t) => t.id) : [])}
              disabled={deleting}
            />
            Tout sélectionner
          </label>
          <span className="validate-count">
            {visibleTasks.length} tâche{visibleTasks.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {selectedVisible.length > 0 && (
        <div className="late-bulk-bar">
          <span>
            {selectedVisible.length} tâche{selectedVisible.length > 1 ? 's' : ''} sélectionnée
            {selectedVisible.length > 1 ? 's' : ''}
          </span>
          <button type="button" className="late-bulk-clear" onClick={() => setSelectedIds([])}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-danger late-bulk-delete"
            onClick={() => deleteSelected(visibleTasks)}
            disabled={deleting}
          >
            <IconTrash /> {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      )}

      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          {tasks.length === 0 ? 'Aucune tâche en retard. 🎉' : 'Aucune tâche ne correspond à ces filtres.'}
        </div>
      ) : (
        <div className="validate-list">
          {pagedTasks.map((task) => {
            const selected = selectedIds.includes(task.id);
            return (
              <div
                key={task.id}
                className={`validate-card late-card${selected ? ' validate-card--selected' : ''}`}
                onClick={(e) => openTaskFromCard(e, task.id)}
              >
                <label className="validate-card-check" aria-label={`Sélectionner la tâche ${task.title}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(task.id)}
                    disabled={deleting}
                  />
                </label>

                <div className="validate-card-body">
                  <div className="validate-card-top">
                    <button type="button" className="validate-card-title" onClick={() => openTask(task.id)}>
                      {task.title}
                    </button>
                    {/* Modifiable sur place : une tâche en retard se règle le plus souvent en
                        changeant son statut. Le rechargement fait disparaître de la liste ce
                        qui passe en Terminée ou Confirmée. */}
                    <StatusDropdown
                      taskId={task.id}
                      status={task.status}
                      displayStatus={displayStatusOf(task)}
                      onChanged={load}
                    />
                    <Link
                      to={`/tasks/${task.id}`}
                      state={{ backgroundLocation: location }}
                      className="validate-card-open"
                      title="Ouvrir le détail de la tâche"
                      aria-label={`Ouvrir le détail de la tâche ${task.title}`}
                    >
                      <IconExternalLink />
                    </Link>
                  </div>

                  <div className="validate-card-meta">
                    <span className="validate-meta-item">
                      <span className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`} />
                      {task.priority}
                    </span>
                    <span className="validate-meta-sep" />
                    <span>{task.assigned_to_name || '—'}</span>
                    <span className="validate-meta-sep" />
                    {/* Modifiable sur place : reporter une échéance est l'action la plus courante
                        sur une tâche en retard, elle ne doit pas obliger à ouvrir la fiche. */}
                    <DeadlineEditor
                      taskId={task.id}
                      deadline={task.deadline}
                      startDate={task.start_date}
                      onChanged={load}
                    />
                    <span className={`late-badge late-badge--${lateSeverity(task.days_late)}`}>
                      {task.days_late} j de retard
                    </span>
                  </div>

                  {task.list_name && (
                    <button
                      type="button"
                      className="validate-project-path"
                      onClick={() =>
                        navigate('/admin/lists', {
                          state: {
                            selectList: {
                              id: task.list_id,
                              name: task.list_name,
                              folderId: task.folder_id,
                              spaceId: task.space_id,
                            },
                          },
                        })
                      }
                      title="Ouvrir ce projet"
                    >
                      <IconLayers />
                      {task.space_name} › {task.folder_name} › {task.list_name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleTasks.length > 0 && (
        <Pagination
          page={page}
          totalItems={visibleTasks.length}
          itemsPerPage={pageSize}
          onPageChange={setPage}
          onItemsPerPageChange={setPageSize}
          options={[
            { value: 10, label: '10 par page' },
            { value: 50, label: '50 par page' },
            { value: Infinity, label: 'Toutes' },
          ]}
        />
      )}
    </div>
  );
}

export default AdminLateTasks;
