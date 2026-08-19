import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatBytes } from '../../utils/formatters';
import RichTextEditor from '../../components/RichTextEditor';
import {
  IconFolder,
  IconUser,
  IconCalendarWeek,
  IconChat,
  IconAlert,
  IconPaperclip,
  IconX,
} from '../../components/icons';
import '../../styles/admin.css';
import '../../styles/task-detail.css';
import '../../styles/admin-create-task.css';

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent', cls: 'urgent' },
  { value: 'HAUTE', label: 'Haute', cls: 'haute' },
  { value: 'NORMALE', label: 'Normale', cls: 'normale' },
  { value: 'FAIBLE', label: 'Faible', cls: 'faible' },
];

// Aligné sur la limite backend (config/upload.js). Les fichiers sont retenus localement
// puis envoyés APRÈS la création de la tâche (l'upload a besoin de l'id de la tâche).
const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 5 Mo

function initialsOf(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

// Un niveau de la cascade projet (Espace / Dossier / Liste) : select + « + créer » dépliable.
function CascadeField({
  label,
  required,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  addLabel,
  showNew,
  onToggleNew,
  newValue,
  onNewChange,
  onCreate,
}) {
  return (
    <div className="tk-cascade-field">
      <span className="tk-cascade-label">
        {label}
        {required && <span className="form-required"> *</span>}
      </span>
      <div className="form-inline">
        <select className="form-select" value={value} disabled={disabled} onChange={onChange}>
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="button" className="form-add-btn" disabled={disabled} onClick={onToggleNew}>
          {addLabel}
        </button>
      </div>
      {showNew && (
        <div className="form-quick-add">
          <input
            className="form-input"
            placeholder={`Nom : ${label.toLowerCase()}`}
            value={newValue}
            onChange={onNewChange}
            autoFocus
          />
          <button type="button" className="btn-outline form-quick-add-btn" onClick={onCreate}>
            Créer
          </button>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'NORMALE',
  deadline: '',
  start_date: '',
  list_id: '',
  client_name: '',
  client_email: '',
};

function AdminCreateTask({ isModal = false, onClose } = {}) {
  const location = useLocation();
  // Pré-remplissage : action « Refaire » (champs de la tâche) et/ou « Ajouter une tâche » depuis un
  // projet (placement = { spaceId, folderId, listId } → pré-sélectionne la cascade, restant modifiable).
  const prefill = location.state?.prefill || {};
  const [employees, setEmployees] = useState([]);
  // Pièces jointes retenues localement jusqu'à la création de la tâche.
  const [pendingFiles, setPendingFiles] = useState([]);
  const [form, setForm] = useState(() => {
    const initial = { ...EMPTY_FORM, ...prefill };
    delete initial.placement;
    return initial;
  });
  // Multi-assignation : 1 ou plusieurs employés (une tâche est créée par employé sélectionné).
  const [assignedIds, setAssignedIds] = useState(() => (prefill.assigned_to ? [prefill.assigned_to] : []));
  const [submitting, setSubmitting] = useState(false);
  const [showAssignManage, setShowAssignManage] = useState(false); // panneau de sélection des assignés

  // Sélection hiérarchique Space > Folder > List
  const [spaces, setSpaces] = useState([]);
  const [folders, setFolders] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => prefill.placement?.spaceId || '');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  // Emplacement à appliquer en cascade au chargement (dossier puis liste, une fois chargés).
  const pendingPlacementRef = useRef(prefill.placement || null);

  // Création rapide d'un nouvel espace/dossier/liste sans quitter le formulaire
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showNewSpace, setShowNewSpace] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  useEffect(() => {
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
    hierarchyService
      .getSpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, []);

  useEffect(() => {
    if (!selectedSpaceId) {
      setFolders([]);
      setSelectedFolderId('');
      return;
    }
    hierarchyService
      .getFolders(selectedSpaceId)
      .then((data) => {
        setFolders(data);
        // Cascade de pré-remplissage : sélectionne le dossier attendu une fois chargé.
        const pending = pendingPlacementRef.current;
        if (pending?.folderId && data.some((f) => f.id === pending.folderId)) {
          setSelectedFolderId(pending.folderId);
        }
      })
      .catch(() => setFolders([]));
  }, [selectedSpaceId]);

  useEffect(() => {
    if (!selectedFolderId) {
      setLists([]);
      setForm((prev) => ({ ...prev, list_id: '' }));
      return;
    }
    hierarchyService
      .getLists(selectedFolderId)
      .then((data) => {
        setLists(data);
        const pending = pendingPlacementRef.current;
        if (pending?.listId && data.some((l) => l.id === pending.listId)) {
          setForm((prev) => ({ ...prev, list_id: pending.listId }));
        }
        pendingPlacementRef.current = null; // placement consommé
      })
      .catch(() => setLists([]));
  }, [selectedFolderId]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleCreateSpace(e) {
    e.preventDefault();
    if (!newSpaceName.trim()) return;
    try {
      const space = await hierarchyService.createSpace({ name: newSpaceName });
      setSpaces((prev) => [...prev, space]);
      setSelectedSpaceId(space.id);
      setNewSpaceName('');
      setShowNewSpace(false);
      notifySuccess('Espace créé');
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible de créer l'espace");
    }
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim() || !selectedSpaceId) return;
    try {
      const folder = await hierarchyService.createFolder({ name: newFolderName, space_id: selectedSpaceId });
      setFolders((prev) => [...prev, folder]);
      setSelectedFolderId(folder.id);
      setNewFolderName('');
      setShowNewFolder(false);
      notifySuccess('Dossier créé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de créer le dossier');
    }
  }

  async function handleCreateList(e) {
    e.preventDefault();
    if (!newListName.trim() || !selectedFolderId) return;
    try {
      const list = await hierarchyService.createList({ name: newListName, folder_id: selectedFolderId });
      setLists((prev) => [...prev, list]);
      setForm((prev) => ({ ...prev, list_id: list.id }));
      setNewListName('');
      setShowNewList(false);
      notifySuccess('Liste créée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de créer la liste');
    }
  }

  function resetAll() {
    setForm(EMPTY_FORM);
    setAssignedIds([]);
    setSelectedSpaceId('');
    setSelectedFolderId('');
    setPendingFiles([]);
    setShowAssignManage(false);
  }

  function handleFilesSelected(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = ''; // permet de re-sélectionner le même fichier
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (assignedIds.length === 0) {
      notifyError('Sélectionnez au moins un employé');
      return;
    }
    if (!form.list_id) {
      notifyError('Sélectionnez un projet (liste)');
      return;
    }
    setSubmitting(true);
    try {
      const base = { ...form };
      delete base.assigned_to;
      if (!base.list_id) delete base.list_id;
      if (!base.client_name) delete base.client_name;
      if (!base.client_email) delete base.client_email;

      // UNE SEULE tâche, partagée par tous les employés sélectionnés (assignation multiple).
      const created = await taskService.createTask({ ...base, assignee_ids: assignedIds });

      // Pièces jointes : envoyées APRÈS la création (l'upload cible l'id de la tâche).
      // Best-effort : un échec d'upload ne remet pas en cause la tâche déjà créée.
      let attachFailed = 0;
      if (created?.id && pendingFiles.length > 0) {
        const results = await Promise.allSettled(
          pendingFiles.map((file) => taskService.uploadAttachment(created.id, file))
        );
        attachFailed = results.filter((r) => r.status === 'rejected').length;
      }

      notifySuccess(
        assignedIds.length === 1 ? 'Tâche créée' : `Tâche créée et assignée à ${assignedIds.length} personnes`
      );
      if (attachFailed > 0) {
        notifyError(`${attachFailed} pièce(s) jointe(s) n'ont pas pu être envoyées.`);
      }
      resetAll();
      if (isModal && onClose) onClose(); // en modale : on ferme la fenêtre après création
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedEmployees = useMemo(
    () => employees.filter((emp) => assignedIds.includes(emp.id)),
    [employees, assignedIds]
  );
  const spaceName = spaces.find((s) => s.id === selectedSpaceId)?.name;
  const folderName = folders.find((f) => f.id === selectedFolderId)?.name;
  const listName = lists.find((l) => l.id === form.list_id)?.name;
  const locationPath = [spaceName, folderName, listName].filter(Boolean);
  const todayStr = new Date().toISOString().slice(0, 10);
  const canSubmit = form.title.trim() && form.deadline && form.list_id && assignedIds.length > 0 && !submitting;

  return (
    <form className="tk-create" onSubmit={handleSubmit}>
      {/* En-tête : fil d'Ariane du projet + titre */}
      <div className="tk-create-head">
        {locationPath.length > 0 && <p className="tk-breadcrumb">{locationPath.join(' › ')}</p>}
        <input
          className="tk-create-title"
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Nom de la tâche…"
          maxLength={255}
          autoFocus
          required
        />
      </div>

      {/* Grille de propriétés (façon fiche détail) */}
      <div className="tk-props tk-create-props">
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
                    form.priority === p.value ? ' priority-option--active' : ''
                  }`}
                  onClick={() => setForm({ ...form, priority: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </span>
        </div>

        {/* Assignés */}
        <div className="tk-prop">
          <span className="tk-prop-label">
            <IconUser /> Assignés <span className="form-required">*</span>
          </span>
          <span className="tk-prop-value">
            <span className="tk-assignees">
              {selectedEmployees.length === 0 && <span className="tk-empty">Personne</span>}
              {selectedEmployees.map((emp) => (
                <span key={emp.id} className="tk-assignee-chip">
                  <span className="tk-assignee-avatar tk-assignee-avatar--initials">{initialsOf(emp.full_name)}</span>
                  <span className="tk-assignee-name">{emp.full_name}</span>
                </span>
              ))}
              <button type="button" className="tk-prop-edit" onClick={() => setShowAssignManage((v) => !v)}>
                {showAssignManage ? 'Fermer' : 'Gérer'}
              </button>
            </span>
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
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                max={form.deadline || undefined}
                aria-label="Date de début"
              />
              <span className="tk-date-arrow" aria-hidden="true">→</span>
              <input
                type="date"
                className="tk-date-input tk-date-due"
                name="deadline"
                value={form.deadline}
                onChange={handleChange}
                min={form.start_date || todayStr}
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
              name="client_name"
              value={form.client_name}
              onChange={handleChange}
              placeholder="Nom (optionnel)"
            />
            <input
              className="tk-date-input"
              type="email"
              name="client_email"
              value={form.client_email}
              onChange={handleChange}
              placeholder="Email (optionnel)"
            />
          </span>
        </div>

        {/* Panneau de sélection des assignés (dépliable) */}
        {showAssignManage && (
          <div className="tk-prop tk-prop--full">
            <div className="tk-prop-value tk-prop-value--block">
              <div className="tk-create-assign-panel">
                {employees.length === 0 && <p className="tk-empty">Aucun employé disponible.</p>}
                {employees.map((emp) => {
                  const checked = assignedIds.includes(emp.id);
                  return (
                    <label key={emp.id} className={`assignee-check${checked ? ' assignee-check--on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAssignedIds((cur) =>
                            cur.includes(emp.id) ? cur.filter((x) => x !== emp.id) : [...cur, emp.id]
                          )
                        }
                      />
                      <span>
                        {emp.full_name} <em>({emp.position})</em>
                      </span>
                    </label>
                  );
                })}
              </div>
              {assignedIds.length > 1 && (
                <p className="assignee-note">
                  Une seule tâche, partagée par les {assignedIds.length} personnes sélectionnées.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Projet (cascade Espace › Dossier › Liste) — pleine largeur, requis */}
        <div className="tk-prop tk-prop--full">
          <span className="tk-prop-label">
            <IconFolder /> Projet <span className="form-required">*</span>
          </span>
          <div className="tk-prop-value tk-prop-value--block">
            <div className="tk-create-cascade">
              <CascadeField
                label="Espace"
                value={selectedSpaceId}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                options={spaces}
                placeholder="Choisir un espace…"
                addLabel="+ Espace"
                showNew={showNewSpace}
                onToggleNew={() => setShowNewSpace((v) => !v)}
                newValue={newSpaceName}
                onNewChange={(e) => setNewSpaceName(e.target.value)}
                onCreate={handleCreateSpace}
              />
              <CascadeField
                label="Dossier"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                options={folders}
                disabled={!selectedSpaceId}
                placeholder="Choisir un dossier…"
                addLabel="+ Dossier"
                showNew={showNewFolder}
                onToggleNew={() => setShowNewFolder((v) => !v)}
                newValue={newFolderName}
                onNewChange={(e) => setNewFolderName(e.target.value)}
                onCreate={handleCreateFolder}
              />
              <CascadeField
                label="Liste"
                required
                value={form.list_id}
                onChange={(e) => setForm((f) => ({ ...f, list_id: e.target.value }))}
                options={lists}
                disabled={!selectedFolderId}
                placeholder="Choisir une liste…"
                addLabel="+ Liste"
                showNew={showNewList}
                onToggleNew={() => setShowNewList((v) => !v)}
                newValue={newListName}
                onNewChange={(e) => setNewListName(e.target.value)}
                onCreate={handleCreateList}
              />
            </div>
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
          value={form.description}
          onChange={(html) => setForm((f) => ({ ...f, description: html }))}
          placeholder="Précisez le contexte, les attentes, les livrables… (mise en forme disponible)"
        />
      </div>

      {/* Pied : actions */}
      <div className="tk-footer">
        <button type="button" className="btn-outline" onClick={resetAll} disabled={submitting}>
          Réinitialiser
        </button>
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {submitting ? 'Création…' : 'Créer la tâche'}
        </button>
      </div>
    </form>
  );
}

// Version fenêtre modale (ouverte par-dessus la page via le pattern « background location »).
export function CreateTaskModal() {
  const navigate = useNavigate();
  const close = () => navigate(-1);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') navigate(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return createPortal(
    <div className="task-modal-overlay" role="presentation" onMouseDown={close}>
      <div
        className="task-modal task-modal--create"
        role="dialog"
        aria-modal="true"
        aria-label="Créer une tâche"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="task-modal-close" onClick={close} aria-label="Fermer">
          <IconX />
        </button>
        <div className="task-modal-body">
          <AdminCreateTask isModal onClose={close} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AdminCreateTask;
