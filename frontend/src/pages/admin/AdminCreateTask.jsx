import { useEffect, useMemo, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { formatDate } from '../../utils/formatters';
import {
  IconChecklist,
  IconFolder,
  IconUser,
  IconCalendarWeek,
  IconChat,
  IconArrowRight,
  IconCheckCircle,
} from '../../components/icons';
import '../../styles/admin.css';

const PRIORITIES = [
  { value: 'URGENT', label: 'Urgent', cls: 'urgent' },
  { value: 'HAUTE', label: 'High', cls: 'haute' },
  { value: 'NORMALE', label: 'Normal', cls: 'normale' },
  { value: 'FAIBLE', label: 'Low', cls: 'faible' },
];

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
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Sélection hiérarchique Space > Folder > List, entièrement optionnelle
  const [spaces, setSpaces] = useState([]);
  const [folders, setFolders] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');

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
      .then(setFolders)
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
      .then(setLists)
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
      notifySuccess('Space created');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to create the space');
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
      notifySuccess('Folder created');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to create the folder');
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
      notifySuccess('List created');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to create the list');
    }
  }

  function resetAll() {
    setForm(EMPTY_FORM);
    setSelectedSpaceId('');
    setSelectedFolderId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.list_id) delete payload.list_id;
      if (!payload.client_name) delete payload.client_name;
      if (!payload.client_email) delete payload.client_email;
      await taskService.createTask(payload);
      notifySuccess('Task sent to the employee: it can be started immediately');
      resetAll();
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Unable to create the task');
    } finally {
      setSubmitting(false);
    }
  }

  const assignedEmployee = useMemo(
    () => employees.find((emp) => emp.id === form.assigned_to),
    [employees, form.assigned_to]
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
            Task details
          </h2>

          <div className="form-field">
            <label className="form-label" htmlFor="title">
              Title <span className="form-required">*</span>
            </label>
            <input
              id="title"
              name="title"
              className="form-input"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Write the monthly report"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              className="form-textarea"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="Specify the context, expectations, deliverables…"
            />
          </div>

          <div className="form-field">
            <span className="form-label">Priority</span>
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
            <label className="form-label" htmlFor="assigned_to">
              Assigned employee <span className="form-required">*</span>
            </label>
            <select
              id="assigned_to"
              name="assigned_to"
              className="form-select"
              value={form.assigned_to}
              onChange={handleChange}
              required
            >
              <option value="">Choose an employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.position})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Planification */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconCalendarWeek />
            Scheduling
          </h2>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="start_date">
                Start date
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
                Deadline <span className="form-required">*</span>
              </label>
              <input
                id="deadline"
                name="deadline"
                type="date"
                className="form-input"
                value={form.deadline}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </section>

        {/* Emplacement */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconFolder />
            Location <span className="admin-form-card-optional">optional</span>
          </h2>

          <div className="form-field">
            <label className="form-label" htmlFor="space">
              Space
            </label>
            <div className="form-inline">
              <select id="space" className="form-select" value={selectedSpaceId} onChange={(e) => setSelectedSpaceId(e.target.value)}>
                <option value="">No space (free task)</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className="form-add-btn" onClick={() => setShowNewSpace((v) => !v)}>
                + Space
              </button>
            </div>
            {showNewSpace && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="Space name"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateSpace}>
                  Create
                </button>
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="folder">
              Folder
            </label>
            <div className="form-inline">
              <select
                id="folder"
                className="form-select"
                value={selectedFolderId}
                disabled={!selectedSpaceId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
              >
                <option value="">No folder</option>
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
                + Folder
              </button>
            </div>
            {showNewFolder && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateFolder}>
                  Create
                </button>
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="list_id">
              List
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
                <option value="">No list</option>
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
                + List
              </button>
            </div>
            {showNewList && (
              <div className="form-quick-add">
                <input
                  className="form-input"
                  placeholder="List name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-outline form-quick-add-btn" onClick={handleCreateList}>
                  Create
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Client */}
        <section className="admin-form-card">
          <h2 className="admin-form-card-title">
            <IconChat />
            Client <span className="admin-form-card-optional">optional</span>
          </h2>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="client_name">
                Client name
              </label>
              <input
                id="client_name"
                name="client_name"
                className="form-input"
                value={form.client_name}
                onChange={handleChange}
                placeholder="e.g. Dupont Ltd"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="client_email">
                Client email
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
      </div>

      {/* Aperçu + actions (sticky) */}
      <aside className="admin-form-side">
        <div className="task-preview">
          <span className="task-preview-label">Preview</span>
          <h3 className="task-preview-title">{form.title.trim() || 'Untitled'}</h3>

          {priorityMeta && (
            <span className={`pill priority-pill priority-pill--${priorityMeta.cls}`}>
              <span className={`priority-dot priority-dot--${priorityMeta.cls}`} />
              {priorityMeta.label}
            </span>
          )}

          <div className="task-preview-rows">
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconUser /></span>
              <span>{assignedEmployee ? assignedEmployee.full_name : 'Unassigned'}</span>
            </div>
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconCalendarWeek /></span>
              <span>{form.deadline ? `Deadline: ${formatDate(form.deadline)}` : 'No deadline'}</span>
            </div>
            <div className="task-preview-row">
              <span className="task-preview-row-icon"><IconFolder /></span>
              <span>{locationPath.length ? locationPath.join(' › ') : 'Free task'}</span>
            </div>
          </div>

          <div className="task-preview-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : <IconCheckCircle />}
              {submitting ? 'Creating…' : 'Create the task'}
            </button>
            <button type="button" className="btn-outline" onClick={resetAll} disabled={submitting}>
              Reset
            </button>
          </div>

          <p className="task-preview-hint">
            <IconArrowRight />
            The assigned employee will see the task in their space after creation.
          </p>
        </div>
      </aside>
    </form>
  );
}

export default AdminCreateTask;
