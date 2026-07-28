import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import DragDropTasks from '../components/DragDropTasks';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconX } from '../components/icons';

const today = new Date().toLocaleDateString('en-US', {
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
    load().catch((err) => notifyError(err.response?.data?.error || 'Unable to load tasks'));
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
      notifyError('Select at least one task before validating');
      return;
    }
    setIsValidating(true);
    try {
      await taskService.setMyDay(selected.map((task) => task.id));
      await taskService.validateMyDay();
      setValidated(true);
      setDayValidated(true);
      notifySuccess('Your day is validated');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to validate the day');
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
      notifySuccess('Request sent to the administrator');
      setRequestingTask(null);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to send the request');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <EmployeeLayout
      title="My day"
      breadcrumb={[{ label: 'Home', to: '/dashboard' }, { label: 'My day' }]}
      subtitle={today}
      locked={!platformAccessible}
    >
      <div className="app-page-header">
        <span className={`status-badge ${platformAccessible ? 'status-badge--validated' : 'status-badge--pending'}`}>
          <span className={`status-dot ${platformAccessible ? '' : 'status-dot--pending'}`} />
          {validated ? 'Day validated' : noTasksAvailable ? 'Platform accessible' : 'Awaiting validation'}
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
            Drag at least one task into <strong>“My tasks today”</strong> and validate to access the rest of the
            application.
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
            No task is assigned to you at the moment. You can freely browse every page of the platform.
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
            Your day is validated. Finished your tasks? Click <strong>“Request”</strong> next to an available task:
            an administrator must approve it before it joins your day.
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
            {isValidating ? 'Validating...' : 'Validate my day'}
          </button>
        )}
        {platformAccessible && (
          <Link to="/dashboard" className="btn-primary">
            Go to dashboard
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
                <p className="modal-card-eyebrow">Extra task</p>
                <h2 id="extra-request-title">Request “{requestingTask.title}”</h2>
              </div>
              <button type="button" className="modal-card-close" onClick={() => setRequestingTask(null)} aria-label="Close">
                <IconX />
              </button>
            </div>

            <p className="modal-card-hint">
              Your day is already validated. This task will be added to your day once approved by an administrator.
            </p>

            <form className="modal-card-form" onSubmit={submitRequest}>
              <label className="modal-field">
                <span className="modal-label">Message to the administrator (optional)</span>
                <textarea
                  className="modal-input modal-textarea"
                  rows={3}
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="e.g. I finished all my tasks, I can take this one."
                  autoFocus
                />
              </label>

              <div className="modal-card-foot">
                <button type="button" className="btn-outline" onClick={() => setRequestingTask(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSending}>
                  {isSending && <span className="btn-spinner" />}
                  {isSending ? 'Sending...' : 'Send request'}
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
