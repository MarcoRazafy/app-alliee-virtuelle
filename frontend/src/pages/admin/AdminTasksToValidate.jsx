import { useEffect, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import AttachmentUpload from '../../components/AttachmentUpload';
import CommentSection from '../../components/CommentSection';
import { notifySuccess, notifyError } from '../../utils/toast';

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
  const [statusFilter, setStatusFilter] = useState('TERMINEE');
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

  const filteredTasks = tasks.filter((task) => {
    const matchesStatus = !statusFilter || task.status === statusFilter;
    const matchesPriority = !priorityFilter || task.priority === priorityFilter;
    const matchesEmployee = !employeeFilter || task.assigned_to === employeeFilter;
    const matchesDeadline = matchesDeadlineRange(task.deadline, deadlineFilter);
    return matchesStatus && matchesPriority && matchesEmployee && matchesDeadline;
  });

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    if (
      !window.confirm(
        `Le motif "${bulkMotif}" sera appliqué aux ${selectedIds.length} tâches sélectionnées. Continuer ?`
      )
    ) {
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
    <div>
      <h1>Tâches à valider</h1>

      <div>
        <label>
          Statut :
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="DECLAREE">Déclarée</option>
            <option value="VALIDEE">Validée</option>
            <option value="EN_COURS">En cours</option>
            <option value="TERMINEE">Terminée</option>
            <option value="CONFIRMEE">Confirmée</option>
          </select>
        </label>
        <label>
          Priorité :
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Toutes</option>
            <option value="URGENT">Urgent</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="FAIBLE">Faible</option>
          </select>
        </label>
        <label>
          Employé :
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Tous</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Échéance :
          <select value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)}>
            <option value="">Toutes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="past">Passée</option>
          </select>
        </label>
      </div>

      {selectedIds.length > 0 && (
        <div style={{ border: '1px solid black', padding: '10px', marginTop: '10px' }}>
          <p>{selectedIds.length} tâche(s) sélectionnée(s)</p>
          <button onClick={handleBulkConfirm}>Confirmer la sélection ({selectedIds.length})</button>
          <input
            placeholder="Motif (appliqué à toute la sélection)"
            value={bulkMotif}
            onChange={(e) => setBulkMotif(e.target.value)}
          />
          <button onClick={handleBulkReject}>Renvoyer avec motif ({selectedIds.length})</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ flex: 2 }}>
          {filteredTasks.length === 0 && <p>Aucune tâche.</p>}
          <ul>
            {filteredTasks.map((task) => (
              <li key={task.id} style={{ marginBottom: '8px' }}>
                <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelect(task.id)} />
                <button onClick={() => setDetailTaskId(task.id)}>{task.title}</button> —{' '}
                {employeeName(task.assigned_to)} — {task.priority} — {task.status} — deadline {task.deadline}
                <div>
                  <button onClick={() => handleConfirmOne(task.id)} disabled={task.status !== 'TERMINEE'}>
                    Confirmer
                  </button>
                  <input
                    placeholder="Motif de renvoi"
                    value={motifs[task.id] || ''}
                    onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                    disabled={task.status !== 'TERMINEE'}
                  />
                  <button onClick={() => handleRejectOne(task.id)} disabled={task.status !== 'TERMINEE'}>
                    Renvoyer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {detailTask && (
          <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
            <button onClick={() => setDetailTaskId(null)}>Fermer</button>
            <h2>{detailTask.title}</h2>
            <p>{detailTask.description}</p>
            <p>Priorité : {detailTask.priority}</p>
            <p>Statut : {detailTask.status}</p>
            <p>Deadline : {detailTask.deadline}</p>

            <h3>Pièces jointes</h3>
            <AttachmentUpload taskId={detailTask.id} canUpload={false} />

            <h3>Commentaires & notes</h3>
            <CommentSection taskId={detailTask.id} />
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminTasksToValidate;
