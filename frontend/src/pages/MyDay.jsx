import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';

const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

function TaskCard({ task, order, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      style={{ border: '1px solid gray', padding: '8px', marginBottom: '6px', cursor: 'grab' }}
    >
      {order != null && <strong>{order}. </strong>}
      {task.title} — {task.priority}
    </div>
  );
}

function MyDay() {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [validatedTasks, myDay] = await Promise.all([
          taskService.getTasks({ status: 'VALIDEE' }),
          taskService.getMyDay(),
        ]);

        const selectedIds = new Set(myDay.map((item) => item.task_id));
        setSelected(
          myDay.map((item) => ({ id: item.task_id, title: item.task_data.title, priority: item.task_data.priority }))
        );
        setAvailable(validatedTasks.filter((task) => !selectedIds.has(task.id)));
      } catch (err) {
        setError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    }
    load();
  }, []);

  function handleDragStart(e, taskId) {
    e.dataTransfer.setData('text/plain', taskId);
  }

  function handleDropToSelected(e) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (selected.some((t) => t.id === taskId)) return;

    const task = available.find((t) => t.id === taskId);
    if (!task) return;

    setSelected([...selected, task]);
    setAvailable(available.filter((t) => t.id !== taskId));
  }

  function handleDropToAvailable(e) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (available.some((t) => t.id === taskId)) return;

    const task = selected.find((t) => t.id === taskId);
    if (!task) return;

    setAvailable([...available, task]);
    setSelected(selected.filter((t) => t.id !== taskId));
  }

  async function handleValidate() {
    setError('');
    setSuccessMessage('');
    try {
      await taskService.setMyDay(selected.map((task) => task.id));
      await taskService.validateMyDay();
      setSuccessMessage('Votre journée est validée');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de valider la journée');
    }
  }

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Ma journée — {today}</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}

      <div style={{ display: 'flex', gap: '20px' }}>
        <div
          style={{ flex: 1, border: '1px solid black', padding: '10px', minHeight: '200px' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropToAvailable}
        >
          <h2>Tâches disponibles</h2>
          {available.length === 0 && <p>Aucune tâche disponible.</p>}
          {available.map((task) => (
            <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
          ))}
        </div>

        <div
          style={{ flex: 1, border: '1px solid black', padding: '10px', minHeight: '200px' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropToSelected}
        >
          <h2>Mes tâches aujourd'hui</h2>
          {selected.length === 0 && <p>Glissez des tâches ici.</p>}
          {selected.map((task, index) => (
            <TaskCard key={task.id} task={task} order={index + 1} onDragStart={handleDragStart} />
          ))}
        </div>
      </div>

      <button onClick={handleValidate} disabled={selected.length < 1}>
        Valider ma journée
      </button>
    </div>
  );
}

export default MyDay;
