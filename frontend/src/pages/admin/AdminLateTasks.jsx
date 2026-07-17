import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import { notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconAlert, IconSearch, IconExternalLink, IconChevronDown } from '../../components/icons';
import '../../styles/admin.css';

const STATUS_META = {
  DECLAREE: { label: 'Déclarée', pill: 'declared' },
  VALIDEE: { label: 'À faire', pill: 'todo' },
  EN_COURS: { label: 'En cours', pill: 'progress' },
  TERMINEE: { label: 'Terminée', pill: 'done' },
  CONFIRMEE: { label: 'Confirmée', pill: 'confirmed' },
};

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

// Sévérité du retard → intensité du badge (plus c'est long, plus c'est rouge)
function lateSeverity(days) {
  if (days <= 2) return 'mild';
  if (days <= 6) return 'high';
  return 'severe';
}

function AdminLateTasks() {
  const [tasks, setTasks] = useState([]);
  const [sortDirection, setSortDirection] = useState('desc');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  useEffect(() => {
    taskService
      .getLateTasks()
      .then(setTasks)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches en retard'));
  }, []);

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

      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          {tasks.length === 0 ? 'Aucune tâche en retard. 🎉' : 'Aucune tâche ne correspond à ces filtres.'}
        </div>
      ) : (
        <div className="task-table-wrap late-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
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
                const meta = STATUS_META[task.status] || { label: task.status, pill: 'declared' };
                return (
                  <tr key={task.id}>
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
                      <span className={`pill pill--${meta.pill}`}>{meta.label}</span>
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
