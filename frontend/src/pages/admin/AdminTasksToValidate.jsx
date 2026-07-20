import { useEffect, useMemo, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import AttachmentUpload from '../../components/AttachmentUpload';
import CommentSection from '../../components/CommentSection';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconCheckCircle, IconX, IconArrowRight, IconSearch } from '../../components/icons';
import '../../styles/admin.css';

const STATUS_META = {
  DECLAREE: { label: 'Déclarée', pill: 'declared' },
  VALIDEE: { label: 'Validée', pill: 'todo' },
  EN_COURS: { label: 'En cours', pill: 'progress' },
  TERMINEE: { label: 'Terminée', pill: 'done' },
  CONFIRMEE: { label: 'Confirmée', pill: 'confirmed' },
};

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'DECLAREE', label: 'Déclarée' },
  { value: 'TERMINEE', label: 'Terminée' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'VALIDEE', label: 'Validée' },
  { value: 'CONFIRMEE', label: 'Confirmée' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };

function matchesDeadlineRange(deadline, range) {
  if (!range) return true;
  const date = new Date(deadline);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (range === 'today') return dateOnly.getTime() === startOfToday.getTime();
  if (range === 'past') return dateOnly.getTime() < startOfToday.getTime();
  if (range === 'week') {
    const weekEnd = new Date(startOfToday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return dateOnly >= startOfToday && dateOnly < weekEnd;
  }
  if (range === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  return true;
}

function AdminTasksToValidate() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMotif, setBulkMotif] = useState('');
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [motifs, setMotifs] = useState({});

  async function load() {
    try {
      const data = await taskService.getTasks();
      setTasks(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
    }
  }

  useEffect(() => {
    load();
    userService
      .getAllUsers({ role: 'EMPLOYEE' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!detailTaskId) {
      setDetailTask(null);
      return;
    }
    taskService.getTask(detailTaskId).then(setDetailTask).catch(() => setDetailTask(null));
  }, [detailTaskId]);

  function employeeName(id) {
    const found = employees.find((e) => e.id === id);
    return found ? found.full_name : id;
  }

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesStatus = !statusFilter || task.status === statusFilter;
        const matchesPriority = !priorityFilter || task.priority === priorityFilter;
        const matchesEmployee = !employeeFilter || task.assigned_to === employeeFilter;
        const matchesDeadline = matchesDeadlineRange(task.deadline, deadlineFilter);
        return matchesStatus && matchesPriority && matchesEmployee && matchesDeadline;
      }),
    [tasks, statusFilter, priorityFilter, employeeFilter, deadlineFilter]
  );

  const hasFilters = statusFilter || priorityFilter || employeeFilter || deadlineFilter;
  const allVisibleSelected = filteredTasks.length > 0 && filteredTasks.every((t) => selectedIds.includes(t.id));

  function resetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setEmployeeFilter('');
    setDeadlineFilter('');
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTasks.map((t) => t.id));
    }
  }

  async function handleValidateOne(id) {
    try {
      await taskService.validateTask(id);
      notifySuccess("Tâche validée : elle est maintenant visible par l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la tâche');
    }
  }

  async function handleConfirmOne(id) {
    try {
      await taskService.confirmTask(id);
      notifySuccess('Tâche confirmée');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de confirmer la tâche');
    }
  }

  async function handleRejectOne(id) {
    const motif = motifs[id];
    if (!motif || !motif.trim()) {
      notifyError('Le motif est requis pour renvoyer une tâche');
      return;
    }
    try {
      await taskService.rejectTask(id, motif);
      notifySuccess("Tâche renvoyée à l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renvoyer la tâche');
    }
  }

  async function handleBulkConfirm() {
    if (!window.confirm(`Confirmer ${selectedIds.length} tâche(s) sélectionnée(s) ?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => taskService.confirmTask(id)));
      notifySuccess(`${selectedIds.length} tâche(s) confirmée(s)`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      notifyError("Certaines tâches n'ont pas pu être confirmées (statut invalide ?)");
      await load();
    }
  }

  async function handleBulkReject() {
    if (!bulkMotif.trim()) {
      notifyError('Le motif est requis pour le renvoi groupé');
      return;
    }
    if (!window.confirm(`Le motif "${bulkMotif}" sera appliqué aux ${selectedIds.length} tâches sélectionnées. Continuer ?`)) {
      return;
    }
    try {
      await Promise.all(selectedIds.map((id) => taskService.rejectTask(id, bulkMotif)));
      notifySuccess(`${selectedIds.length} tâche(s) renvoyée(s)`);
      setSelectedIds([]);
      setBulkMotif('');
      await load();
    } catch (err) {
      notifyError("Certaines tâches n'ont pas pu être renvoyées (statut invalide ?)");
      await load();
    }
  }

  return (
    <div className="validate-page">
      <div className="admin-filter-bar">
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
          <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Toutes priorités</option>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="FAIBLE">Faible</option>
          </select>
          <select className="filter-select" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Tous les employés</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
          <select className="filter-select" value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)}>
            <option value="">Toutes échéances</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="past">Passée</option>
          </select>
          {hasFilters && (
            <button type="button" className="admin-filter-reset" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="validate-listhead">
        <label className="validate-selectall">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} disabled={filteredTasks.length === 0} />
          Tout sélectionner
        </label>
        <span className="validate-count">
          {filteredTasks.length} tâche{filteredTasks.length > 1 ? 's' : ''}
        </span>
      </div>

      {selectedIds.length > 0 && (
        <div className="validate-bulk">
          <span className="validate-bulk-count">{selectedIds.length} sélectionnée(s)</span>
          <button type="button" className="btn-primary validate-bulk-confirm" onClick={handleBulkConfirm}>
            <IconCheckCircle />
            Confirmer ({selectedIds.length})
          </button>
          <div className="validate-bulk-reject">
            <input
              className="form-input"
              placeholder="Motif (appliqué à toute la sélection)"
              value={bulkMotif}
              onChange={(e) => setBulkMotif(e.target.value)}
            />
            <button type="button" className="btn-danger" onClick={handleBulkReject}>
              Renvoyer ({selectedIds.length})
            </button>
          </div>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>
      ) : (
        <div className="validate-list">
          {filteredTasks.map((task) => {
            const meta = STATUS_META[task.status] || { label: task.status, pill: 'declared' };
            const canValidate = task.status === 'DECLAREE';
            const canReview = task.status === 'TERMINEE';
            const selected = selectedIds.includes(task.id);
            return (
              <div key={task.id} className={`validate-card${selected ? ' validate-card--selected' : ''}`}>
                <label className="validate-card-check">
                  <input type="checkbox" checked={selected} onChange={() => toggleSelect(task.id)} />
                </label>

                <div className="validate-card-body">
                  <div className="validate-card-top">
                    <button type="button" className="validate-card-title" onClick={() => setDetailTaskId(task.id)}>
                      {task.title}
                    </button>
                    <span className={`pill pill--${meta.pill}`}>{meta.label}</span>
                  </div>

                  <div className="validate-card-meta">
                    <span className="validate-meta-item">
                      <span
                        className={`priority-dot priority-dot--${PRIORITY_CLS[task.priority] || 'normale'}`}
                      />
                      {task.priority}
                    </span>
                    <span className="validate-meta-sep" />
                    <span>{employeeName(task.assigned_to)}</span>
                    <span className="validate-meta-sep" />
                    <span>Échéance : {task.deadline ? formatDate(task.deadline) : '—'}</span>
                  </div>

                  {canReview && (
                    <div className="validate-card-actions">
                      <button type="button" className="validate-action-confirm" onClick={() => handleConfirmOne(task.id)}>
                        <IconCheckCircle />
                        Confirmer
                      </button>
                      <div className="validate-reject-row">
                        <input
                          className="form-input"
                          placeholder="Motif de renvoi"
                          value={motifs[task.id] || ''}
                          onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                        />
                        <button type="button" className="validate-action-reject" onClick={() => handleRejectOne(task.id)}>
                          Renvoyer
                        </button>
                      </div>
                    </div>
                  )}

                  {canValidate && (
                    <div className="validate-card-actions">
                      <button type="button" className="btn-primary validate-action-validate" onClick={() => handleValidateOne(task.id)}>
                        <IconArrowRight />
                        Valider (rendre visible à l'employé)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailTask && (
        <>
          <div className="emp-drawer-overlay" onClick={() => setDetailTaskId(null)} />
          <aside className="emp-drawer" role="dialog" aria-label="Détail de la tâche">
            <button type="button" className="emp-drawer-close" onClick={() => setDetailTaskId(null)} aria-label="Fermer">
              <IconX />
            </button>

            <header className="validate-detail-head">
              <span className="lists-content-eyebrow">Tâche</span>
              <h2>{detailTask.title}</h2>
              <div className="validate-detail-pills">
                <span className={`pill pill--${(STATUS_META[detailTask.status] || {}).pill || 'declared'}`}>
                  {(STATUS_META[detailTask.status] || {}).label || detailTask.status}
                </span>
                <span className="validate-meta-item">
                  <span className={`priority-dot priority-dot--${PRIORITY_CLS[detailTask.priority] || 'normale'}`} />
                  {detailTask.priority}
                </span>
              </div>
            </header>

            {detailTask.description && <p className="validate-detail-desc">{detailTask.description}</p>}

            <div className="validate-detail-meta">
              <span>Échéance : {detailTask.deadline ? formatDate(detailTask.deadline) : '—'}</span>
            </div>

            <section className="emp-drawer-section">
              <h3 className="app-section-title">Pièces jointes</h3>
              <AttachmentUpload taskId={detailTask.id} canUpload={false} />
            </section>

            <section className="emp-drawer-section">
              <h3 className="app-section-title">Commentaires & notes</h3>
              <CommentSection taskId={detailTask.id} />
            </section>
          </aside>
        </>
      )}
    </div>
  );
}

export default AdminTasksToValidate;
