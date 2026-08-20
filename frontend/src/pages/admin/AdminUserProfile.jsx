import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import * as userService from '../../services/userService';
import * as avatarService from '../../services/avatarService';
import * as planningService from '../../services/planningService';
import * as dailyService from '../../services/dailyService';
import { formatDate, formatDateTime, formatDurationShort } from '../../utils/formatters';
import { STATUS_PILL, priorityPillClass } from '../../utils/taskStatus';
import { notifySuccess, notifyError } from '../../utils/toast';
import { PageSkeleton } from '../../components/Skeleton';
import {
  IconArrowLeft,
  IconArrowRight,
  IconClock,
  IconCheckCircle,
  IconAlert,
  IconListUl,
  IconBarChart,
  IconExternalLink,
  IconCalendarWeek,
  IconTrash,
  IconTrendingUp,
} from '../../components/icons';
import EvaluationSection from '../../components/admin/EvaluationSection';
import WeekCalendarGrid from '../../components/employee/WeekCalendarGrid';
import * as sessionService from '../../services/sessionService';
import { computeWeekPresence, formatPresenceMinutes } from '../../utils/presenceMetrics';
import '../../styles/admin-user-profile.css';
import '../../styles/planning.css';
import '../../styles/week-calendar.css';

const STATUS_META = {
  ACTIF: { label: 'Actif', cls: 'user-active' },
  SUSPENDU: { label: 'Suspendu', cls: 'user-suspended' },
  REFUSÉ: { label: 'Refusé', cls: 'user-refused' },
  EN_ATTENTE: { label: 'En attente', cls: 'user-pending' },
};

const TABS = [
  { key: 'all', label: 'Toutes' },
  { key: 'progress', label: 'En cours' },
  { key: 'late', label: 'En retard' },
  { key: 'done', label: 'Terminées' },
];

function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

// Une tâche est « en retard » si son échéance est passée et qu'elle n'est pas confirmée
// (même définition que le KPI backend tasks_late, pour que compteur et onglet coïncident).
function isLate(task, todayYMD) {
  return task.deadline && String(task.deadline).slice(0, 10) < todayYMD && task.status !== 'CONFIRMEE';
}

function KpiCard({ icon, label, value, tone }) {
  return (
    <div className={`aup-kpi${tone ? ` aup-kpi--${tone}` : ''}`}>
      <span className="aup-kpi-icon">{icon}</span>
      <div className="aup-kpi-copy">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="aup-info-row">
      <span className="aup-info-label">{label}</span>
      <span className="aup-info-value">{value || '—'}</span>
    </div>
  );
}

// Répartition des tâches (donut) — segments par statut.
const STATUS_SEG = [
  { key: 'VALIDEE', label: 'À faire', color: 'var(--color-accent)' },
  { key: 'EN_COURS', label: 'En cours', color: 'var(--color-warning)' },
  { key: 'TERMINEE', label: 'Terminées', color: '#38bdf8' },
  { key: 'CONFIRMEE', label: 'Confirmées', color: 'var(--color-success)' },
  { key: 'DECLAREE', label: 'Déclarées', color: 'var(--color-text-muted)' },
];

const PRESENCE_META = {
  present: { label: 'Présent', cls: 'ok' },
  late: { label: 'En retard', cls: 'late' },
  absent: { label: 'Absent', cls: 'absent' },
  off: { label: 'Repos', cls: 'off' },
};

// Filtres de période pour la présence.
const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
  { key: 'custom', label: 'Personnalisé' },
];

// YYYY-MM-DD à partir des composantes locales (évite le décalage de fuseau d'ISO).
function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Plage [start, end] (inclusive) pour une période donnée. null si perso incomplet.
function periodRange(period, customStart, customEnd) {
  const now = new Date();
  const today = ymdLocal(now);
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') {
    const dow = (now.getDay() + 6) % 7; // 0 = lundi
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    return { start: ymdLocal(monday), end: today };
  }
  if (period === 'month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: today };
  }
  if (period === 'year') return { start: `${now.getFullYear()}-01-01`, end: today };
  if (period === 'custom') return customStart && customEnd ? { start: customStart, end: customEnd } : null;
  return null;
}

const ACTION_LABEL = {
  CREATE_TASK: 'Tâche créée',
  UPDATE_TASK: 'Tâche modifiée',
  UPDATE_TASK_STATUS: 'Statut changé',
  DELETE_TASK: 'Tâche supprimée',
  CONFIRM_TASK: 'Tâche confirmée',
  VALIDATE_TASK: 'Tâche validée',
  REJECT_TASK: 'Tâche renvoyée',
  START_TIMELOG: 'Chrono démarré',
  STOP_TIMELOG: 'Chrono arrêté',
};

function formatMinutes(min) {
  const m = Number(min) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Donut en SVG (arcs via stroke-dasharray), cohérent avec les graphes maison de l'app.
function Donut({ segments, total, size = 132, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="aup-donut" role="img" aria-label="Répartition des tâches">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} opacity="0.4" />
      {total > 0 &&
        segments.map((s) => {
          if (!s.value) return null;
          const dash = (s.value / total) * c;
          const el = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          acc += dash;
          return el;
        })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="aup-donut-total">
        {total}
      </text>
    </svg>
  );
}

function AdminUserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [detail, setDetail] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [taskTab, setTaskTab] = useState('all');
  const [busy, setBusy] = useState(false);
  // Phase 2 : présence (filtrable par période), daily du jour.
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [attendance, setAttendance] = useState(null);
  const [dailyToday, setDailyToday] = useState(null);
  // Planning / disponibilités déclarées.
  const [plannings, setPlannings] = useState([]);
  const [selectedPlanningId, setSelectedPlanningId] = useState('');
  const [planningDetail, setPlanningDetail] = useState(null);
  const [weekSegments, setWeekSegments] = useState({}); // sessions de connexion de la semaine, par date
  // Phase 3 : notes internes admin.
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    try {
      const data = await userService.getUserDetail(id);
      setDetail(data);
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      else notifyError(err.response?.data?.error || "Impossible de charger l'employé");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Statistiques de présence sur la période choisie (aujourd'hui / semaine / mois / année / perso).
  useEffect(() => {
    const range = periodRange(period, customStart, customEnd);
    if (!range) return; // période perso incomplète → on n'appelle pas
    setAttendance(null);
    planningService
      .getAdminAttendanceStats(id, range)
      .then(setAttendance)
      .catch(() => setAttendance(null));
  }, [id, period, customStart, customEnd]);

  // Plannings (semaines) déclarés par l'employé → on sélectionne le plus récent.
  useEffect(() => {
    planningService
      .getAdminPlannings({ user_id: id })
      .then((items) => {
        const sorted = [...(items || [])].sort((a, b) => (a.week_start_date < b.week_start_date ? 1 : -1));
        setPlannings(sorted);
        setSelectedPlanningId(sorted[0]?.planning_id || '');
      })
      .catch(() => setPlannings([]));
  }, [id]);

  // Détail (jours + créneaux) de la semaine sélectionnée.
  useEffect(() => {
    if (!selectedPlanningId) {
      setPlanningDetail(null);
      return;
    }
    planningService
      .getAdminPlanningDetail(selectedPlanningId)
      .then(setPlanningDetail)
      .catch(() => setPlanningDetail(null));
  }, [selectedPlanningId]);

  // Sessions de connexion de la semaine → barres de présence + KPIs planning/connecté/couvert/retards.
  useEffect(() => {
    const weekStart = planningDetail?.week_start_date;
    if (!weekStart) {
      setWeekSegments({});
      return;
    }
    sessionService
      .getUserSessionsForWeek(id, weekStart)
      .then((segments) => {
        const byDate = {};
        (segments || []).forEach((seg) => {
          if (!byDate[seg.date]) byDate[seg.date] = [];
          byDate[seg.date].push(seg);
        });
        setWeekSegments(byDate);
      })
      .catch(() => setWeekSegments({}));
  }, [id, planningDetail?.week_start_date]);

  const presenceSummary = useMemo(
    () => (planningDetail?.days ? computeWeekPresence(planningDetail.days, weekSegments) : null),
    [planningDetail, weekSegments]
  );

  // Daily / To Do du jour de cet employé (extrait de l'aperçu équipe).
  useEffect(() => {
    dailyService
      .getOverview()
      .then((data) => {
        const emp = (data.employees || []).find((e) => e.id === id);
        setDailyToday(emp ? { todo: emp.todo || [], daily: emp.daily || [] } : { todo: [], daily: [] });
      })
      .catch(() => setDailyToday(null));
  }, [id]);

  // Notes internes admin.
  useEffect(() => {
    userService.getUserNotes(id).then(setNotes).catch(() => setNotes([]));
  }, [id]);

  async function addNote() {
    const content = noteDraft.trim();
    if (!content || savingNote) return;
    setSavingNote(true);
    try {
      await userService.createUserNote(id, content);
      setNoteDraft('');
      setNotes(await userService.getUserNotes(id));
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'ajouter la note");
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNote(noteId) {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      await userService.deleteUserNote(id, noteId);
      setNotes((cur) => cur.filter((n) => n.id !== noteId));
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer la note');
    }
  }

  // Photo de profil (blob → objectURL), libérée au démontage.
  useEffect(() => {
    let obj;
    if (detail?.user?.has_avatar) {
      avatarService
        .getUserAvatarBlob(detail.user.id)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setAvatarUrl(obj);
        })
        .catch(() => setAvatarUrl(null));
    } else {
      setAvatarUrl(null);
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [detail?.user?.id, detail?.user?.has_avatar]);

  const todayYMD = new Date().toISOString().slice(0, 10);
  const tasks = detail?.tasks || [];

  const counts = useMemo(
    () => ({
      progress: tasks.filter((t) => t.status === 'EN_COURS').length,
      late: tasks.filter((t) => isLate(t, todayYMD)).length,
      done: tasks.filter((t) => t.status === 'TERMINEE' || t.status === 'CONFIRMEE').length,
    }),
    [tasks, todayYMD]
  );

  const visibleTasks = useMemo(() => {
    if (taskTab === 'progress') return tasks.filter((t) => t.status === 'EN_COURS');
    if (taskTab === 'late') return tasks.filter((t) => isLate(t, todayYMD));
    if (taskTab === 'done') return tasks.filter((t) => t.status === 'TERMINEE' || t.status === 'CONFIRMEE');
    return tasks;
  }, [tasks, taskTab, todayYMD]);

  const statusSegments = useMemo(
    () => STATUS_SEG.map((s) => ({ ...s, value: tasks.filter((t) => t.status === s.key).length })),
    [tasks]
  );

  async function changeStatus(action) {
    if (busy) return;
    const label = action === 'suspend' ? 'suspendre' : 'réactiver';
    if (!window.confirm(`Voulez-vous ${label} ${detail.user.full_name} ?`)) return;
    setBusy(true);
    try {
      await (action === 'suspend' ? userService.suspendUser(id) : userService.activateUser(id));
      notifySuccess(action === 'suspend' ? 'Employé suspendu' : 'Employé réactivé');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible de changer le statut");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageSkeleton variant="list" />;
  if (notFound || !detail) {
    return (
      <div className="aup-page">
        <Link to="/admin/users" className="app-link aup-back">
          <IconArrowLeft /> Retour à l'équipe
        </Link>
        <div className="empty-state">Employé introuvable.</div>
      </div>
    );
  }

  const { user, stats } = detail;
  const status = STATUS_META[user.status] || { label: user.status, cls: 'user-refused' };
  const roleLabel = user.role === 'ADMIN' ? 'Administrateur' : 'Employé';

  return (
    <div className="aup-page">
      <Link to="/admin/users" className="app-link aup-back">
        <IconArrowLeft /> Retour à l'équipe
      </Link>

      {/* En-tête */}
      {/* Évaluation mensuelle — directement en haut de la fiche (pas de bouton/modale) */}
      <EvaluationSection userId={user.id} />

      <div className="side-card aup-hero">
        <div className="aup-hero-id">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="aup-avatar" />
          ) : (
            <span className="aup-avatar aup-avatar--initials">{initialsOf(user.full_name) || '?'}</span>
          )}
          <div className="aup-hero-text">
            <h1 className="aup-name">{user.full_name}</h1>
            <p className="aup-sub">
              {roleLabel}
              {user.position ? ` · ${user.position}` : ''}
            </p>
            <div className="aup-badges">
              <span className={`pill pill--${status.cls}`}>{status.label}</span>
            </div>
          </div>
        </div>

        <div className="aup-hero-actions">
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate('/admin/messaging', { state: { employeeId: user.id } })}
          >
            <IconArrowRight /> Message
          </button>
          {user.status === 'ACTIF' ? (
            <button type="button" className="btn-danger" onClick={() => changeStatus('suspend')} disabled={busy}>
              Suspendre
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => changeStatus('activate')} disabled={busy}>
              Réactiver
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="aup-kpis">
        <KpiCard icon={<IconListUl />} label="Assignées" value={stats.tasks_assigned} />
        <KpiCard icon={<IconClock />} label="En cours" value={counts.progress} tone="progress" />
        <KpiCard icon={<IconCheckCircle />} label="Terminées" value={counts.done} tone="done" />
        <KpiCard icon={<IconAlert />} label="En retard" value={stats.tasks_late} tone="late" />
        <KpiCard icon={<IconClock />} label="Temps travaillé" value={formatDurationShort(stats.hours_worked_seconds)} />
        <KpiCard icon={<IconBarChart />} label="Taux de complétion" value={`${stats.completion_rate}%`} tone="rate" />
      </div>

      {/* Corps : tâches + contact */}
      <div className="aup-body">
        <div className="aup-main">
          <div className="side-card">
            <div className="aup-tasks-head">
              <p className="side-card-title">Tâches</p>
              <div className="aup-tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`aup-tab${taskTab === tab.key ? ' aup-tab--active' : ''}`}
                    onClick={() => setTaskTab(tab.key)}
                  >
                    {tab.label}
                    {tab.key !== 'all' && counts[tab.key] > 0 && (
                      <span className="aup-tab-badge">{counts[tab.key]}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {visibleTasks.length === 0 ? (
              <div className="empty-state">Aucune tâche dans cette catégorie.</div>
            ) : (
              <div className="task-table-wrap">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>Tâche</th>
                      <th>Statut</th>
                      <th>Priorité</th>
                      <th>Échéance</th>
                      <th aria-label="Ouvrir" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task) => {
                      const late = isLate(task, todayYMD);
                      return (
                        <tr
                          key={task.id}
                          className="aup-task-row"
                          onClick={() => navigate(`/tasks/${task.id}`, { state: { backgroundLocation: location } })}
                        >
                          <td>
                            <span className="aup-task-title">{task.title}</span>
                            {(task.space_name || task.folder_name || task.list_name) && (
                              <span className="aup-task-path">
                                {[task.space_name, task.folder_name, task.list_name].filter(Boolean).join(' › ')}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`pill ${STATUS_PILL[task.status]?.className || ''}`}>
                              {STATUS_PILL[task.status]?.label || task.status}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${priorityPillClass(task.priority)}`}>{task.priority}</span>
                          </td>
                          <td>
                            <span className={late ? 'aup-deadline-late' : undefined}>
                              {task.deadline ? formatDate(task.deadline) : '—'}
                            </span>
                          </td>
                          <td>
                            <Link
                              to={`/tasks/${task.id}`}
                              state={{ backgroundLocation: location }}
                              className="icon-link-btn"
                              aria-label="Ouvrir la tâche"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconExternalLink />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="aup-side">
          <div className="side-card">
            <p className="side-card-title">Contact &amp; infos</p>
            <div className="aup-info">
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Téléphone" value={user.phone_number} />
              <InfoRow label="Nom d'utilisateur" value={user.username} />
              <InfoRow label="Poste" value={user.position} />
              <InfoRow label="Rôle" value={roleLabel} />
              <InfoRow label="Date de naissance" value={user.birth_date ? formatDate(user.birth_date) : null} />
              <InfoRow label="Adresse" value={user.postal_address} />
              <InfoRow label="Membre depuis" value={user.created_at ? formatDate(user.created_at) : null} />
            </div>
          </div>

          <div className="side-card">
            <p className="side-card-title">Répartition des tâches</p>
            {tasks.length === 0 ? (
              <div className="empty-state">Aucune tâche.</div>
            ) : (
              <div className="aup-donut-wrap">
                <Donut segments={statusSegments} total={tasks.length} />
                <ul className="aup-legend">
                  {statusSegments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <li key={s.key}>
                        <span className="aup-legend-dot" style={{ background: s.color }} />
                        {s.label}
                        <strong>{s.value}</strong>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <div className="side-card">
            <p className="side-card-title">
              Notes internes <span className="aup-notes-tag">admin</span>
            </p>
            <div className="aup-note-form">
              <textarea
                className="aup-note-input"
                rows={3}
                maxLength={2000}
                placeholder="Observation, suivi, rappel… (visible des admins uniquement)"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary aup-note-add"
                onClick={addNote}
                disabled={savingNote || !noteDraft.trim()}
              >
                {savingNote ? 'Ajout…' : 'Ajouter la note'}
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="aup-daily-empty">Aucune note pour le moment.</p>
            ) : (
              <ul className="aup-notes">
                {notes.map((n) => (
                  <li key={n.id} className="aup-note">
                    <div className="aup-note-head">
                      <span className="aup-note-author">{n.author_name || 'Admin'}</span>
                      <span className="aup-note-date">{formatDateTime(n.created_at)}</span>
                      <button
                        type="button"
                        className="aup-note-del"
                        onClick={() => removeNote(n.id)}
                        aria-label="Supprimer la note"
                        title="Supprimer"
                      >
                        <IconTrash />
                      </button>
                    </div>
                    <p className="aup-note-content">{n.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Présence & connexion */}
      <div className="side-card">
        <div className="aup-tasks-head">
          <p className="side-card-title">Présence &amp; connexion</p>
          <div className="aup-tabs">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`aup-tab${period === p.key ? ' aup-tab--active' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="aup-custom-range">
            <input
              type="date"
              className="aup-month-input"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="Début de la période"
            />
            <span className="tk-date-arrow" aria-hidden="true">→</span>
            <input
              type="date"
              className="aup-month-input"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="Fin de la période"
            />
          </div>
        )}

        {period === 'custom' && !customStart && !customEnd ? (
          <div className="empty-state">Choisissez une date de début et de fin.</div>
        ) : !attendance ? (
          <div className="empty-state">Chargement de la présence…</div>
        ) : (
          <>
            <div className="aup-pres-kpis">
              <div className="aup-pres-kpi aup-pres-kpi--connect">
                <strong>{formatMinutes(attendance.summary.total_connected_minutes)}</strong>
                <span>Temps de connexion</span>
              </div>
              <div className="aup-pres-kpi aup-pres-kpi--ok">
                <strong>{attendance.summary.present}</strong>
                <span>Présent{attendance.summary.present > 1 ? 's' : ''}</span>
              </div>
              <div className="aup-pres-kpi aup-pres-kpi--late">
                <strong>{attendance.summary.late}</strong>
                <span>En retard</span>
              </div>
              <div className="aup-pres-kpi aup-pres-kpi--absent">
                <strong>{attendance.summary.absent}</strong>
                <span>Absent{attendance.summary.absent > 1 ? 's' : ''}</span>
              </div>
              <div className="aup-pres-kpi">
                <strong>{formatMinutes(attendance.summary.total_late_minutes)}</strong>
                <span>
                  Retard cumulé
                  {attendance.summary.late ? ` · ${attendance.summary.average_late_minutes} min/j` : ''}
                </span>
              </div>
            </div>

            {attendance.days.length === 0 ? (
              <div className="empty-state">
                Aucun jour planifié sur cette période. La présence n'est évaluée que sur les jours où
                l'employé a déclaré un planning.
              </div>
            ) : (
              <div className="aup-pres-list">
                {attendance.days.map((day) => {
                  const meta = PRESENCE_META[day.presence_status] || PRESENCE_META.off;
                  return (
                    <div className="aup-pres-day" key={day.date}>
                      <span className="aup-pres-date">{formatDate(day.date)}</span>
                      <span className="aup-pres-arrival">
                        Arrivée {day.first_login || 'non enregistrée'}
                        {day.planned_start ? ` · prévue ${day.planned_start}` : ''}
                      </span>
                      <span className={`aup-pres-badge aup-pres-badge--${meta.cls}`}>{meta.label}</span>
                      {day.presence_status === 'late' && (
                        <strong className="aup-pres-latemin">+{day.late_minutes} min</strong>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Planning / disponibilités déclarées */}
      <div className="side-card">
        <div className="aup-tasks-head">
          <p className="side-card-title">Planning &amp; disponibilités</p>
          {plannings.length > 0 && (
            <select
              className="aup-month-input"
              value={selectedPlanningId}
              onChange={(e) => setSelectedPlanningId(e.target.value)}
              aria-label="Semaine de planning"
            >
              {plannings.map((p) => (
                <option key={p.planning_id} value={p.planning_id}>
                  Semaine du {formatDate(p.week_start_date)}
                  {p.is_submitted ? '' : ' (brouillon)'}
                </option>
              ))}
            </select>
          )}
        </div>

        {plannings.length === 0 ? (
          <div className="empty-state">Aucun planning déclaré.</div>
        ) : !planningDetail ? (
          <div className="empty-state">Chargement du planning…</div>
        ) : (
          <div className="aup-planning-cal">
            {presenceSummary && (
              <div className="presence-kpi-grid" aria-label="Synthèse de présence de la semaine">
                {[
                  {
                    icon: <IconCalendarWeek />,
                    value: formatPresenceMinutes(presenceSummary.plannedMinutes),
                    label: 'Temps planifié',
                    hint: 'Créneaux déclarés pour la semaine',
                  },
                  {
                    icon: <IconClock />,
                    value: formatPresenceMinutes(presenceSummary.connectedMinutes),
                    label: 'Temps connecté',
                    hint: 'Toutes les connexions, planning compris ou non',
                  },
                  {
                    icon: <IconCheckCircle />,
                    value: formatPresenceMinutes(presenceSummary.coveredMinutes),
                    label: 'Temps couvert',
                    hint: 'Connexion réellement comprise dans les créneaux',
                  },
                  {
                    icon: <IconTrendingUp />,
                    value:
                      presenceSummary.lateDays > 0
                        ? `${presenceSummary.lateDays} j · ${formatPresenceMinutes(presenceSummary.lateMinutes)}`
                        : 'Aucun',
                    label: 'Retards',
                    hint: 'Tolérance de 10 minutes incluse',
                  },
                ].map((card) => (
                  <article className="presence-kpi-card" key={card.label}>
                    <span className="presence-kpi-icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    <div>
                      <strong>{card.value}</strong>
                      <span>{card.label}</span>
                      <small>{card.hint}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <WeekCalendarGrid
              days={planningDetail.days}
              canEdit={false}
              onNoteChange={() => {}}
              sessionSegmentsByDate={weekSegments}
            />
          </div>
        )}
      </div>

      {/* Daily du jour + Activité récente */}
      <div className="aup-grid2">
        <div className="side-card">
          <p className="side-card-title">Ma journée · aujourd'hui</p>
          <div className="aup-daily-cols">
            <div>
              <p className="aup-daily-label">
                <IconListUl /> To Do <span>{dailyToday?.todo?.length || 0}</span>
              </p>
              {dailyToday && dailyToday.todo.length > 0 ? (
                <ul className="aup-daily-list">
                  {dailyToday.todo.map((t) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="aup-daily-empty">Journée non validée</p>
              )}
            </div>
            <div>
              <p className="aup-daily-label">
                <IconCheckCircle /> Daily <span>{dailyToday?.daily?.length || 0}</span>
              </p>
              {dailyToday && dailyToday.daily.length > 0 ? (
                <ul className="aup-daily-list">
                  {dailyToday.daily.map((t) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="aup-daily-empty">—</p>
              )}
            </div>
          </div>
        </div>

        <div className="side-card">
          <p className="side-card-title">Activité récente</p>
          {(detail.recent_activity || []).length === 0 ? (
            <div className="empty-state">Aucune activité récente.</div>
          ) : (
            <ul className="aup-activity">
              {detail.recent_activity.map((a, i) => (
                <li key={i} className="aup-activity-item">
                  <span className="aup-activity-dot" />
                  <div className="aup-activity-body">
                    <span className="aup-activity-action">{ACTION_LABEL[a.action] || a.action}</span>
                    {a.task_title && <span className="aup-activity-target"> · {a.task_title}</span>}
                    <span className="aup-activity-time">{formatDateTime(a.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}

export default AdminUserProfile;
