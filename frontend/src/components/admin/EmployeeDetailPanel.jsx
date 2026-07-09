import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as userService from '../../services/userService';
import * as taskService from '../../services/taskService';
import { formatDurationShort, formatDateTime } from '../../utils/formatters';
import { notifySuccess, notifyError } from '../../utils/toast';

function EmployeeDetailPanel({ employeeId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [motifs, setMotifs] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await userService.getUserDetail(employeeId);
      setDetail(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger le détail employé');
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirm(taskId) {
    try {
      await taskService.confirmTask(taskId);
      notifySuccess('Tâche confirmée');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de confirmer la tâche');
    }
  }

  async function handleReject(taskId) {
    const motif = motifs[taskId];
    if (!motif || !motif.trim()) {
      notifyError('Le motif est requis pour renvoyer une tâche');
      return;
    }
    try {
      await taskService.rejectTask(taskId, motif);
      notifySuccess("Tâche renvoyée à l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renvoyer la tâche');
    }
  }

  async function handleAddNote(taskId) {
    const content = noteDrafts[taskId];
    if (!content || !content.trim()) {
      notifyError('La note ne peut pas être vide');
      return;
    }
    try {
      await taskService.createNote(taskId, content);
      notifySuccess('Note ajoutée');
      setNoteDrafts({ ...noteDrafts, [taskId]: '' });
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter la note");
    }
  }

  if (!detail) {
    return (
      <div style={{ border: '1px solid black', padding: '10px' }}>
        <p>Chargement...</p>
        <button onClick={onClose}>Fermer</button>
      </div>
    );
  }

  const { user, stats, tasks, recent_activity: recentActivity } = detail;

  return (
    <div style={{ border: '1px solid black', padding: '10px' }}>
      <button onClick={onClose}>Fermer</button>
      <h2>{user.full_name}</h2>
      <p>{user.email}</p>
      <p>Statut : {user.status}</p>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
        <div>Tâches complétées : {stats.tasks_confirmed}</div>
        <div>% complétion : {stats.completion_rate}%</div>
        <div>Heures travaillées : {formatDurationShort(stats.hours_worked_seconds)}</div>
        <div>Tâches en retard : {stats.tasks_late}</div>
      </div>

      <button onClick={() => navigate('/admin/messaging', { state: { employeeId: user.id } })}>
        Voir les messages
      </button>

      <h3>Tâches</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} style={{ marginBottom: '10px' }}>
            {task.title} — {task.priority} — {task.status} — deadline {task.deadline}
            <div>
              <button onClick={() => handleConfirm(task.id)} disabled={task.status !== 'TERMINEE'}>
                Confirmer
              </button>
              <input
                placeholder="Motif de renvoi"
                value={motifs[task.id] || ''}
                onChange={(e) => setMotifs({ ...motifs, [task.id]: e.target.value })}
                disabled={task.status !== 'TERMINEE'}
              />
              <button onClick={() => handleReject(task.id)} disabled={task.status !== 'TERMINEE'}>
                Renvoyer
              </button>
              <input
                placeholder="Ajouter une note"
                value={noteDrafts[task.id] || ''}
                onChange={(e) => setNoteDrafts({ ...noteDrafts, [task.id]: e.target.value })}
              />
              <button onClick={() => handleAddNote(task.id)}>Ajouter la note</button>
            </div>
          </li>
        ))}
      </ul>

      <h3>Activité récente</h3>
      {recentActivity.length === 0 && <p>Aucune activité récente.</p>}
      <ul>
        {recentActivity.map((entry, index) => (
          <li key={index}>
            {entry.action} — {formatDateTime(entry.timestamp)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default EmployeeDetailPanel;
