import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import { notifyError, notifySuccess } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconAlert, IconSearch, IconExternalLink, IconChevronDown, IconTrash } from '../../components/icons';
import { PageSkeleton } from '../../components/Skeleton';
import StatusDropdown from '../../components/StatusDropdown';
import { displayStatusOf } from '../../utils/taskStatus';
import '../../styles/admin.css';

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

// Sévérité du retard → intensité du badge (plus c'est long, plus c'est rouge)
function lateSeverity(days) {
  if (days <= 2) return 'mild';
  if (days <= 6) return 'high';
  return 'severe';
}

function AdminLateTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortDirection, setSortDirection] = useState('desc');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  // Sélection pour suppression groupée : un admin peut supprimer n'importe quelle tâche.
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

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

  function toggleSort() {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = tasks.filter((task) => {
      const matchesQuery =
        !q ||
        task.title.toLowerCase().includes(q) ||
        (task.assigned_to_name || '').toLowerCase().includes(q);
      const matchesPriority = !priorityFilter || task.priority === priorityFilter;
      return matchesQuery && matchesPriority;
    });
    return filtered.sort((a, b) =>
      sortDirection === 'desc' ? b.days_late - a.days_late : a.days_late - b.days_late
    );
  }, [tasks, query, priorityFilter, sortDirection]);

  const maxDays = tasks.reduce((max, t) => Math.max(max, t.days_late), 0);
  const hasFilters = query.trim() || priorityFilter;

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
            placeholder="Rechercher une tâche ou un employé…"
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

      {(() => {
        const selectedVisible = visibleTasks.filter((t) => selectedIds.includes(t.id));
        if (selectedVisible.length === 0) return null;
        return (
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
        );
      })()}

      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          {tasks.length === 0 ? 'Aucune tâche en retard. 🎉' : 'Aucune tâche ne correspond à ces filtres.'}
        </div>
      ) : (
        <div className="task-table-wrap late-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th className="late-select-col">
                  <input
                    type="checkbox"
                    checked={visibleTasks.length > 0 && visibleTasks.every((t) => selectedIds.includes(t.id))}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? visibleTasks.map((t) => t.id) : [])
                    }
                    aria-label="Tout sélectionner"
                    title="Sélectionner toutes les tâches affichées"
                  />
                </th>
                <th>Tâche</th>
                <th>Employé</th>
                <th>Priorité</th>
                <th>Statut</th>
                <th>Échéance</th>
                <th>
                  <button type="button" className="late-sort-btn" onClick={toggleSort}>
                    Retard
                    <IconChevronDown className={`late-sort-arrow${sortDirection === 'asc' ? ' late-sort-arrow--up' : ''}`} />
                  </button>
                </th>
                <th aria-label="Ouvrir" />
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => {
                return (
                  <tr key={task.id} className={selectedIds.includes(task.id) ? 'late-row--selected' : undefined}>
                    <td className="late-select-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(task.id)}
                        onChange={() => toggleSelected(task.id)}
                        aria-label={`Sélectionner « ${task.title} »`}
                      />
                    </td>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="task-table-title">
                        {task.title}
                      </Link>
                    </td>
                    <td>{task.assigned_to_name || '—'}</td>
                    <td>
                      <span className="lists-priority">
                        <span className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`} />
                        {task.priority}
                      </span>
                    </td>
                    <td>
                      {/* Modifiable sur place : une tâche en retard se règle le plus souvent
                          en changeant son statut, sans avoir à ouvrir la fiche. Le rechargement
                          fait disparaître de la liste ce qui passe en Confirmée. */}
                      <StatusDropdown
                        taskId={task.id}
                        status={task.status}
                        displayStatus={displayStatusOf(task)}
                        onChanged={load}
                      />
                    </td>
                    <td>{task.deadline ? formatDate(task.deadline) : '—'}</td>
                    <td>
                      <span className={`late-badge late-badge--${lateSeverity(task.days_late)}`}>
                        {task.days_late} j
                      </span>
                    </td>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="icon-link-btn" title="Ouvrir la tâche">
                        <IconExternalLink />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminLateTasks;
