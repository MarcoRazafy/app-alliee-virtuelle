import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate, formatBytes } from '../../utils/formatters';
import RichTextEditor from '../../components/RichTextEditor';
import {
  IconChecklist,
  IconFolder,
  IconUser,
  IconCalendarWeek,
  IconChat,
  IconArrowRight,
  IconCheckCircle,
  IconPaperclip,
  IconX,
} from '../../components/icons';
import '../../styles/admin.css';

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent', cls: 'urgent' },
  { value: 'HAUTE', label: 'Haute', cls: 'haute' },
  { value: 'NORMALE', label: 'Normale', cls: 'normale' },
  { value: 'FAIBLE', label: 'Faible', cls: 'faible' },
];

// Aligné sur la limite backend (config/upload.js). Les fichiers sont retenus localement
// puis envoyés APRÈS la création de la tâche (l'upload a besoin de l'id de la tâche).
const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 5 Mo

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

function AdminCreateTask() {
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

  // Sélection hiérarchique Space > Folder > List, entièrement optionnelle
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
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    } finally {
      setSubmitting(false);
    }
  }

  const assignedNames = useMemo(
    () => employees.filter((emp) => assignedIds.includes(emp.id)).map((emp) => emp.full_name),
    [employees, assignedIds]
  );
  const priorityMeta = PRIORITIES.find((p) => p.value === form.priority);
  const spaceName = spaces.find((s) => s.id === selectedSpaceId)?.name;
  const folderName = folders.find((f) => f.id === selectedFolderId)?.name;
  const listName = lists.find((l) => l.id === form.list_id)?.name;
  const locationPath = [spaceName, folderName, listName].filter(Boolean);

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-form-main">
        {/* Détails */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconChecklist />
            Détails de la tâche
          </h2>

          <div className="form-field">
            <label className="form-label" htmlFor="title">
              Titre <span className="form-required">*</span>
            </label>
            <input
              id="title"
              name="title"
              className="form-input"
              value={form.title}
              onChange={handleChange}
              placeholder="Ex. Rédiger le rapport mensuel"
              required
            />
          </div>

          <div className="form-field">
            <span className="form-label">Description</span>
            <RichTextEditor
              value={form.description}
              onChange={(html) => setForm((f) => ({ ...f, description: html }))}
              placeholder="Précisez le contexte, les attentes, les livrables… (mise en forme disponible)"
            />
          </div>

          <div className="form-field">
            <span className="form-label">Priorité</span>
            <div className="priority-chip-row">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`priority-chip${form.priority === p.value ? ' priority-chip--active' : ''}`}
                  onClick={() => setForm({ ...form, priority: p.value })}
                >
                  <span className={`priority-dot priority-dot--${p.cls}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">
              Employés assignés <span className="form-required">*</span>
              <span className="assignee-hint"> — 1 ou plusieurs (une tâche par employé)</span>
            </label>
            <div className="assignee-checklist">
              {employees.length === 0 && <p className="assignee-empty">Aucun employé disponible.</p>}
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
              <p className="assignee-note">Une seule tâche, partagée par les {assignedIds.length} personnes sélectionnées.</p>
            )}
          </div>
        </section>

        {/* Planification */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconCalendarWeek />
            Planification
          </h2>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="start_date">
                Date de début
              </label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                className="form-input"
                value={form.start_date}
                onChange={handleChange}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="deadline">
                Échéance <span className="form-required">*</span>
              </label>
              <input
                id="deadline"
                name="deadline"
                type="date"
                className="form-input"
                value={form.deadline}
                onChange={handleChange}
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>
        </section>

        {/* Emplacement */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconFolder />
            Emplacement <span className="admin-form-card-optional">optionnel</span>
          </h2>

          <div className="form-field">
            <label className="form-label" htmlFor="space">
              Espace
            </label>
            <div className="form-inline">
              <select id="space" className="form-select" value={selectedSpaceId} onChange={(e) => setSelectedSpaceId(e.target.value)}>
                <option value="">Aucun espace (tâche libre)</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className="form-add-btn" onClick={() => setShowNewSpace((v) => !v)}>
                + Espace
              </button>
            </div>
            {showNewSpace && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="Nom de l'espace"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateSpace}>
                  Créer
                </button>
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="folder">
              Dossier
            </label>
            <div className="form-inline">
              <select
                id="folder"
                className="form-select"
                value={selectedFolderId}
                disabled={!selectedSpaceId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
              >
                <option value="">Aucun dossier</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="form-add-btn"
                disabled={!selectedSpaceId}
                onClick={() => setShowNewFolder((v) => !v)}
              >
                + Dossier
              </button>
            </div>
            {showNewFolder && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="Nom du dossier"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateFolder}>
                  Créer
                </button>
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="list_id">
              Liste
            </label>
            <div className="form-inline">
              <select
                id="list_id"
                name="list_id"
                className="form-select"
                value={form.list_id}
                disabled={!selectedFolderId}
                onChange={handleChange}
              >
                <option value="">Aucune liste</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="form-add-btn"
                disabled={!selectedFolderId}
                onClick={() => setShowNewList((v) => !v)}
              >
                + Liste
              </button>
            </div>
            {showNewList && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="Nom de la liste"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateList}>
                  Créer
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Client */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconChat />
            Client <span className="admin-form-card-optional">optionnel</span>
          </h2>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="client_name">
                Nom du client
              </label>
              <input
                id="client_name"
                name="client_name"
                className="form-input"
                value={form.client_name}
                onChange={handleChange}
                placeholder="Ex. Société Dupont"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="client_email">
                Email du client
              </label>
              <input
                id="client_email"
                name="client_email"
                type="email"
                className="form-input"
                value={form.client_email}
                onChange={handleChange}
                placeholder="contact@client.com"
              />
            </div>
          </div>
        </section>

        {/* Pièces jointes */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconPaperclip />
            Pièces jointes <span className="admin-form-card-optional">optionnel</span>
          </h2>
          <div className="upload-zone">
            <label className="upload-btn">
              <IconPaperclip />
              Ajouter des fichiers
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={handleFilesSelected}
                style={{ display: 'none' }}
              />
            </label>
            <span className="create-attach-hint">PDF, images, Word, Excel — 5 Mo max par fichier</span>
          </div>
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
        </section>
      </div>

      {/* Aperçu + actions (sticky) */}
      <aside className="admin-form-side">
        <div className="task-preview">
          <span className="task-preview-label">Aperçu</span>
          <h3 className="task-preview-title">{form.title.trim() || 'Sans titre'}</h3>

          {priorityMeta && (
            <span className={`pill priority-pill priority-pill--${priorityMeta.cls}`}>
              <span className={`priority-dot priority-dot--${priorityMeta.cls}`} />
              {priorityMeta.label}
            </span>
          )}

          <div className="task-preview-rows">
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconUser /></span>
              <span>{assignedNames.length > 0 ? assignedNames.join(', ') : 'Non assignée'}</span>
            </div>
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconCalendarWeek /></span>
              <span>{form.deadline ? `Échéance : ${formatDate(form.deadline)}` : 'Sans échéance'}</span>
            </div>
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconFolder /></span>
              <span>{locationPath.length ? locationPath.join(' › ') : 'Tâche libre'}</span>
            </div>
          </div>

          <div className="task-preview-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : <IconCheckCircle />}
              {submitting ? 'Création…' : 'Créer la tâche'}
            </button>
            <button type="button" className="btn-outline" onClick={resetAll} disabled={submitting}>
              Réinitialiser
            </button>
          </div>

          <p className="task-preview-hint">
            <IconArrowRight />
            L'employé assigné verra la tâche dans son espace après création.
          </p>
        </div>
      </aside>
    </form>
  );
}

export default AdminCreateTask;
