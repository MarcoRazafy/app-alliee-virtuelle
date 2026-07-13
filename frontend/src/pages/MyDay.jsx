import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import DragDropTasks from '../components/DragDropTasks';
import EmployeeLayout from '../components/employee/EmployeeLayout';
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
  const [isValidating, setIsValidating] = useState(false);
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
    setIsValidating(true);
    try {
      await taskService.setMyDay(selected.map((task) => task.id));
      await taskService.validateMyDay();
      setValidated(true);
      setDayValidated(true);
      notifySuccess('Votre journée est validée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la journée');
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <EmployeeLayout
      title="Ma journée"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Ma journée' }]}
      subtitle={today}
      locked={!validated}
    >
      <div className="app-page-header">
        <span className={`status-badge ${validated ? 'status-badge--validated' : 'status-badge--pending'}`}>
          <span className={`status-dot ${validated ? '' : 'status-dot--pending'}`} />
          {validated ? 'Journée validée' : 'En attente de validation'}
        </span>
      </div>

      {!validated && (
        <div className="info-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <span>
            Glissez au moins une tâche vers <strong>« Mes tâches aujourd'hui »</strong> et validez pour accéder au
            reste de l'application.
          </span>
        </div>
      )}

      <DragDropTasks availableTasks={available} selectedTasks={selected} onUpdate={handleUpdate} validated={validated} />

      <div className="app-actions">
        {!validated && (
          <button className="btn-primary" onClick={handleValidate} disabled={selected.length < 1 || isValidating}>
            {isValidating && <span className="btn-spinner" />}
            {isValidating ? 'Validation...' : 'Valider ma journée'}
          </button>
        )}
        {validated && (
          <Link to="/dashboard" className="btn-primary">
            Continuer vers le tableau de bord
          </Link>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default MyDay;
