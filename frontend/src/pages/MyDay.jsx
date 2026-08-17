import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as dailyService from '../services/dailyService';
import DragDropTasks from '../components/DragDropTasks';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconX } from '../components/icons';
import RichTextEditor from '../components/RichTextEditor';
import { htmlToText } from '../utils/sanitizeHtml';
import '../styles/daily.css';

const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const todayShort = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

// Regroupe des tâches par projet (nom de liste) → [{ project, tasks }] trié par projet.
function groupByProject(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const project = t.list_name || 'Sans projet';
    if (!map.has(project)) map.set(project, []);
    map.get(project).push(t);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([project, list]) => ({ project, tasks: list }));
}

// Date + heure d'envoi (validation), ex. « 13/08/2026 à 16:45 ».
function formatSubmit(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

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
  const user = useAuthStore((state) => state.user);
  // Section « Daily » : 2ᵉ glisser-déposer (tâches faites aujourd'hui), envoyé au clic sur « Valider ».
  const [dailyAvailable, setDailyAvailable] = useState([]);
  const [dailySelected, setDailySelected] = useState([]);
  const [dailyDirty, setDailyDirty] = useState(false);
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySubmittedAt, setDailySubmittedAt] = useState(null);

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
        list_name: item.task_data.list_name,
        validated_at: item.validated_at,
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

  // Charge la sélection « Daily » (une fois au montage, indépendamment du polling To Do
  // pour ne pas écraser un glisser-déposer en cours). Le pool = toutes les tâches assignées.
  useEffect(() => {
    let cancelled = false;
    dailyService
      .getMyDailyDone()
      .then((data) => {
        if (cancelled) return;
        // Le pool « disponible » = MES tâches assignées (calculé côté serveur), pas toutes les tâches.
        setDailySelected(data.done || []);
        setDailyAvailable(data.available || []);
        setDailySubmittedAt((data.done || [])[0]?.created_at || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Le glisser-déposer met à jour l'état local ; l'envoi se fait au clic sur « Valider le daily ».
  function handleDailyUpdate({ available, selected }) {
    setDailyAvailable(available);
    setDailySelected(selected);
    setDailyDirty(true);
  }

  async function handleValidateDaily() {
    setSavingDaily(true);
    try {
      await dailyService.saveMyDailyDone({ task_ids: dailySelected.map((t) => t.id) });
      setDailyDirty(false);
      setDailySubmittedAt(new Date().toISOString());
      notifySuccess('Daily validé et envoyé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider le daily');
    } finally {
      setSavingDaily(false);
    }
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
      await taskService.createExtraTaskRequest(requestingTask.id, htmlToText(requestMessage) ? requestMessage : undefined);
      notifySuccess("Demande envoyée à l'administrateur");
      setRequestingTask(null);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer la demande");
    } finally {
      setIsSending(false);
    }
  }

  // Horodatage d'envoi du To Do = le plus récent validated_at de la sélection.
  const todoSubmittedAt = selected.reduce(
    (max, t) => (t.validated_at && (!max || t.validated_at > max) ? t.validated_at : max),
    null
  );

  return (
    <EmployeeLayout
      title="Ma journée"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Ma journée' }]}
      subtitle={today}
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

      {validated && selected.length > 0 && (
        <section className="side-card daily-recap">
          <div className="daily-recap-head">
            <span className="daily-recap-user">{user?.full_name}</span>
            <strong className="daily-recap-title">To do du {todayShort}</strong>
            {todoSubmittedAt && <span className="daily-recap-sent">Envoyé le {formatSubmit(todoSubmittedAt)}</span>}
          </div>
          {groupByProject(selected).map((group) => (
            <div key={group.project} className="daily-recap-group">
              <p className="daily-recap-project">{group.project}</p>
              {group.tasks.map((task) => (
                <div key={task.id} className="daily-recap-item">
                  <span className="daily-bullet" />
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {(dailyAvailable.length > 0 || dailySelected.length > 0) && (
        <section className="daily-drag-section">
          <div className="daily-recap-head">
            <span className="daily-recap-user">{user?.full_name}</span>
            <strong className="daily-recap-title">Daily du {todayShort}</strong>
          </div>
          <p className="daily-drag-hint">Glissez les tâches que vous avez faites aujourd'hui.</p>
          <DragDropTasks
            availableTasks={dailyAvailable}
            selectedTasks={dailySelected}
            onUpdate={handleDailyUpdate}
            validated={false}
            availableTitle="Tâches disponibles"
            selectedTitle="Tâches faites (Daily)"
            selectedEmptyLabel="Glissez ici les tâches faites."
          />
          <div className="app-actions">
            <button type="button" className="btn-primary" onClick={handleValidateDaily} disabled={savingDaily}>
              {savingDaily && <span className="btn-spinner" />}
              {savingDaily ? 'Envoi…' : 'Valider le daily'}
              {dailyDirty && !savingDaily && <span className="daily-dirty-dot" title="Modifications non envoyées" />}
            </button>
          </div>
        </section>
      )}

      {dailySelected.length > 0 && (
        <section className="side-card daily-recap">
          <div className="daily-recap-head">
            <span className="daily-recap-user">{user?.full_name}</span>
            <strong className="daily-recap-title">Daily du {todayShort}</strong>
            {dailySubmittedAt && !dailyDirty && (
              <span className="daily-recap-sent">Envoyé le {formatSubmit(dailySubmittedAt)}</span>
            )}
          </div>
          {groupByProject(dailySelected).map((group) => (
            <div key={group.project} className="daily-recap-group">
              <p className="daily-recap-project">{group.project}</p>
              {group.tasks.map((task) => (
                <div key={task.id} className="daily-recap-item">
                  <span className="daily-bullet" />
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

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
              <div className="modal-field">
                <span className="modal-label">Message à l'administrateur (facultatif)</span>
                <RichTextEditor
                  value={requestMessage}
                  onChange={setRequestMessage}
                  placeholder="Ex : j'ai terminé toutes mes tâches, je peux prendre celle-ci."
                />
              </div>

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
