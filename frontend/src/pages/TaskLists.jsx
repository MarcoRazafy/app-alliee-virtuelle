import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import MultiSelectFilter from '../components/MultiSelectFilter';
import Pagination from '../components/Pagination';
import * as taskService from '../services/taskService';
import useAuthStore from '../store/authStore';
import { notifyError } from '../utils/toast';
import { formatDate } from '../utils/formatters';
import { STATUS_PILL, displayStatusOf } from '../utils/taskStatus';
import { assigneeOptions, assigneesOf, filterTaskList } from '../utils/taskListFilters';
import { IconExternalLink, IconLayers, IconSearch } from '../components/icons';
import '../styles/task-list.css';

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'A_REPRENDRE', label: 'À reprendre' },
  { value: 'VALIDEE', label: 'À faire' },
  { value: 'TERMINEE', label: 'Terminée' },
  { value: 'CONFIRMEE', label: 'Confirmée' },
];

const PRIORITY_OPTIONS = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'FAIBLE', label: 'Faible' },
];

const DEADLINE_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'past', label: 'Passée' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

const BREADCRUMB = [{ label: 'Accueil', to: '/dashboard' }, { label: 'Liste des tâches' }];

function TaskLists() {
  const navigate = useNavigate();
  const location = useLocation();
  const mergeUser = useAuthStore((state) => state.mergeUser);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    try {
      setTasks(await taskService.getTasks({ scope: 'all' }));
      setDenied(false);
    } catch (err) {
      if (err.response?.status === 403) {
        setDenied(true);
        mergeUser({ can_access_all_tasks: false });
      } else {
        notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onTasksChanged = () => load();
    window.addEventListener('tasks:changed', onTasksChanged);
    return () => window.removeEventListener('tasks:changed', onTasksChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const people = useMemo(() => assigneeOptions(tasks), [tasks]);
  const filtered = useMemo(
    () => filterTaskList(tasks, { search, statuses, priorities, assignees, deadlines }),
    [tasks, search, statuses, priorities, assignees, deadlines]
  );
  const paged = pageSize === Infinity ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = statuses.length + priorities.length + assignees.length + deadlines.length > 0;

  useEffect(() => {
    setPage(1);
  }, [search, statuses, priorities, assignees, deadlines]);

  function toggleStatus(value) {
    if (value === '') {
      setStatuses([]);
      return;
    }
    setStatuses((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));
  }

  function resetFilters() {
    setStatuses([]);
    setPriorities([]);
    setAssignees([]);
    setDeadlines([]);
  }

  function openFromCard(event, taskId) {
    if (event.target.closest('button, a, input, label, select, textarea')) return;
    navigate(`/tasks/${taskId}`, { state: { backgroundLocation: location } });
  }

  if (denied) {
    return (
      <EmployeeLayout title="Liste des tâches" breadcrumb={BREADCRUMB}>
        <div className="empty-state">
          Vous n'avez pas accès à la liste de toutes les tâches. Un administrateur peut vous le donner depuis votre fiche.
        </div>
      </EmployeeLayout>
    );
  }

  return (
    <EmployeeLayout
      title="Liste des tâches"
      breadcrumb={BREADCRUMB}
      subtitle="Toutes les tâches de l'équipe : ouvrez-en une pour modifier son titre, ses dates, sa priorité ou sa description"
      skeleton={loading ? 'list' : null}
    >
      <div className="filter-search tl-search">
        <IconSearch />
        <input
          type="search"
          placeholder="Rechercher une tâche (titre, assigné, projet…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher une tâche"
        />
      </div>

      <div className="tl-filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Statut</span>
          {STATUS_FILTERS.map((option) => {
            const active = option.value === '' ? statuses.length === 0 : statuses.includes(option.value);
            return (
              <button
                key={option.value || 'all'}
                type="button"
                className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                onClick={() => toggleStatus(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="filter-group">
          <MultiSelectFilter
            allLabel="Toutes priorités"
            baseLabel="Priorité"
            selected={priorities}
            onChange={setPriorities}
            options={PRIORITY_OPTIONS}
          />
          <MultiSelectFilter
            allLabel="Tous les employés"
            baseLabel="Employés"
            selected={assignees}
            onChange={setAssignees}
            options={people}
            searchable
          />
          <MultiSelectFilter
            allLabel="Toutes échéances"
            baseLabel="Échéance"
            selected={deadlines}
            onChange={setDeadlines}
            options={DEADLINE_OPTIONS}
          />
          {hasFilters && (
            <button type="button" className="tl-filter-reset" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <p className="tl-count">
        {filtered.length} tâche{filtered.length > 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>
      ) : (
        <div className="tl-list">
          {paged.map((task) => {
            const status = displayStatusOf(task);
            const names = assigneesOf(task)
              .map((p) => p.full_name)
              .filter(Boolean)
              .join(', ');
            const projectPath = [task.space_name, task.folder_name, task.list_name].filter(Boolean).join(' › ');
            return (
              <div key={task.id} className="tl-card" onClick={(e) => openFromCard(e, task.id)}>
                <div className="tl-card-top">
                  <Link to={`/tasks/${task.id}`} state={{ backgroundLocation: location }} className="tl-card-title">
                    {task.title}
                  </Link>
                  <span className={`pill ${STATUS_PILL[status]?.className || ''}`}>
                    {STATUS_PILL[status]?.label || status}
                  </span>
                  <Link
                    to={`/tasks/${task.id}`}
                    state={{ backgroundLocation: location }}
                    className="tl-card-open"
                    title="Ouvrir le détail de la tâche"
                    aria-label={`Ouvrir le détail de la tâche ${task.title}`}
                  >
                    <IconExternalLink />
                  </Link>
                </div>
                <div className="tl-card-meta">
                  <span className="tl-meta-item">
                    <span className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`} />
                    {task.priority}
                  </span>
                  <span className="tl-meta-sep" />
                  <span>{names || 'Non assignée'}</span>
                  <span className="tl-meta-sep" />
                  <span>Échéance : {task.deadline ? formatDate(task.deadline) : '—'}</span>
                </div>
                {projectPath && (
                  <span className="tl-card-path">
                    <IconLayers />
                    {projectPath}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <Pagination
          page={page}
          totalItems={filtered.length}
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
    </EmployeeLayout>
  );
}

export default TaskLists;
