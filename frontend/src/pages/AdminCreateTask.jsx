import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import { notifySuccess, notifyError } from '../utils/toast';

function AdminCreateTask() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'NORMALE',
    deadline: '',
    start_date: '',
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const result = await taskService.createTask(form);
      notifySuccess(`Tâche créée avec le statut ${result.status}`);
      setForm({ title: '', description: '', assigned_to: '', priority: 'NORMALE', deadline: '', start_date: '' });
    } catch (err) {
      const data = err.response?.data;
      notifyError(data?.errors?.join(', ') || data?.error || 'Impossible de créer la tâche');
    }
  }

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Créer une tâche</h1>
      {/* Pas encore de liste d'employés côté API : on saisit directement l'ID utilisateur */}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Titre</label>
          <input id="title" name="title" value={form.title} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" value={form.description} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="assigned_to">ID de l'employé assigné</label>
          <input id="assigned_to" name="assigned_to" value={form.assigned_to} onChange={handleChange} required />
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
