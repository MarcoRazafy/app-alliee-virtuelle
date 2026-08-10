import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import AttachmentUpload from '../../components/AttachmentUpload';
import CommentSection from '../../components/CommentSection';
import AdminLateTasks from './AdminLateTasks';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import { IconCheckCircle, IconX, IconSearch, IconArrowRight, IconExternalLink, IconPlus, IconTrash } from '../../components/icons';
import '../../styles/admin.css';
import { PageSkeleton } from '../../components/Skeleton';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

const STATUS_META = {
  DECLAREE: { label: 'Déclarée', pill: 'declared' },
  VALIDEE: { label: 'À faire', pill: 'todo' },
  EN_COURS: { label: 'En cours', pill: 'progress' },
  TERMINEE: { label: 'Terminée', pill: 'done' },
  CONFIRMEE: { label: 'Confirmée', pill: 'confirmed' },
};

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'DECLAREE', label: 'Déclarée' },
  { value: 'TERMINEE', label: 'Terminée' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'VALIDEE', label: 'À faire' },
  { value: 'CONFIRMEE', label: 'Confirmée' },
];

const PRIORITY_CLS = { URGENT: 'urgent', HAUTE: 'haute', NORMALE: 'normale', FAIBLE: 'faible' };
const ACTIONABLE_STATUSES = new Set(['DECLAREE', 'TERMINEE']);

function isActionableTask(task) {
  return ACTIONABLE_STATUSES.has(task.status);
}

function bulkResultMessage(results, actionLabel) {
  const failures = results.filter((result) => result.status === 'rejected');
  const successCount = results.length - failures.length;

  if (failures.length === 0) {
    return { success: true, message: `${successCount} tâche(s) ${actionLabel}(s)` };
  }

  const firstReason = failures[0].reason?.response?.data?.error;
  return {
    success: false,
    message: `${successCount} réussie(s), ${failures.length} échec(s).${firstReason ? ` ${firstReason}` : ''}`,
  };
}

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
  const [activeTab, setActiveTab] = useState('validate'); // 'validate' | 'late'
  const [lateCount, setLateCount] = useState(0);
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
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await taskService.getTasks();
      setTasks(data);
      const actionableIds = new Set(data.filter(isActionableTask).map((task) => task.id));
      setSelectedIds((current) => current.filter((id) => actionableIds.has(id)));
      return data;
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    userService
      .getAllUsers({ role: 'EMPLOYEE' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
    taskService
      .getLateTasks()
      .then((late) => setLateCount(late.length))
      .catch(() => setLateCount(0));
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
      tasks
        .filter((task) => {
        const matchesStatus = !statusFilter || task.status === statusFilter;
        const matchesPriority = !priorityFilter || task.priority === priorityFilter;
        const matchesEmployee = !employeeFilter || task.assigned_to === employeeFilter;
        const matchesDeadline = matchesDeadlineRange(task.deadline, deadlineFilter);
        return matchesStatus && matchesPriority && matchesEmployee && matchesDeadline;
        })
        .sort((a, b) => {
          const updatedA = new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0).getTime();
          const updatedB = new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0).getTime();
          return updatedB - updatedA;
        }),
    [tasks, statusFilter, priorityFilter, employeeFilter, deadlineFilter]
  );

  const hasFilters = statusFilter || priorityFilter || employeeFilter || deadlineFilter;
  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));
  const selectedDoneIds = selectedTasks.filter((task) => task.status === 'TERMINEE').map((task) => task.id);
  const selectedDeclaredIds = selectedTasks.filter((task) => task.status === 'DECLAREE').map((task) => task.id);
  const allVisibleSelected =
    filteredTasks.length > 0 && filteredTasks.every((task) => selectedIds.includes(task.id));
  const isProcessing = pendingAction !== null;

  function resetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setEmployeeFilter('');
    setDeadlineFilter('');
  }

  function toggleSelect(id) {
    // On peut cocher N'IMPORTE QUELLE tâche (pour la suppression groupée) ; les actions
    // valider/confirmer/renvoyer ne s'appliquent qu'au sous-ensemble concerné (déclarées/terminées).
    if (isProcessing) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredTasks.map((task) => task.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedIds((current) => [...new Set([...current, ...filteredTasks.map((task) => task.id)])]);
    }
  }

  async function handleConfirmOne(id) {
    setPendingAction(`confirm:${id}`);
    try {
      // Relecture juste avant l'action : la liste peut être ancienne (autre admin,
      // validation automatique ou changement depuis un autre onglet).
      const current = await taskService.getTask(id);
      if (current.status !== 'TERMINEE') {
        throw Object.assign(new Error('Statut changé'), {
          response: { data: { error: `La tâche n'est plus terminée (statut actuel : ${current.status})` } },
        });
      }
      await taskService.confirmTask(id);
      notifySuccess('Tâche confirmée');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de confirmer la tâche');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRejectOne(id) {
    const motif = motifs[id];
    if (!motif || !motif.trim()) {
      notifyError('Le motif est requis pour renvoyer une tâche');
      return;
    }
    setPendingAction(`reject:${id}`);
    try {
      await taskService.rejectTask(id, motif);
      notifySuccess("Tâche renvoyée à l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renvoyer la tâche');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleValidateOne(id) {
    setPendingAction(`validate:${id}`);
    try { await taskService.validateTask(id); notifySuccess('Tâche validée'); await load(); }
    catch (err) { notifyError(err.response?.data?.error || 'Impossible de valider la tâche'); }
    finally { setPendingAction(null); }
  }

  // Suppression groupée : supprime toutes les tâches cochées (n'importe quel statut). Admin.
  async function handleBulkDelete() {
    if (selectedIds.length === 0 || isProcessing) return;
    if (
      !window.confirm(
        `Supprimer définitivement ${selectedIds.length} tâche(s) ?\n\n` +
          'Cette action est irréversible et supprime aussi leurs sous-tâches, commentaires, chronos et pièces jointes.'
      )
    ) {
      return;
    }
    setPendingAction('bulk-delete');
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => taskService.deleteTask(id)));
      const outcome = bulkResultMessage(results, 'supprimée');
      if (outcome.success) notifySuccess(outcome.message);
      else notifyError(outcome.message);
      setSelectedIds([]);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer les tâches');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkConfirm() {
    if (selectedDoneIds.length === 0 || isProcessing) return;
    if (!window.confirm(`Confirmer ${selectedDoneIds.length} tâche(s) terminée(s) ?`)) return;

    setPendingAction('bulk-confirm');
    try {
      // La sélection peut contenir un statut devenu obsolète depuis le dernier
      // chargement. On relit la liste avant d'envoyer les confirmations afin de ne
      // transmettre au backend que les tâches encore TERMINEE.
      const latestTasks = await taskService.getTasks();
      const selectedSet = new Set(selectedDoneIds);
      const confirmableIds = latestTasks
        .filter((task) => selectedSet.has(task.id) && task.status === 'TERMINEE')
        .map((task) => task.id);
      const staleIds = selectedDoneIds.filter((id) => !confirmableIds.includes(id));

      const results = await Promise.allSettled(confirmableIds.map((id) => taskService.confirmTask(id)));
      const outcome = bulkResultMessage(results, 'confirmée');
      const staleMessage = staleIds.length
        ? ` ${staleIds.length} tâche(s) ignorée(s) : leur statut a changé entre le chargement et la confirmation.`
        : '';
      if (outcome.success && staleIds.length === 0) notifySuccess(outcome.message);
      else if (outcome.success) notifyError(`${outcome.message}.${staleMessage}`);
      else notifyError(`${outcome.message}${staleMessage}`);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de recharger les tâches avant confirmation');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkReject() {
    if (selectedDoneIds.length === 0 || isProcessing) return;
    if (!bulkMotif.trim()) {
      notifyError('Le motif est requis pour le renvoi groupé');
      return;
    }
    if (!window.confirm(`Le motif "${bulkMotif}" sera appliqué aux ${selectedDoneIds.length} tâches terminées. Continuer ?`)) {
      return;
    }

    setPendingAction('bulk-reject');
    try {
      const results = await Promise.allSettled(selectedDoneIds.map((id) => taskService.rejectTask(id, bulkMotif)));
      const outcome = bulkResultMessage(results, 'renvoyée');
      if (outcome.success) {
        notifySuccess(outcome.message);
        setBulkMotif('');
      } else {
        notifyError(outcome.message);
      }
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) return <PageSkeleton variant="list" />;

  return (
    <div className="validate-page">
      <div className="atv-toolbar">
        <div className="atv-tabs">
          <button
            type="button"
            className={`atv-tab${activeTab === 'validate' ? ' atv-tab--active' : ''}`}
            onClick={() => setActiveTab('validate')}
          >
            À valider
          </button>
          <button
            type="button"
            className={`atv-tab${activeTab === 'late' ? ' atv-tab--active' : ''}`}
            onClick={() => setActiveTab('late')}
          >
            En retard
            {lateCount > 0 && <span className="atv-tab-badge">{lateCount}</span>}
          </button>
        </div>
        <Link to="/admin/create-task" className="btn-primary atv-create-btn">
          <IconPlus /> Créer une tâche
        </Link>
      </div>

      {activeTab === 'late' ? (
        <AdminLateTasks />
      ) : (
        <>
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
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            disabled={filteredTasks.length === 0 || isProcessing}
          />
          Tout sélectionner
        </label>
        <span className="validate-count">
          {filteredTasks.length} tâche{filteredTasks.length > 1 ? 's' : ''}
        </span>
      </div>

      {selectedIds.length > 0 && (
        <div className="validate-bulk">
          <span className="validate-bulk-count">{selectedIds.length} sélectionnée(s)</span>
          {selectedDoneIds.length > 0 && (
            <>
              <button
                type="button"
                className="btn-primary validate-bulk-confirm"
                onClick={handleBulkConfirm}
                disabled={isProcessing}
              >
                <IconCheckCircle />
                {pendingAction === 'bulk-confirm' ? 'Confirmation…' : `Confirmer (${selectedDoneIds.length})`}
              </button>
              <div className="validate-bulk-reject">
                <input
                  className="form-input"
                  placeholder="Motif pour les tâches terminées"
                  value={bulkMotif}
                  onChange={(e) => setBulkMotif(e.target.value)}
                  disabled={isProcessing}
                />
                <button type="button" className="btn-danger" onClick={handleBulkReject} disabled={isProcessing}>
                  {pendingAction === 'bulk-reject' ? 'Renvoi…' : `Renvoyer (${selectedDoneIds.length})`}
                </button>
              </div>
            </>
          )}
          {selectedDeclaredIds.length > 0 && (
            <button type="button" className="btn-primary" onClick={async () => { await Promise.all(selectedDeclaredIds.map((id) => taskService.validateTask(id))); await load(); }} disabled={isProcessing}>
              <IconArrowRight /> Valider ({selectedDeclaredIds.length})
            </button>
          )}
          <button type="button" className="btn-danger validate-bulk-delete" onClick={handleBulkDelete} disabled={isProcessing}>
            <IconTrash />
            {pendingAction === 'bulk-delete' ? 'Suppression…' : `Supprimer (${selectedIds.length})`}
          </button>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>
      ) : (
        <div className="validate-list">
          {filteredTasks.map((task) => {
            const meta = STATUS_META[task.status] || { label: task.status, pill: 'declared' };
            const canReview = task.status === 'TERMINEE';
            const canValidate = task.status === 'DECLAREE';
            const selected = selectedIds.includes(task.id);
            return (
              <div key={task.id} className={`validate-card${selected ? ' validate-card--selected' : ''}`}>
                <label className="validate-card-check" aria-label={`Sélectionner la tâche ${task.title}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(task.id)}
                    disabled={isProcessing}
                  />
                </label>

                <div className="validate-card-body">
                  <div className="validate-card-top">
                    <button type="button" className="validate-card-title" onClick={() => setDetailTaskId(task.id)}>
                      {task.title}
                    </button>
                    <span className={`pill pill--${meta.pill}`}>{meta.label}</span>
                    <Link
                      to={`/tasks/${task.id}`}
                      className="validate-card-open"
                      title="Ouvrir le détail de la tâche"
                      aria-label={`Ouvrir le détail de la tâche ${task.title}`}
                    >
                      <IconExternalLink />
                    </Link>
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

                  {canValidate && (
                    <div className="validate-card-actions"><button type="button" className="validate-action-confirm" onClick={() => handleValidateOne(task.id)} disabled={isProcessing}><IconArrowRight /> Valider</button></div>
                  )}
                  {canReview && (
                    <div className="validate-card-actions">
                      <button
                        type="button"
                        className="validate-action-confirm"
                        onClick={() => handleConfirmOne(task.id)}
                        disabled={isProcessing}
                      >
                        <IconCheckCircle />
                        {pendingAction === `confirm:${task.id}` ? 'Confirmation…' : 'Confirmer'}
                      </button>
                      <div className="validate-reject-row">
                        <input
                          className="form-input"
                          placeholder="Motif de renvoi"
                          value={motifs[task.id] || ''}
                          onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                          disabled={isProcessing}
                        />
                        <button
                          type="button"
                          className="validate-action-reject"
                          onClick={() => handleRejectOne(task.id)}
                          disabled={isProcessing}
                        >
                          {pendingAction === `reject:${task.id}` ? 'Renvoi…' : 'Renvoyer'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
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

            {detailTask.description && (
              <div
                className="validate-detail-desc rich-text"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(detailTask.description) }}
              />
            )}

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
