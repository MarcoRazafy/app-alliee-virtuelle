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
import { IconSearch } from '../components/icons';
import { matchesTerms } from '../utils/textSearch';
import { mergeFilteredMove } from '../utils/filteredDrag';

const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const todayShort = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });


function formatSubmit(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

function TaskSearch({ value, onChange, hidden, placeholder, label }) {
  return (
    <div className="myday-search">
      <div className="filter-search">
        <IconSearch />
        <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      </div>
      {value.trim() && (
        <span className="myday-search-info">
          {hidden > 0 ? `${hidden} tâche${hidden > 1 ? 's' : ''} masquée${hidden > 1 ? 's' : ''} par la recherche` : 'Toutes les tâches correspondent'}
        </span>
      )}
    </div>
  );
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
  const [dailyAvailable, setDailyAvailable] = useState([]);
  const [dailySelected, setDailySelected] = useState([]);
  const [dailyDirty, setDailyDirty] = useState(false);
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySubmittedAt, setDailySubmittedAt] = useState(null);
  const [todoQuery, setTodoQuery] = useState('');
  const [dailyQuery, setDailyQuery] = useState('');
  const taskMatches = (task, query) =>
    matchesTerms([task.title, task.space_name, task.folder_name, task.list_name], query);
  const todoMatches = (task) => taskMatches(task, todoQuery);
  const dailyMatches = (task) => taskMatches(task, dailyQuery);
  const todoSaveRef = useRef({ running: false, next: null });

  const load = useCallback(async () => {
    const [allTasks, myDay] = await Promise.all([taskService.getTasks(), taskService.getMyDay()]);

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

  const platformAccessible = validated || storedDayValidated === true || (tasksLoaded && noTasksAvailable);
  const platformAccessibleRef = useRef(platformAccessible);
  platformAccessibleRef.current = platformAccessible;
  useEffect(() => {
    if (!platformAccessible) return undefined;
    const poll = setInterval(() => {
      if (platformAccessibleRef.current && !todoSaveRef.current.running) load().catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [platformAccessible, load]);

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

  function handleUpdate({ available: filteredAvailable, selected: filteredSelected }) {
    const newAvailable = todoQuery ? mergeFilteredMove(available, filteredAvailable, todoMatches) : filteredAvailable;
    const newSelected = todoQuery ? mergeFilteredMove(selected, filteredSelected, todoMatches) : filteredSelected;
    const before = new Set(selected.map((t) => t.id));
    setAvailable(newAvailable);
    setSelected(newSelected);
    if (validated) {
      queueTodoSave(newSelected.map((t) => t.id));
      addToDaily(newSelected.filter((t) => !before.has(t.id)));
    }
  }

  useEffect(() => {
    let cancelled = false;
    dailyService
      .getMyDailyDone()
      .then((data) => {
        if (cancelled) return;
        setDailySelected(data.done || []);
        setDailyAvailable(data.available || []);
        setDailySubmittedAt((data.done || [])[0]?.created_at || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleDailyUpdate({ available: filteredAvailable, selected: filteredSelected }) {
    setDailyAvailable(dailyQuery ? mergeFilteredMove(dailyAvailable, filteredAvailable, dailyMatches) : filteredAvailable);
    setDailySelected(dailyQuery ? mergeFilteredMove(dailySelected, filteredSelected, dailyMatches) : filteredSelected);
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
      addToDaily(selected);
      notifySuccess('Votre journée est validée : ses tâches sont aussi dans votre Daily');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de valider la journée');
    } finally {
      setIsValidating(false);
    }
  }

  const shownAvailable = todoQuery ? available.filter(todoMatches) : available;
  const shownSelected = todoQuery ? selected.filter(todoMatches) : selected;
  const shownDailyAvailable = dailyQuery ? dailyAvailable.filter(dailyMatches) : dailyAvailable;
  const shownDailySelected = dailyQuery ? dailySelected.filter(dailyMatches) : dailySelected;
  const todoHidden = available.length + selected.length - shownAvailable.length - shownSelected.length;
  const dailyHidden = dailyAvailable.length + dailySelected.length - shownDailyAvailable.length - shownDailySelected.length;

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
        <>
          <TaskSearch
            value={todoQuery}
            onChange={setTodoQuery}
            hidden={todoHidden}
            placeholder="Rechercher dans mes tâches du jour…"
            label="Rechercher une tâche du To Do"
          />
          <DragDropTasks
            availableTasks={shownAvailable}
            selectedTasks={shownSelected}
            onUpdate={handleUpdate}
            validated={false}
          />
        </>
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
          <TaskSearch
            value={dailyQuery}
            onChange={setDailyQuery}
            hidden={dailyHidden}
            placeholder="Rechercher dans le daily…"
            label="Rechercher une tâche du daily"
          />
          <DragDropTasks
            availableTasks={shownDailyAvailable}
            selectedTasks={shownDailySelected}
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
