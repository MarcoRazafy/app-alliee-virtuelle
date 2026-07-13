import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import DragDropTasks from '../components/DragDropTasks';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

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
  const setDayValidated = useAuthStore((state) => state.setDayValidated);

  useEffect(() => {
    async function load() {
      try {
        const [allTasks, myDay] = await Promise.all([taskService.getTasks(), taskService.getMyDay()]);

        // Une tâche pas encore terminée (VALIDEE ou EN_COURS) reste sélectionnable pour aujourd'hui
        const selectableTasks = allTasks.filter((t) => t.status === 'VALIDEE' || t.status === 'EN_COURS');

        const selectedIds = new Set(myDay.map((item) => item.task_id));
        setSelected(
          myDay.map((item) => ({ id: item.task_id, title: item.task_data.title, priority: item.task_data.priority }))
        );
        setAvailable(selectableTasks.filter((task) => !selectedIds.has(task.id)));

        const isValidated = myDay.length > 0 && myDay.every((item) => item.validated_at);
        setValidated(isValidated);
        setDayValidated(isValidated || selectableTasks.length === 0);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Impossible de charger les tâches');
      }
    }
    load();
  }, [setDayValidated]);

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
      setDayValidated(true);
      notifySuccess('Votre journée est validée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la journée');
    }
  }

  return (
    <div>
      {validated && (
        <p>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </p>
      )}
      <h1>Ma journée — {today}</h1>
      {validated && <p style={{ color: 'green' }}>Votre journée est validée</p>}
      {!validated && (
        <p style={{ color: 'gray' }}>
          Glissez au moins une tâche vers "Mes tâches aujourd'hui" et validez pour accéder au reste de l'application.
        </p>
      )}

      <DragDropTasks availableTasks={available} selectedTasks={selected} onUpdate={handleUpdate} validated={validated} />

      <button onClick={handleValidate} disabled={selected.length < 1 || validated}>
        Valider ma journée
      </button>
    </div>
  );
}

export default MyDay;
