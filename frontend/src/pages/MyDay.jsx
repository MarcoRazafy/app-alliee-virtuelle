import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as dailyService from '../services/dailyService';
import DragDropTasks from '../components/DragDropTasks';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';
import '../styles/daily.css';
import { groupByProject } from '../utils/dailyGrouping';

const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const todayShort = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });


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
  const setDayValidated = useAuthStore((state) => state.setDayValidated);
  const storedDayValidated = useAuthStore((state) => state.dayValidated);
  const user = useAuthStore((state) => state.user);
  // Section « Daily » : 2ᵉ glisser-déposer (tâches faites aujourd'hui), envoyé au clic sur « Valider ».
  const [dailyAvailable, setDailyAvailable] = useState([]);
  const [dailySelected, setDailySelected] = useState([]);
  const [dailyDirty, setDailyDirty] = useState(false);
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySubmittedAt, setDailySubmittedAt] = useState(null);
  // File d'enregistrement du To Do après validation (voir queueTodoSave).
  const todoSaveRef = useRef({ running: false, next: null });

  // Recharge tout l'état. En mode « journée validée », on l'appelle aussi en polling pour voir
  // apparaître les tâches nouvellement assignées et les changements de statut.
  const load = useCallback(async () => {
    const [allTasks, myDay] = await Promise.all([taskService.getTasks(), taskService.getMyDay()]);

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
        folder_name: item.task_data.folder_name,
        space_name: item.task_data.space_name,
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
      // Pendant un enregistrement du To Do, recharger réafficherait l'état d'avant le geste.
      if (platformAccessibleRef.current && !todoSaveRef.current.running) load().catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [platformAccessible, load]);

  // Ajoute au Daily affiché les tâches que le serveur vient d'y placer (validation de la
  // journée, ou tâche ajoutée au To Do après validation) — sans écraser les retraits pas encore
  // envoyés que l'employé aurait faits dans le Daily.
  function addToDaily(tasks) {
    if (tasks.length === 0) return;
    const ids = new Set(tasks.map((t) => t.id));
    setDailySelected((cur) => {
      const present = new Set(cur.map((t) => t.id));
      return [...cur, ...tasks.filter((t) => !present.has(t.id))];
    });
    setDailyAvailable((cur) => cur.filter((t) => !ids.has(t.id)));
    setDailySubmittedAt((cur) => cur || new Date().toISOString());
  }

  // Enregistrements du To Do après validation, un à la fois et toujours avec la DERNIÈRE liste :
  // deux gestes rapides ne doivent pas se croiser, ni laisser le premier écraser le second.
  function queueTodoSave(taskIds) {
    const state = todoSaveRef.current;
    state.next = taskIds;
    if (state.running) return;
    state.running = true;
    (async () => {
      try {
        while (state.next) {
          const ids = state.next;
          state.next = null;
          await taskService.setMyDay(ids);
        }
      } catch (err) {
        notifyError(err.response?.data?.error || "Impossible d'enregistrer la modification");
        await load().catch(() => {});
      } finally {
        state.running = false;
      }
    })();
  }

  function handleUpdate({ available: newAvailable, selected: newSelected }) {
    const before = new Set(selected.map((t) => t.id));
    setAvailable(newAvailable);
    setSelected(newSelected);
    // Avant validation, rien ne part : tout s'envoie au clic sur « Valider ma journée ».
    // Après, chaque ajout ou retrait est enregistré aussitôt, sans demande à l'admin ; une
    // tâche ajoutée rejoint aussi le Daily (le serveur fait de même).
    if (validated) {
      queueTodoSave(newSelected.map((t) => t.id));
      addToDaily(newSelected.filter((t) => !before.has(t.id)));
    }
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
      // Le serveur a placé ces tâches dans le Daily : on l'affiche tout de suite.
      addToDaily(selected);
      notifySuccess('Votre journée est validée : ses tâches sont aussi dans votre Daily');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la journée');
    } finally {
      setIsValidating(false);
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
            Glissez — ou double-cliquez — au moins une tâche vers <strong>« Mes tâches aujourd'hui »</strong> et validez pour accéder au
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
            Votre journée est validée et ses tâches sont dans votre <strong>Daily</strong>. Vous pouvez encore
            ajouter ou retirer des tâches — glissez-les ou double-cliquez : c'est enregistré aussitôt. Retirez du
            Daily ce que vous n'avez pas fait.
          </span>
        </div>
      )}

      {!noTasksAvailable && (
        <DragDropTasks
          availableTasks={available}
          selectedTasks={selected}
          onUpdate={handleUpdate}
          validated={false}
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
          <p className="daily-drag-hint">
            Les tâches de votre To Do validé y sont déjà. Retirez celles que vous n'avez pas faites, ajoutez les
            autres — glissez-les ou double-cliquez — puis validez le daily.
          </p>
          <DragDropTasks
            availableTasks={dailyAvailable}
            selectedTasks={dailySelected}
            onUpdate={handleDailyUpdate}
            validated={false}
            availableTitle="Tâches disponibles"
            selectedTitle="Tâches faites (Daily)"
            selectedEmptyLabel="Glissez ici les tâches faites, ou double-cliquez dessus."
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

    </EmployeeLayout>
  );
}

export default MyDay;
