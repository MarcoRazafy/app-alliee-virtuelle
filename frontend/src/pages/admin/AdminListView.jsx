import { useEffect, useState } from 'react';
import HierarchyTree from '../../components/admin/HierarchyTree';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import { notifySuccess, notifyError } from '../../utils/toast';

// Ordre = celui du workflow (DECISIONS.md) : une tâche neuve tombe toujours dans "Déclarée"
const STATUS_GROUPS = [
  { key: 'DECLAREE', label: 'Déclarée (à valider)' },
  { key: 'VALIDEE', label: 'À faire' },
  { key: 'EN_COURS', label: 'En cours' },
  { key: 'TERMINEE', label: 'Terminée' },
  { key: 'CONFIRMEE', label: 'Confirmée' },
];

function AdminListView() {
  const [selectedListId, setSelectedListId] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [quickAdd, setQuickAdd] = useState({ title: '', assigned_to: '', deadline: '', priority: 'NORMALE' });
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  function loadTasks(listId) {
    taskService
      .getTasks({ list_id: listId })
      .then(setTasks)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches'));
  }

  function handleSelectList(listId, list) {
    setSelectedListId(listId);
    setSelectedList(list);
    setShowQuickAdd(false);
    loadTasks(listId);
  }

  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickAdd.title.trim() || !quickAdd.assigned_to || !quickAdd.deadline) {
      notifyError("Nom, employé assigné et échéance sont requis pour créer une tâche");
      return;
    }
    try {
      await taskService.createTask({
        title: quickAdd.title,
        assigned_to: quickAdd.assigned_to,
        priority: quickAdd.priority,
        deadline: quickAdd.deadline,
        list_id: selectedListId,
      });
      notifySuccess('Tâche créée');
      setQuickAdd({ title: '', assigned_to: '', deadline: '', priority: 'NORMALE' });
      setShowQuickAdd(false);
      loadTasks(selectedListId);
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    }
  }

  return (
    <div>
      <h1>Listes</h1>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
          <h2>Arborescence</h2>
          <HierarchyTree onSelectList={handleSelectList} selectedListId={selectedListId} />
        </div>

        <div style={{ flex: 2, border: '1px solid black', padding: '10px' }}>
          {!selectedList && <p>Sélectionnez une liste à gauche.</p>}
          {selectedList && (
            <>
              <h2>{selectedList.name}</h2>
              {STATUS_GROUPS.map((group) => {
                const groupTasks = tasks.filter((t) => t.status === group.key);
                return (
                  <div key={group.key} style={{ marginBottom: '20px' }}>
                    <h3>
                      {group.label} ({groupTasks.length})
                    </h3>
                    <table border="1" cellPadding="6">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Assigné à</th>
                          <th>Échéance</th>
                          <th>Priorité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupTasks.map((task) => (
                          <tr key={task.id}>
                            <td>
                              <a href={`/tasks/${task.id}`}>{task.title}</a>
                            </td>
                            <td>{task.assigned_to_name}</td>
                            <td>{task.deadline}</td>
                            <td>{task.priority}</td>
                          </tr>
                        ))}
                        {group.key === 'DECLAREE' && showQuickAdd && (
                          <tr>
                            <td>
                              <input
                                placeholder="Nom de la tâche"
                                value={quickAdd.title}
                                onChange={(e) => setQuickAdd({ ...quickAdd, title: e.target.value })}
                                autoFocus
                              />
                            </td>
                            <td>
                              <select
                                value={quickAdd.assigned_to}
                                onChange={(e) => setQuickAdd({ ...quickAdd, assigned_to: e.target.value })}
                              >
                                <option value="">Choisir</option>
                                {employees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.full_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="date"
                                value={quickAdd.deadline}
                                onChange={(e) => setQuickAdd({ ...quickAdd, deadline: e.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                value={quickAdd.priority}
                                onChange={(e) => setQuickAdd({ ...quickAdd, priority: e.target.value })}
                              >
                                <option value="URGENT">Urgent</option>
                                <option value="HAUTE">Haute</option>
                                <option value="NORMALE">Normale</option>
                                <option value="FAIBLE">Faible</option>
                              </select>
                              <button onClick={handleQuickAdd}>Enregistrer</button>
                              <button type="button" onClick={() => setShowQuickAdd(false)}>
                                Annuler
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {group.key === 'DECLAREE' && !showQuickAdd && (
                      <button onClick={() => setShowQuickAdd(true)}>+ Ajouter une tâche</button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminListView;
