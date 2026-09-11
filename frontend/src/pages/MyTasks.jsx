import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as hierarchyService from '../services/hierarchyService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort, formatBytes } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline, displayStatusOf, isTaskLate } from '../utils/taskStatus';
import { IconExternalLink, IconChecklist, IconX, IconAlert, IconCalendarWeek, IconFolder, IconChat, IconPaperclip, IconTrash } from '../components/icons';
import RichTextEditor from '../components/RichTextEditor';
import { htmlToText } from '../utils/sanitizeHtml';
import { notifySuccess, notifyError } from '../utils/toast';
import '../styles/task-detail.css';
import '../styles/admin-create-task.css';
import ProjectPicker from '../components/ProjectPicker';
import useAuthStore from '../store/authStore';

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'FAIBLE', label: 'Faible' },
];

const EMPTY_NEW_TASK = {
  title: '',
  description: '',
  priority: 'NORMALE',
  deadline: '',
  start_date: '',
  list_id: '',
  client_name: '',
  client_email: '',
};

const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 5 Mo (aligné au backend)

// Aplatit l'arborescence Espace > Projet > Liste en une liste d'options « Espace › Projet › Liste ».
function flattenLists(tree) {
  const out = [];
  (tree || []).forEach((space) => {
    (space.folders || []).forEach((folder) => {
      (folder.lists || []).forEach((list) => {
        out.push({ id: list.id, path: `${space.name} › ${folder.name} › ${list.name}` });
      });
    });
  });
  return out;
}

// Ordres d'affichage proposés. « Plus récentes » est le défaut : une tâche qu'on vient de
// créer doit se voir tout de suite, alors qu'un tri par échéance la renvoyait en dernière
// page dès que son échéance était lointaine.
const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'deadline_asc', label: 'Échéance proche' },
  { value: 'deadline_desc', label: 'Échéance lointaine' },
];

// Comparaison sûre : une date absente part en fin de liste plutôt que de remonter en tête
// par accident (une valeur vide se compare mal).
function byDate(field, direction) {
  return (a, b) => {
    const va = a[field] ? new Date(a[field]).getTime() : null;
    const vb = b[field] ? new Date(b[field]).getTime() : null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direction === 'asc' ? va - vb : vb - va;
  };
}

function sortTasks(list, sort) {
  const rows = [...list];
  if (sort === 'oldest') return rows.sort(byDate('created_at', 'asc'));
  if (sort === 'deadline_asc') return rows.sort(byDate('deadline', 'asc'));
  if (sort === 'deadline_desc') return rows.sort(byDate('deadline', 'desc'));
  return rows.sort(byDate('created_at', 'desc'));
}

// `task` et non la seule échéance : « En retard » dépend AUSSI du statut — une tâche
// terminée après l'échéance n'est pas en retard, elle est faite.
function matchesDeadlineRange(task, range) {
  if (!range) return true;

  const deadline = task?.deadline;
  if (!deadline) return false;

  if (range === 'late') {
    // Même définition que côté admin (utils/taskStatus), pour que l'employé et son
    // responsable comptent la même chose.
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return isTaskLate(task, todayYMD);
  }

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

function MyTasks() {
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  // Sélection pour suppression groupée. Ne concerne QUE les tâches créées par l'employé :
  // il ne peut pas supprimer celles qu'on lui a confiées.
  const [sort, setSort] = useState('recent');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', statuses: [], priorities: [], deadlineRange: '' });
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState(EMPTY_NEW_TASK);
  const [pendingFiles, setPendingFiles] = useState([]); // pièces jointes retenues jusqu'à la création

  function handleFilesSelected(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    if (chosen.length === 0) return;
    const tooBig = chosen.filter((f) => f.size > MAX_ATTACH_SIZE);
    if (tooBig.length) {
      notifyError(`Fichier(s) trop volumineux (max 5 Mo) : ${tooBig.map((f) => f.name).join(', ')}`);
    }
    const ok = chosen.filter((f) => f.size <= MAX_ATTACH_SIZE);
    if (ok.length) setPendingFiles((cur) => [...cur, ...ok]);
  }
  function removePendingFile(index) {
    setPendingFiles((cur) => cur.filter((_, i) => i !== index));
  }
  // Projets (listes) proposés au choix — optionnel — à la création d'une tâche (#4).
  const [projectLists, setProjectLists] = useState([]);

  useEffect(() => {
    hierarchyService
      .getSpacesTree()
      .then((tree) => setProjectLists(flattenLists(tree)))
      .catch(() => setProjectLists([]));
  }, []);

  // La deadline doit être strictement postérieure à aujourd'hui (validation backend).
  const minDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  async function loadTasks() {
    try {
      const data = await taskService.getTasks();
      // Le statut affiché vient désormais de `has_active_session`, fourni par l'API : plus
      // besoin d'un appel par tâche pour savoir si le chrono tourne (et l'admin lit la
      // même information, donc les deux côtés affichent le même statut).
      const enriched = await Promise.all(
        data.map(async (task) => {
          const displayStatus = displayStatusOf(task);
          if (task.status === 'TERMINEE' || task.status === 'CONFIRMEE') {
            const history = await taskService.getTimelogHistory(task.id);
            const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
            return { ...task, totalDuration: total, displayStatus };
          }
          return { ...task, displayStatus };
        })
      );
      setTasks(enriched);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    // Recharge la liste après création d'une tâche (sans actualiser la page).
    const onTasksChanged = () => loadTasks();
    window.addEventListener('tasks:changed', onTasksChanged);
    return () => window.removeEventListener('tasks:changed', onTasksChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.deadline || !newTask.list_id) return;
    setCreating(true);
    try {
      const created = await taskService.createTask({
        title: newTask.title.trim(),
        description: htmlToText(newTask.description) ? newTask.description : '',
        priority: newTask.priority,
        deadline: newTask.deadline,
        start_date: newTask.start_date || null,
        list_id: newTask.list_id || null,
        client_name: newTask.client_name.trim() || null,
        client_email: newTask.client_email.trim() || null,
      });

      // Pièces jointes : envoyées APRÈS la création (best-effort, comme côté admin).
      let attachFailed = 0;
      if (created?.id && pendingFiles.length > 0) {
        const results = await Promise.allSettled(
          pendingFiles.map((file) => taskService.uploadAttachment(created.id, file))
        );
        attachFailed = results.filter((r) => r.status === 'rejected').length;
      }

      notifySuccess('Tâche créée : elle est « À faire », vous pouvez la démarrer');
      if (attachFailed > 0) notifyError(`${attachFailed} pièce(s) jointe(s) n'ont pas pu être envoyées.`);
      setNewTask(EMPTY_NEW_TASK);
      setPendingFiles([]);
      setCreateOpen(false);
      await loadTasks();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    } finally {
      setCreating(false);
    }
  }

  const filteredTasks = useMemo(() => {
    const rows = tasks.filter((task) => {
      const search = filters.search.toLowerCase();
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        htmlToText(task.description || '').toLowerCase().includes(search);
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(task.displayStatus);
      const matchesPriority = filters.priorities.length === 0 || filters.priorities.includes(task.priority);
      const matchesDeadline = matchesDeadlineRange(task, filters.deadlineRange);
      return matchesSearch && matchesStatus && matchesPriority && matchesDeadline;
    });
    return sortTasks(rows, sort);
  }, [tasks, filters, sort]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  const paginatedTasks = filteredTasks.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Tâche créée par l'employé lui-même : la seule qu'il puisse supprimer.
  const isMine = (task) => Boolean(user?.id && task.created_by === user.id);

  // La sélection porte sur la liste FILTRÉE, pas seulement la page affichée : sinon
  // « tout sélectionner » ne ferait qu'une page et le compte serait trompeur.
  const mineInView = filteredTasks.filter(isMine);
  const selectedInView = mineInView.filter((t) => selectedIds.includes(t.id));
  const allMineSelected = mineInView.length > 0 && selectedInView.length === mineInView.length;

  function toggleSelected(taskId) {
    setSelectedIds((cur) => (cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]));
  }

  function toggleSelectAll() {
    setSelectedIds(allMineSelected ? [] : mineInView.map((t) => t.id));
  }

  async function deleteSelected() {
    if (selectedInView.length === 0 || deleting) return;
    const count = selectedInView.length;
    const message =
      `Supprimer ${count} tâche${count > 1 ? 's' : ''} que vous avez créée${count > 1 ? 's' : ''} ?\n\n` +
      'Cette action est définitive et supprime aussi leurs commentaires, chronos et pièces jointes.';
    if (!window.confirm(message)) return;

    setDeleting(true);
    try {
      // En série plutôt qu'en parallèle : si l'une échoue, les précédentes sont déjà
      // parties et le rechargement montrera exactement ce qui reste.
      for (const task of selectedInView) {
        await taskService.deleteTask(task.id);
      }
      setSelectedIds([]);
      await loadTasks();
      notifySuccess(`${count} tâche${count > 1 ? 's supprimées' : ' supprimée'}`);
    } catch (err) {
      await loadTasks();
      notifyError(err.response?.data?.error || 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <EmployeeLayout
      title="Mes tâches"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches' }]}
      subtitle="Retrouvez et filtrez l'ensemble de vos tâches assignées"
      skeleton={loading ? 'list' : null}
    >
      <div className="mytasks-toolbar">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <IconChecklist /> Créer une tâche
        </button>
      </div>

      <SearchBar onChange={setFilters} />

      <div className="mt-list-head">
        <div className="mt-list-head-left">
          <p className="results-count">{filteredTasks.length} tâche(s) trouvée(s)</p>
          <label className="mt-sort">
            <span>Trier par</span>
            <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedInView.length > 0 && (
          <div className="mt-bulk-bar">
            <span>
              {selectedInView.length} sélectionnée{selectedInView.length > 1 ? 's' : ''}
            </span>
            <button type="button" className="mt-bulk-clear" onClick={() => setSelectedIds([])}>
              Annuler
            </button>
            <button type="button" className="btn-danger mt-bulk-delete" onClick={deleteSelected} disabled={deleting}>
              <IconTrash /> {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        )}
      </div>

      <div className="side-card">
        {filteredTasks.length === 0 && <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>}
        {filteredTasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th className="mt-select-col">
                    {mineInView.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allMineSelected}
                        onChange={toggleSelectAll}
                        aria-label="Sélectionner toutes mes tâches"
                        title="Sélectionner toutes les tâches que j'ai créées"
                      />
                    )}
                  </th>
                  <th>Tâche</th>
                  <th>Projet / Contexte</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                  <th>Priorité</th>
                  <th>Durée totale</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => (
                  <tr key={task.id} className={selectedIds.includes(task.id) ? 'mt-row--selected' : undefined}>
                    <td className="mt-select-col">
                      {/* Case à cocher seulement sur ses propres tâches : proposer de
                          sélectionner ce qu'on ne peut pas supprimer serait une impasse. */}
                      {isMine(task) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(task.id)}
                          onChange={() => toggleSelected(task.id)}
                          aria-label={`Sélectionner « ${task.title} »`}
                        />
                      )}
                    </td>
                    <td>
                      <span className="mt-title-cell">
                        {/* Point bleu : repère les tâches que l'employé a créées lui-même,
                            les seules qu'il puisse supprimer. */}
                        {isMine(task) && (
                          <span className="mt-mine-dot" title="Tâche que vous avez créée" aria-label="Tâche que vous avez créée" />
                        )}
                        <Link
                          to={`/tasks/${task.id}`}
                          state={{ backgroundLocation: location }}
                          className="task-table-title"
                        >
                          {task.title}
                        </Link>
                      </span>
                    </td>
                    <td>{task.list_name && <span className="task-table-project">{task.list_name}</span>}</td>
                    <td>{formatRelativeDeadline(task.deadline)}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[task.displayStatus]?.className || ''}`}>
                        {STATUS_PILL[task.displayStatus]?.label || task.displayStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
                    </td>
                    <td>{task.totalDuration != null ? formatDurationShort(task.totalDuration) : '—'}</td>
                    <td>
                      <Link
                        to={`/tasks/${task.id}`}
                        state={{ backgroundLocation: location }}
                        className="icon-link-btn"
                        aria-label="Ouvrir la tâche"
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

      {filteredTasks.length > 0 && (
        <Pagination
          page={page}
          totalItems={filteredTasks.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}

      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <div
            className="modal-card modal-card--task"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-card-head">
              <div>
                <p className="modal-card-eyebrow">Nouvelle tâche</p>
                <h2 id="new-task-title">Créer une tâche</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setCreateOpen(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Votre tâche sera immédiatement « À faire » : vous pourrez la démarrer tout de suite.
            </p>

            <form className="tk-create-modal-form" onSubmit={handleCreateTask}>
              {/* Titre */}
              <input
                className="tk-create-title"
                value={newTask.title}
                onChange={(e) => setNewTask((c) => ({ ...c, title: e.target.value }))}
                placeholder="Nom de la tâche…"
                maxLength={255}
                required
                autoFocus
              />

              {/* Propriétés */}
              <div className="tk-props">
                {/* Priorité */}
                <div className="tk-prop">
                  <span className="tk-prop-label">
                    <IconAlert /> Priorité
                  </span>
                  <span className="tk-prop-value">
                    <div className="tk-priority-picker">
                      {PRIORITIES.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          className={`priority-option priority-option--${p.value.toLowerCase()}${
                            newTask.priority === p.value ? ' priority-option--active' : ''
                          }`}
                          onClick={() => setNewTask((c) => ({ ...c, priority: p.value }))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </span>
                </div>

                {/* Dates : Début → Échéance */}
                <div className="tk-prop">
                  <span className="tk-prop-label">
                    <IconCalendarWeek /> Dates
                  </span>
                  <span className="tk-prop-value">
                    <span className="tk-dates">
                      <input
                        type="date"
                        className="tk-date-input"
                        value={newTask.start_date}
                        max={newTask.deadline || undefined}
                        onChange={(e) => setNewTask((c) => ({ ...c, start_date: e.target.value }))}
                        aria-label="Date de début"
                      />
                      <span className="tk-date-arrow" aria-hidden="true">→</span>
                      <input
                        type="date"
                        className="tk-date-input tk-date-due"
                        value={newTask.deadline}
                        min={newTask.start_date || minDeadline}
                        onChange={(e) => setNewTask((c) => ({ ...c, deadline: e.target.value }))}
                        required
                        aria-label="Échéance (requise)"
                      />
                    </span>
                  </span>
                </div>

                {/* Client (optionnel) */}
                <div className="tk-prop">
                  <span className="tk-prop-label">
                    <IconChat /> Client
                  </span>
                  <span className="tk-prop-value tk-create-client">
                    <input
                      className="tk-date-input"
                      value={newTask.client_name}
                      onChange={(e) => setNewTask((c) => ({ ...c, client_name: e.target.value }))}
                      placeholder="Nom (optionnel)"
                    />
                    <input
                      className="tk-date-input"
                      type="email"
                      value={newTask.client_email}
                      onChange={(e) => setNewTask((c) => ({ ...c, client_email: e.target.value }))}
                      placeholder="Email (optionnel)"
                    />
                  </span>
                </div>

                {/* Projet (pleine largeur, requis) */}
                <div className="tk-prop tk-prop--full">
                  <span className="tk-prop-label">
                    <IconFolder /> Projet <span className="form-required">*</span>
                  </span>
                  <div className="tk-prop-value tk-prop-value--block">
                    <ProjectPicker
                      projects={projectLists}
                      value={newTask.list_id}
                      onChange={(listId) => setNewTask((c) => ({ ...c, list_id: listId }))}
                      required
                    />
                  </div>
                </div>

                {/* Pièces jointes — libellé cliquable (sans bouton bordé) */}
                <div className="tk-prop tk-prop--full">
                  <label className="tk-prop-label tk-attach-trigger" title="Cliquer pour joindre un fichier">
                    <IconPaperclip /> Pièces jointes
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                      onChange={handleFilesSelected}
                      className="attach-hidden-input"
                    />
                  </label>
                  <div className="tk-prop-value tk-prop-value--block">
                    <p className="create-attach-hint">PDF, images, Word, Excel — 5 Mo max par fichier</p>
                    {pendingFiles.length > 0 && (
                      <div className="create-attach-list">
                        {pendingFiles.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="create-attach-item">
                            <IconPaperclip />
                            <span className="create-attach-name">{file.name}</span>
                            <span className="create-attach-size">{formatBytes(file.size)}</span>
                            <button
                              type="button"
                              className="create-attach-remove"
                              onClick={() => removePendingFile(index)}
                              aria-label={`Retirer ${file.name}`}
                            >
                              <IconX />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="tk-desc-block tk-create-desc">
                <p className="tk-section-label">Description</p>
                <RichTextEditor
                  value={newTask.description}
                  onChange={(html) => setNewTask((c) => ({ ...c, description: html }))}
                  placeholder="Détails (facultatif, mise en forme disponible)"
                />
              </div>

              {/* Pied */}
              <div className="tk-footer">
                <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating || !newTask.title.trim() || !newTask.deadline || !newTask.list_id}
                >
                  {creating ? 'Création…' : 'Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </EmployeeLayout>
  );
}

export default MyTasks;
