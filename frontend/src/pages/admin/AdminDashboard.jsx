import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as dashboardService from '../../services/dashboardService';
import * as avatarService from '../../services/avatarService';
import { getSocket } from '../../services/socket';
import EmployeeDetailPanel from '../../components/admin/EmployeeDetailPanel';
import { formatClock, formatDurationShort } from '../../utils/formatters';
import { notifyError } from '../../utils/toast';
import {
  IconWorkspace,
  IconPlay,
  IconAlert,
  IconSearch,
  IconArrowRight,
  IconCheckCircle,
} from '../../components/icons';
import '../../styles/admin.css';
import { PageSkeleton } from '../../components/Skeleton';
import AnimatedNumber from '../../components/AnimatedNumber';

const PRIORITY_META = {
  URGENT: { label: 'Urgent', cls: 'urgent' },
  HAUTE: { label: 'Haute', cls: 'haute' },
  NORMALE: { label: 'Normale', cls: 'normale' },
  FAIBLE: { label: 'Faible', cls: 'faible' },
};

const STATUS_FILTERS = [
  { value: '', label: 'Tout' },
  { value: 'VALIDEE', label: 'À faire' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'TERMINEE', label: 'Effectuées' },
];

// Chrono qui s'incrémente en direct pour une session de tâche encore ouverte
function LiveClock({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="monitor-chrono-value">{formatClock(elapsed)}</span>;
}

function Initials({ name, avatarUrl }) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return avatarUrl ? <img src={avatarUrl} alt="" className="monitor-avatar monitor-avatar--image" /> : <span className="monitor-avatar">{initials || '?'}</span>;
}

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [query, setQuery] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUrls, setAvatarUrls] = useState({});

  function load() {
    setRefreshing(true);
    dashboardService
      .getRealtimeDashboard()
      .then((payload) => {
        setData(payload);
        setLastUpdate(new Date());
      })
      .catch((err) => {
        // Pas de toast si la session vient d'expirer / se déconnecter (401) : appel de fond.
        if (!err.isAuthError) notifyError(err.response?.data?.error || 'Impossible de charger le tableau de bord');
      })
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    load();
    // Le polling n'est plus qu'un secours (le temps réel gère l'instantané) → intervalle allongé.
    const poll = setInterval(load, 30000);
    return () => clearInterval(poll);
  }, []);

  // Temps réel : rafraîchit le tableau de bord dès qu'une activité (tâches/chrono via
  // notification:new) ou une présence (connexion/déconnexion via presence:update) change.
  useEffect(() => {
    const socket = getSocket();
    socket.on('notification:new', load);
    socket.on('presence:update', load);
    return () => {
      socket.off('notification:new', load);
      socket.off('presence:update', load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Le tableau de bord reçoit parfois des données anciennes sans `has_avatar`;
    // on tente donc le même chargement que dans la page Planning pour chaque employé.
    Promise.all((data?.employees || []).map(async (employee) => {
      try { return [employee.id, URL.createObjectURL(await avatarService.getUserAvatarBlob(employee.id))]; }
      catch { return null; }
    })).then((entries) => { if (!cancelled) setAvatarUrls(Object.fromEntries(entries.filter(Boolean))); });
    return () => { cancelled = true; };
  }, [data?.employees]);

  function resetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setQuery('');
  }

  const showTodo = !statusFilter || statusFilter === 'VALIDEE';
  const showInProgress = !statusFilter || statusFilter === 'EN_COURS';
  const showDone = !statusFilter || statusFilter === 'TERMINEE';

  function byPriority(tasks) {
    return priorityFilter ? tasks.filter((task) => task.priority === priorityFilter) : tasks;
  }

  const visibleEmployees = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.employees.filter((employee) => !q || employee.full_name.toLowerCase().includes(q));
  }, [data, query]);

  if (!data) {
    return <PageSkeleton variant="dashboard" />;
  }

  const activeCount = data.stats.active_employees;
  const hasFilters = statusFilter || priorityFilter || query.trim();

  return (
    <div className="admin-dash">
      <div className="admin-toolbar">
        <div className="admin-live-badge">
          <span className="admin-live-dot" />
          En direct
          {lastUpdate && (
            <span className="admin-live-time">
              · mis à jour à{' '}
              {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="admin-toolbar-actions">
          <button type="button" className="btn-outline" onClick={load} disabled={refreshing}>
            {refreshing ? <span className="btn-spinner btn-spinner--dark" /> : <IconArrowRight />}
            Actualiser
          </button>
          <Link to="/admin/create-task" className="btn-primary">
            <IconArrowRight />
            Créer une tâche
          </Link>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <div className="admin-kpi-card admin-kpi-card--green">
          <span className="admin-kpi-icon">
            <IconWorkspace />
          </span>
          <div className="admin-kpi-copy">
            <p>Employés actifs</p>
            <AnimatedNumber as="strong" value={activeCount} />
            <span className="admin-kpi-hint">connectés en ce moment</span>
          </div>
        </div>
        <div className="admin-kpi-card admin-kpi-card--blue">
          <span className="admin-kpi-icon">
            <IconPlay />
          </span>
          <div className="admin-kpi-copy">
            <p>Tâches en cours</p>
            <AnimatedNumber as="strong" value={data.stats.tasks_in_progress} />
            <span className="admin-kpi-hint">chronos démarrés</span>
          </div>
        </div>
        <div className="admin-kpi-card admin-kpi-card--red">
          <span className="admin-kpi-icon">
            <IconAlert />
          </span>
          <div className="admin-kpi-copy">
            <p>Tâches en retard</p>
            <AnimatedNumber as="strong" value={data.stats.tasks_late} />
            <span className="admin-kpi-hint">échéances dépassées</span>
          </div>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="filter-search admin-filter-search">
          <IconSearch />
          <input
            type="text"
            placeholder="Rechercher un employé…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-groups">
          <div className="filter-group">
            <span className="filter-group-label">Statut</span>
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                className={`filter-chip${statusFilter === option.value ? ' filter-chip--active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Priorité</span>
            <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">Toutes</option>
              <option value="URGENT">Urgent</option>
              <option value="HAUTE">Haute</option>
              <option value="NORMALE">Normale</option>
              <option value="FAIBLE">Faible</option>
            </select>
          </div>
          {hasFilters && (
            <button type="button" className="admin-filter-reset" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {visibleEmployees.length === 0 ? (
        <div className="empty-state">Aucun employé ne correspond à votre recherche.</div>
      ) : (
        <div className="monitor-grid">
          {visibleEmployees.map((employee) => {
            const todo = byPriority(employee.todo);
            const inProgress = byPriority(employee.in_progress);
            // "Actif" = connecté à son compte (session ouverte), plus besoin d'avoir démarré une tâche.
            const isActive = employee.is_connected;

            return (
              <button
                key={employee.id}
                type="button"
                className={`monitor-card${isActive ? ' monitor-card--active' : ''}`}
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <div className="monitor-card-head">
                  <Initials name={employee.full_name} avatarUrl={avatarUrls[employee.id]} />
                  <div className="monitor-card-identity">
                    <span className="monitor-card-name">{employee.full_name}</span>
                    <span className="monitor-card-position">{employee.position || 'Employé'}</span>
      </div>
                  <span className={`monitor-status${isActive ? ' monitor-status--active' : ''}`}>
                    <span className="monitor-status-dot" />
                    {isActive ? 'En activité' : 'Au repos'}
                  </span>
                </div>

                <div className="monitor-cols">
                  {showTodo && (
                    <div className="monitor-col">
                      <span className="monitor-col-label">À faire · {todo.length}</span>
                      {todo.length === 0 ? (
                        <span className="monitor-col-empty">—</span>
                      ) : (
                        todo.slice(0, 3).map((task) => (
                          <span key={task.id} className="monitor-task">
                            <span className={`priority-dot priority-dot--${PRIORITY_META[task.priority]?.cls || 'normale'}`} />
                            <span className="monitor-task-title">{task.title}</span>
                          </span>
                        ))
                      )}
                      {todo.length > 3 && <span className="monitor-more">+{todo.length - 3}</span>}
                    </div>
                  )}

                  {showInProgress && (
                    <div className="monitor-col">
                      <span className="monitor-col-label">En cours · {inProgress.length}</span>
                      {inProgress.length === 0 ? (
                        <span className="monitor-col-empty">—</span>
                      ) : (
                        inProgress.map((task) => (
                          <span key={task.id} className="monitor-task monitor-task--live">
                            <span className="monitor-task-title">{task.title}</span>
                            {task.session_start_time && <LiveClock startTime={task.session_start_time} />}
                          </span>
                        ))
                      )}
                    </div>
                  )}

                  {showDone && (
                    <div className="monitor-col">
                      <span className="monitor-col-label">Effectuées · {employee.done.length}</span>
                      {employee.done.length === 0 ? (
                        <span className="monitor-col-empty">—</span>
                      ) : (
                        employee.done.slice(0, 3).map((task) => (
                          <span key={task.id} className="monitor-task monitor-task--done">
                            <IconCheckCircle />
                            <span className="monitor-task-title">{task.title}</span>
                          </span>
                        ))
                      )}
                      {employee.done.length > 3 && <span className="monitor-more">+{employee.done.length - 3}</span>}
                    </div>
                  )}
                </div>

                <span className="monitor-card-cta">
                  Voir le détail <IconArrowRight />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedEmployeeId && (
        <EmployeeDetailPanel employeeId={selectedEmployeeId} onClose={() => setSelectedEmployeeId(null)} />
      )}
    </div>
  );
}

export default AdminDashboard;
