import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import DragDropTasks from '../components/DragDropTasks';
import { notifySuccess, notifyError } from '../utils/toast';

const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function MyDay() {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [validated, setValidated] = useState(false);

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
        setValidated(myDay.length > 0 && myDay.every((item) => item.validated_at));
      } catch (err) {
        notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    }
    load();
  }, []);

  function handleUpdate({ available: newAvailable, selected: newSelected }) {
    setAvailable(newAvailable);
    setSelected(newSelected);
  }

  async function handleValidate() {
    if (selected.length < 1) {
      notifyError('Sélectionnez au moins une tâche avant de valider');
      return;
    }
    try {
      await taskService.setMyDay(selected.map((task) => task.id));
      await taskService.validateMyDay();
      setValidated(true);
      notifySuccess('Votre journée est validée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la journée');
    }
  }

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Ma journée — {today}</h1>
      {validated && <p style={{ color: 'green' }}>Votre journée est validée</p>}

      <DragDropTasks availableTasks={available} selectedTasks={selected} onUpdate={handleUpdate} validated={validated} />

      <button onClick={handleValidate} disabled={selected.length < 1 || validated}>
        Valider ma journée
      </button>
    </div>
  );
}

export default MyDay;
