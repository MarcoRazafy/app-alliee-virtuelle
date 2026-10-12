import { useEffect, useMemo, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as hierarchyService from '../../services/hierarchyService';
import { formatBytes } from '../../utils/formatters';
import { IconX, IconAlert, IconCalendarWeek, IconFolder, IconChat, IconPaperclip } from '../icons';
import RichTextEditor from '../RichTextEditor';
import ProjectPicker from '../ProjectPicker';
import { htmlToText } from '../../utils/sanitizeHtml';
import { notifySuccess, notifyError } from '../../utils/toast';
import '../../styles/task-detail.css';
import '../../styles/admin-create-task.css';

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

const MAX_ATTACH_SIZE = 5 * 1024 * 1024;

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

function NewTaskModal({ open, onClose, onCreated }) {
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState(EMPTY_NEW_TASK);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [projectLists, setProjectLists] = useState([]);

  useEffect(() => {
    if (!open) return;
    hierarchyService
      .getSpacesTree()
      .then((tree) => setProjectLists(flattenLists(tree)))
      .catch(() => setProjectLists([]));
  }, [open]);

  const minDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  function handleFilesSelected(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    addPendingFiles(chosen);
  }

  function addPendingFiles(chosen) {
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
      onClose();
      await onCreated?.(created);
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
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
          <button type="button" className="modal-card-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        <p className="modal-card-hint">
          Votre tâche sera immédiatement « À faire » : vous pourrez la démarrer tout de suite.
        </p>

        <form className="tk-create-modal-form" onSubmit={handleCreateTask}>
          <input
            className="tk-create-title"
            value={newTask.title}
            onChange={(e) => setNewTask((c) => ({ ...c, title: e.target.value }))}
            placeholder="Nom de la tâche…"
            maxLength={255}
            required
            autoFocus
          />

          <div className="tk-props">
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

          <div className="tk-desc-block tk-create-desc">
            <p className="tk-section-label">Description</p>
            <RichTextEditor
              value={newTask.description}
              onChange={(html) => setNewTask((c) => ({ ...c, description: html }))}
              placeholder="Détails (facultatif, mise en forme disponible)"
              onPasteFiles={addPendingFiles}
            />
          </div>

          <div className="tk-footer">
            <button type="button" className="btn-outline" onClick={onClose}>
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
  );
}

export default NewTaskModal;
