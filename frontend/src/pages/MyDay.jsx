import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import DragDropTasks from '../components/DragDropTasks';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconX } from '../components/icons';

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
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [noTasksAvailable, setNoTasksAvailable] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [requestsByTaskId, setRequestsByTaskId] = useState({});
  const [requestingTask, setRequestingTask] = useState(null); // tâche pour laquelle on ouvre la modale
  const [requestMessage, setRequestMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const setDayValidated = useAuthStore((state) => state.setDayValidated);
  const storedDayValidated = useAuthStore((state) => state.dayValidated);

  // Recharge tout l'état. En mode "journée validée", on l'appelle aussi en polling pour voir
  // apparaître les tâches supplémentaires approuvées par l'admin (et le statut des demandes).
  const load = useCallback(async () => {
    const [allTasks, myDay, myRequests] = await Promise.all([
      taskService.getTasks(),
      taskService.getMyDay(),
      taskService.getMyExtraTaskRequests().catch(() => []),
    ]);

    // Une tâche pas encore terminée (VALIDEE ou EN_COURS) reste sélectionnable pour aujourd'hui
    const selectableTasks = allTasks.filter((t) => t.status === 'VALIDEE' || t.status === 'EN_COURS');

    const selectedIds = new Set(myDay.map((item) => item.task_id));
    setSelected(
      myDay.map((item) => ({
        id: item.task_id,
        title: item.task_data.title,
        priority: item.task_data.priority,
        deadline: item.task_data.deadline,
      }))
    );
    setAvailable(selectableTasks.filter((task) => !selectedIds.has(task.id)));

    const isValidated = myDay.length > 0 && myDay.every((item) => item.validated_at);
    setValidated(isValidated);
    const hasNoTask = selectableTasks.length === 0;
    setNoTasksAvailable(hasNoTask);
    setTasksLoaded(true);
    setDayValidated(isValidated || hasNoTask);

    // Dernière demande par tâche (la liste est déjà triée du plus récent au plus ancien).
    const map = {};
    for (const r of myRequests) {
      if (!(r.task_id in map)) map[r.task_id] = r;
    }
    setRequestsByTaskId(map);
  }, [setDayValidated]);

  useEffect(() => {
    load().catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les tâches'));
  }, [load]);

  // Polling seulement en mode validé : sinon on écraserait le drag-drop en cours de l'employé.
  const platformAccessible = validated || storedDayValidated === true || (tasksLoaded && noTasksAvailable);
  const platformAccessibleRef = useRef(platformAccessible);
  platformAccessibleRef.current = platformAccessible;
  useEffect(() => {
    if (!platformAccessible) return undefined;
    const poll = setInterval(() => {
      if (platformAccessibleRef.current) load().catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [platformAccessible, load]);

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

  function openRequest(task) {
    setRequestingTask(task);
    setRequestMessage('');
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!requestingTask) return;
    setIsSending(true);
    try {
      await taskService.createExtraTaskRequest(requestingTask.id, requestMessage.trim() || undefined);
      notifySuccess("Demande envoyée à l'administrateur");
      setRequestingTask(null);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer la demande");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <EmployeeLayout
      title="Ma journée"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Ma journée' }]}
      subtitle={today}
      locked={!platformAccessible}
    >
      <div className="app-page-header">
        <span className={`status-badge ${platformAccessible ? 'status-badge--validated' : 'status-badge--pending'}`}>
          <span className={`status-dot ${platformAccessible ? '' : 'status-dot--pending'}`} />
          {validated ? 'Journée validée' : noTasksAvailable ? 'Plateforme accessible' : 'En attente de validation'}
        </span>
      </div>

      {tasksLoaded && !platformAccessible && (
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

      {tasksLoaded && noTasksAvailable && (
        <div className="info-banner info-banner--success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Aucune tâche ne vous est assignée pour le moment. Vous pouvez visiter librement toutes les pages de la
            plateforme.
          </span>
        </div>
      )}

      {validated && (
        <div className="info-banner info-banner--success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Votre journée est validée. Vous avez terminé vos tâches ? Cliquez sur <strong>« Demander »</strong> à côté
            d'une tâche disponible : un administrateur doit l'approuver avant qu'elle rejoigne votre journée.
          </span>
        </div>
      )}

      {!noTasksAvailable && (
        <DragDropTasks
          availableTasks={available}
          selectedTasks={selected}
          onUpdate={handleUpdate}
          validated={validated}
          requestsByTaskId={requestsByTaskId}
          onRequestTask={openRequest}
        />
      )}

      <div className="app-actions">
        {!platformAccessible && (
          <button className="btn-primary" onClick={handleValidate} disabled={selected.length < 1 || isValidating}>
            {isValidating && <span className="btn-spinner" />}
            {isValidating ? 'Validation...' : 'Valider ma journée'}
          </button>
        )}
        {platformAccessible && (
          <Link to="/dashboard" className="btn-primary">
            Accéder au tableau de bord
          </Link>
        )}
      </div>

      {requestingTask && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRequestingTask(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extra-request-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-card-head">
              <div>
                <p className="modal-card-eyebrow">Tâche supplémentaire</p>
                <h2 id="extra-request-title">Demander « {requestingTask.title} »</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setRequestingTask(null)} aria-label="Fermer">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Votre journée est déjà validée. Cette tâche sera ajoutée à votre journée une fois approuvée par un
              administrateur.
            </p>

            <form className="modal-card-form" onSubmit={submitRequest}>
              <label className="modal-field">
                <span className="modal-label">Message à l'administrateur (facultatif)</span>
                <textarea
                  className="modal-input modal-textarea"
                  rows={3}
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Ex : j'ai terminé toutes mes tâches, je peux prendre celle-ci."
                  autoFocus
                />
              </label>

              <div className="modal-card-foot">
                <button type="button" className="btn-outline" onClick={() => setRequestingTask(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={isSending}>
                  {isSending && <span className="btn-spinner" />}
                  {isSending ? 'Envoi...' : 'Envoyer la demande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </EmployeeLayout>
  );
}

export default MyDay;
