import { useEffect, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import * as hierarchyService from '../../services/hierarchyService';
import { notifySuccess, notifyError } from '../../utils/toast';

function AdminCreateTask() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'NORMALE',
    deadline: '',
    start_date: '',
    list_id: '',
    client_name: '',
    client_email: '',
  });

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

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.list_id) delete payload.list_id;
      if (!payload.client_name) delete payload.client_name;
      if (!payload.client_email) delete payload.client_email;
      const result = await taskService.createTask(payload);
      notifySuccess(`Tâche créée avec le statut ${result.status}`);
      setForm({
        title: '',
        description: '',
        assigned_to: '',
        priority: 'NORMALE',
        deadline: '',
        start_date: '',
        list_id: '',
        client_name: '',
        client_email: '',
      });
      setSelectedSpaceId('');
      setSelectedFolderId('');
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    }
  }

  return (
    <div>
      <h1>Créer une tâche</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="space">Espace</label>
          <select id="space" value={selectedSpaceId} onChange={(e) => setSelectedSpaceId(e.target.value)}>
            <option value="">Aucun espace (tâche libre)</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setShowNewSpace((v) => !v)}>
            + Nouvel espace
          </button>
          {showNewSpace && (
            <span>
              <input
                placeholder="Nom de l'espace"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={handleCreateSpace}>
                Créer
              </button>
            </span>
          )}
        </div>
        <div>
          <label htmlFor="folder">Dossier</label>
          <select
            id="folder"
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
          <button type="button" disabled={!selectedSpaceId} onClick={() => setShowNewFolder((v) => !v)}>
            + Nouveau dossier
          </button>
          {showNewFolder && (
            <span>
              <input
                placeholder="Nom du dossier"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={handleCreateFolder}>
                Créer
              </button>
            </span>
          )}
        </div>
        <div>
          <label htmlFor="list_id">Liste</label>
          <select id="list_id" name="list_id" value={form.list_id} disabled={!selectedFolderId} onChange={handleChange}>
            <option value="">Aucune liste</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!selectedFolderId} onClick={() => setShowNewList((v) => !v)}>
            + Nouvelle liste
          </button>
          {showNewList && (
            <span>
              <input
                placeholder="Nom de la liste"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={handleCreateList}>
                Créer
              </button>
            </span>
          )}
        </div>

        <div>
          <label htmlFor="title">Titre</label>
          <input id="title" name="title" value={form.title} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" value={form.description} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="client_name">Nom du client (optionnel)</label>
          <input id="client_name" name="client_name" value={form.client_name} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="client_email">Email du client (optionnel)</label>
          <input
            id="client_email"
            name="client_email"
            type="email"
            value={form.client_email}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="assigned_to">Employé assigné</label>
          <select id="assigned_to" name="assigned_to" value={form.assigned_to} onChange={handleChange} required>
            <option value="">Choisir un employé</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} ({emp.position})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority">Priorité</label>
          <select id="priority" name="priority" value={form.priority} onChange={handleChange}>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="FAIBLE">Faible</option>
          </select>
        </div>
        <div>
          <label htmlFor="start_date">Date de début</label>
          <input id="start_date" name="start_date" type="date" value={form.start_date} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="deadline">Deadline</label>
          <input id="deadline" name="deadline" type="date" value={form.deadline} onChange={handleChange} required />
        </div>
        <button type="submit">Créer la tâche</button>
      </form>
    </div>
  );
}

export default AdminCreateTask;
