import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as hierarchyService from '../services/hierarchyService';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { formatDurationShort, formatBytes } from '../utils/formatters';
import { STATUS_PILL, priorityPillClass, formatRelativeDeadline } from '../utils/taskStatus';
import { IconExternalLink, IconChecklist, IconX, IconAlert, IconCalendarWeek, IconFolder, IconChat, IconPaperclip } from '../components/icons';
import RichTextEditor from '../components/RichTextEditor';
import { htmlToText } from '../utils/sanitizeHtml';
import { notifySuccess, notifyError } from '../utils/toast';
import '../styles/task-detail.css';
import '../styles/admin-create-task.css';

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

function MyTasks() {
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
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
      const enriched = await Promise.all(
        data.map(async (task) => {
          if (task.status === 'TERMINEE' || task.status === 'CONFIRMEE') {
            const history = await taskService.getTimelogHistory(task.id);
            const total = history.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
            return { ...task, totalDuration: total, displayStatus: task.status };
          }
          if (task.status === 'EN_COURS') {
            const history = await taskService.getTimelogHistory(task.id);
            const hasActiveSession = history.some((s) => !s.end_time);
            return { ...task, displayStatus: hasActiveSession ? 'EN_COURS' : 'A_REPRENDRE' };
          }
          return { ...task, displayStatus: task.status };
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

      notifySuccess('Tâche proposée : en attente de validation par un administrateur');
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
    return tasks.filter((task) => {
      const search = filters.search.toLowerCase();
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        htmlToText(task.description || '').toLowerCase().includes(search);
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(task.displayStatus);
      const matchesPriority = filters.priorities.length === 0 || filters.priorities.includes(task.priority);
      const matchesDeadline = matchesDeadlineRange(task.deadline, filters.deadlineRange);
      return matchesSearch && matchesStatus && matchesPriority && matchesDeadline;
    });
  }, [tasks, filters]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const paginatedTasks = filteredTasks.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <EmployeeLayout
      title="Mes tâches"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Mes tâches' }]}
      subtitle="Retrouvez et filtrez l'ensemble de vos tâches assignées"
      skeleton={loading ? 'list' : null}
    >
      <div className="mytasks-toolbar">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <IconChecklist /> Proposer une tâche
        </button>
      </div>

      <SearchBar onChange={setFilters} />

      <p className="results-count">{filteredTasks.length} tâche(s) trouvée(s)</p>

      <div className="side-card">
        {filteredTasks.length === 0 && <div className="empty-state">Aucune tâche ne correspond à ces filtres.</div>}
        {filteredTasks.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
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
                  <tr key={task.id}>
                    <td>
                      <Link
                        to={`/tasks/${task.id}`}
                        state={{ backgroundLocation: location }}
                        className="task-table-title"
                      >
                        {task.title}
                      </Link>
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
                <h2 id="new-task-title">Proposer une tâche</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setCreateOpen(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Votre tâche sera soumise à un administrateur. Vous pourrez la démarrer une fois validée.
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
                    <select
                      className="form-select tk-create-project"
                      value={newTask.list_id}
                      onChange={(e) => setNewTask((c) => ({ ...c, list_id: e.target.value }))}
                      required
                    >
                      <option value="" disabled>
                        Sélectionnez un projet…
                      </option>
                      {projectLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.path}
                        </option>
                      ))}
                    </select>
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
                  {creating ? 'Envoi…' : 'Proposer la tâche'}
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
