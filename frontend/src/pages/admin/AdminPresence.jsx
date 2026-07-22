import { useCallback, useEffect, useRef, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as avatarService from '../../services/avatarService';
import { STATUS_LABELS, STATUS_PILL_CLASS, toDateInputValue } from '../../utils/planningFormat';
import { notifyError, notifySuccess } from '../../utils/toast';
import {
  IconCheckCircle,
  IconClock,
  IconAlert,
  IconUser,
  IconX,
  IconPencil,
  IconBarChart,
} from '../../components/icons';
import '../../styles/admin.css';
import '../../styles/admin-presence.css';

const PRESENCE_META = {
  present: { label: 'Présent', cls: 'present' },
  late: { label: 'En retard', cls: 'late' },
  partial: { label: 'Présence partielle', cls: 'partial' },
  outside: { label: 'Hors planning', cls: 'outside' },
  absent: { label: 'Absent', cls: 'absent' },
  waiting: { label: 'En attente', cls: 'pending' },
  upcoming: { label: 'À venir', cls: 'pending' },
  off: { label: 'Repos', cls: 'off' },
};

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function PresAvatar({ user }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    if (user.has_avatar) {
      avatarService
        .getUserAvatarBlob(user.id)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        })
        .catch(() => setUrl(null));
    } else {
      setUrl(null);
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [user.id, user.has_avatar]);

  return url ? (
    <img src={url} alt={user.full_name} className="pres-avatar pres-avatar--img" />
  ) : (
    <span className="pres-avatar">{initials(user.full_name)}</span>
  );
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}min`;
}

function accomplishmentClass(value) {
  if (value == null) return '';
  if (value >= 80) return 'pres-acc--high';
  if (value >= 50) return 'pres-acc--mid';
  return 'pres-acc--low';
}

function formatDayLabel(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function formatMonthLabel(month) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00`)
  );
}

function useDialogFocus(onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const initialTarget = dialog?.querySelector('[data-dialog-initial-focus]') || dialog?.querySelector(focusableSelector);
    initialTarget?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return dialogRef;
}

function AttendanceCorrectionDialog({ employee, date, onClose, onSave }) {
  const existing = employee.manual_correction;
  const [status, setStatus] = useState(existing?.status || 'automatic');
  const [lateMinutes, setLateMinutes] = useState(
    existing?.late_minutes || employee.late_minutes || 1
  );
  const [reason, setReason] = useState(existing?.reason || '');
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogFocus(onClose);
  const automaticMeta = PRESENCE_META[employee.calculated_presence_status] || PRESENCE_META.off;

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        status,
        lateMinutes: status === 'late' ? Number(lateMinutes) : 0,
        reason,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pres-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="pres-dialog pres-correction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-correction-title"
      >
        <header className="pres-dialog-header">
          <div>
            <p className="pres-eyebrow">Correction administrative</p>
            <h2 id="attendance-correction-title">Présence de {employee.full_name}</h2>
            <p>{formatDayLabel(date)}</p>
          </div>
          <button type="button" className="pres-dialog-close" onClick={onClose} aria-label="Fermer la correction">
            <IconX />
          </button>
        </header>

        <div className="pres-computed-state">
          <span>Calcul automatique</span>
          <strong className={`pres-badge pres-badge--${automaticMeta.cls}`}>
            <span className="pres-badge-dot" />
            {automaticMeta.label}
          </strong>
          <small>Les connexions brutes restent conservées après la correction.</small>
        </div>

        <form className="pres-correction-form" onSubmit={handleSubmit}>
          <label htmlFor="attendance-status">
            <span>Statut final</span>
            <select
              id="attendance-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              data-dialog-initial-focus
            >
              <option value="automatic">Calcul automatique</option>
              <option value="present">Présent</option>
              <option value="late">En retard</option>
              <option value="absent">Absent</option>
            </select>
          </label>

          {status === 'late' && (
            <label htmlFor="attendance-late-minutes">
              <span>Minutes de retard</span>
              <input
                id="attendance-late-minutes"
                type="number"
                min="1"
                max="1440"
                required
                value={lateMinutes}
                onChange={(event) => setLateMinutes(event.target.value)}
              />
            </label>
          )}

          <label htmlFor="attendance-reason" className="pres-correction-reason">
            <span>Motif ou précision <small>(facultatif)</small></span>
            <textarea
              id="attendance-reason"
              maxLength="500"
              rows="3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex. oubli de connexion, problème de matériel…"
            />
          </label>

          <footer className="pres-dialog-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : status === 'automatic' ? 'Rétablir le calcul' : 'Enregistrer'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EmployeeAttendanceProfile({ employee, initialMonth, refreshKey, onClose }) {
  const [month, setMonth] = useState(initialMonth);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dialogRef = useDialogFocus(onClose);

  const loadStats = useCallback(() => {
    let active = true;
    setLoading(true);
    planningService
      .getAdminAttendanceStats(employee.id, month)
      .then((result) => {
        if (!active) return;
        setStats(result);
        setError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.response?.data?.error || 'Impossible de charger les statistiques de présence');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [employee.id, month]);

  useEffect(() => loadStats(), [loadStats, refreshKey]);

  const summary = stats?.summary;

  return (
    <div className="pres-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        ref={dialogRef}
        className="pres-dialog pres-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-profile-title"
      >
        <header className="pres-dialog-header pres-profile-header">
          <span className="pres-user pres-profile-identity">
            <PresAvatar user={employee} />
            <span className="pres-user-text">
              <span className="pres-user-name" id="attendance-profile-title">{employee.full_name}</span>
              <span className="pres-user-pos">{employee.position || 'Employé'}</span>
            </span>
          </span>
          <button type="button" className="pres-dialog-close" onClick={onClose} aria-label="Fermer les statistiques">
            <IconX />
          </button>
        </header>

        <div className="pres-profile-toolbar">
          <div>
            <p className="pres-eyebrow">Statistiques de présence</p>
            <strong>{formatMonthLabel(month)}</strong>
          </div>
          <label htmlFor="attendance-stats-month">
            <span>Mois</span>
            <input
              id="attendance-stats-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              data-dialog-initial-focus
            />
          </label>
        </div>

        {error && (
          <div className="info-banner info-banner--planning-error pres-error" role="alert">
            <IconAlert />
            <span>{error}</span>
            <button type="button" className="btn-outline" onClick={loadStats}>Réessayer</button>
          </div>
        )}

        {loading && !stats ? (
          <div className="admin-loading"><span className="admin-loading-spinner" /><p>Chargement des statistiques…</p></div>
        ) : stats ? (
          <>
            <div className="pres-profile-kpis">
              <article className="pres-profile-kpi pres-profile-kpi--present">
                <span>Présent</span><strong>{summary.present}</strong><small>jour{summary.present > 1 ? 's' : ''}</small>
              </article>
              <article className="pres-profile-kpi pres-profile-kpi--late">
                <span>En retard</span><strong>{summary.late}</strong><small>jour{summary.late > 1 ? 's' : ''}</small>
              </article>
              <article className="pres-profile-kpi pres-profile-kpi--absent">
                <span>Absent</span><strong>{summary.absent}</strong><small>jour{summary.absent > 1 ? 's' : ''}</small>
              </article>
              <article className="pres-profile-kpi pres-profile-kpi--minutes">
                <span>Retard cumulé</span><strong>{formatMinutes(summary.total_late_minutes)}</strong>
                <small>{summary.late ? `${summary.average_late_minutes} min en moyenne` : 'Aucun retard'}</small>
              </article>
            </div>

            <section className="pres-profile-history" aria-labelledby="attendance-history-title">
              <header>
                <div>
                  <h3 id="attendance-history-title">Détail par jour</h3>
                  <p>{summary.assessed_days} jour{summary.assessed_days > 1 ? 's' : ''} évalué{summary.assessed_days > 1 ? 's' : ''}</p>
                </div>
              </header>
              {stats.days.length === 0 ? (
                <div className="empty-state">Aucune journée planifiée ou corrigée pour ce mois.</div>
              ) : (
                <div className="pres-history-list">
                  {stats.days.map((day) => {
                    const meta = PRESENCE_META[day.presence_status] || PRESENCE_META.off;
                    return (
                      <article className="pres-history-day" key={day.date}>
                        <div>
                          <strong>{formatDayLabel(day.date)}</strong>
                          <span>
                            Arrivée {day.first_login || 'non enregistrée'}
                            {day.planned_start ? ` · prévue ${day.planned_start}` : ''}
                          </span>
                        </div>
                        <div className="pres-history-status">
                          <span className={`pres-badge pres-badge--${meta.cls}`}>
                            <span className="pres-badge-dot" />{meta.label}
                          </span>
                          {day.presence_status === 'late' && (
                            <strong className="pres-history-late">+{day.late_minutes} min</strong>
                          )}
                          {day.manual_correction && <small>Correction manuelle</small>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function AdminPresence() {
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [correctionEmployee, setCorrectionEmployee] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const requestIdRef = useRef(0);

  const load = useCallback((d, { background = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (!background) setLoading(true);
    return planningService
      .getAdminAttendance(d)
      .then((nextData) => {
        if (requestId !== requestIdRef.current) return;
        setData(nextData);
        setError('');
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        const message = err.response?.data?.error || 'Impossible de charger la présence';
        setError(message);
      })
      .finally(() => {
        if (requestId === requestIdRef.current && !background) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(date);
    const interval = window.setInterval(() => load(date, { background: true }), 20000);
    return () => {
      window.clearInterval(interval);
      requestIdRef.current += 1;
    };
  }, [date, load]);

  async function saveCorrection(payload) {
    try {
      await planningService.setAdminAttendanceOverride(correctionEmployee.id, {
        date,
        ...payload,
      });
      notifySuccess(
        payload.status === 'automatic'
          ? 'Le calcul automatique de présence est rétabli'
          : 'La présence a été corrigée'
      );
      setCorrectionEmployee(null);
      setStatsRefreshKey((key) => key + 1);
      await load(date);
    } catch (requestError) {
      notifyError(requestError.response?.data?.error || "Impossible d'enregistrer la correction");
      throw requestError;
    }
  }

  const summary = data?.summary;

  return (
    <div className="pres-page">
      <div className="pres-toolbar">
        <div>
          <p className="pres-eyebrow">Présence de l'équipe</p>
          <p className="pres-sub">Suivi du respect du planning : présent, en retard ou absent.</p>
        </div>
        <div className="pres-toolbar-actions">
          <label className="pres-date">
            <span>Jour</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn-outline" onClick={() => load(date)} disabled={loading}>
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="info-banner info-banner--planning-error pres-error" role="alert">
          <IconAlert />
          <span>{data ? `${error}. Les dernières données valides restent affichées.` : error}</span>
          {!data && <button type="button" className="btn-outline" onClick={() => load(date)}>Réessayer</button>}
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-loading-spinner" /><p>Chargement de la présence…</p></div>
      ) : !data ? (
        <div className="empty-state">Les données de présence sont momentanément indisponibles.</div>
      ) : (
        <>
          <div className="pres-kpi-grid">
            <div className="pres-kpi pres-kpi--present">
              <span className="pres-kpi-icon"><IconCheckCircle /></span>
              <div><strong>{summary.present}</strong><span>Présents</span></div>
            </div>
            <div className="pres-kpi pres-kpi--late">
              <span className="pres-kpi-icon"><IconClock /></span>
              <div><strong>{summary.late}</strong><span>En retard</span></div>
            </div>
            <div className="pres-kpi pres-kpi--partial">
              <span className="pres-kpi-icon"><IconAlert /></span>
              <div><strong>{(summary.partial || 0) + (summary.outside || 0)}</strong><span>Partiels / hors planning</span></div>
            </div>
            <div className="pres-kpi pres-kpi--absent">
              <span className="pres-kpi-icon"><IconAlert /></span>
              <div><strong>{summary.absent}</strong><span>Absents</span></div>
            </div>
            <div className="pres-kpi pres-kpi--pending">
              <span className="pres-kpi-icon"><IconClock /></span>
              <div><strong>{summary.pending || 0}</strong><span>À venir / en attente</span></div>
            </div>
            <div className="pres-kpi">
              <span className="pres-kpi-icon"><IconUser /></span>
              <div><strong>{summary.off}</strong><span>Repos / congé</span></div>
            </div>
            <div className="pres-kpi pres-kpi--acc">
              <div className="pres-kpi-ring" style={{ '--val': `${summary.avg_accomplishment ?? 0}` }}>
                <span>{summary.avg_accomplishment != null ? `${summary.avg_accomplishment}%` : '—'}</span>
              </div>
              <div><strong className="pres-kpi-acc-label">Accomplissement</strong><span>moyen du planning</span></div>
            </div>
          </div>

          {data.employees.length === 0 ? (
            <div className="empty-state">Aucun employé.</div>
          ) : (
            <div className="task-table-wrap pres-table-wrap">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Planning du jour</th>
                    <th>Présence</th>
                    <th>Arrivée</th>
                    <th>Accomplissement</th>
                    <th>Temps connecté</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp) => {
                    const meta = PRESENCE_META[emp.presence_status] || PRESENCE_META.off;
                    return (
                      <tr key={emp.id}>
                        <td>
                          <button
                            type="button"
                            className="pres-user pres-user-button"
                            onClick={() => setProfileEmployee(emp)}
                            aria-label={`Voir les statistiques de présence de ${emp.full_name}`}
                          >
                            <PresAvatar user={emp} />
                            <span className="pres-user-text">
                              <span className="pres-user-name">
                                {emp.full_name}
                                {emp.is_connected_now && (
                                  <span className="pres-online-dot" role="img" aria-label="Connecté en ce moment" />
                                )}
                              </span>
                              <span className="pres-user-pos">{emp.position || 'Employé'}</span>
                            </span>
                          </button>
                        </td>
                        <td>
                          {emp.availability_status ? (
                            <span className={`pill ${STATUS_PILL_CLASS[emp.availability_status] || ''}`}>
                              {STATUS_LABELS[emp.availability_status]}
                            </span>
                          ) : (
                            <span className="pres-muted">Non déclaré</span>
                          )}
                        </td>
                        <td>
                          <span className="pres-status-cell">
                            <span className={`pres-badge pres-badge--${meta.cls}`}>
                              <span className="pres-badge-dot" />
                              {meta.label}
                            </span>
                            {emp.manual_correction && (
                              <span
                                className="pres-manual-tag"
                                title={emp.manual_correction.reason || 'Statut corrigé par un administrateur'}
                              >
                                Corrigé
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {['absent', 'off', 'upcoming', 'waiting'].includes(emp.presence_status) ? (
                            <span className="pres-muted">—</span>
                          ) : (
                            <span className="pres-arrival">
                              {emp.first_login || '—'}
                              {emp.scheduled && emp.planned_start && (
                                <span className="pres-arrival-planned">/ prévu {emp.planned_start}</span>
                              )}
                              {emp.late_minutes > 0 && <span className="pres-late-tag">+{emp.late_minutes}min</span>}
                            </span>
                          )}
                        </td>
                        <td>
                          {emp.accomplishment == null ? (
                            <span className="pres-muted">—</span>
                          ) : (
                            <span className="pres-acc">
                              <span className="pres-acc-track">
                                <span
                                  className={`pres-acc-fill ${accomplishmentClass(emp.accomplishment)}`}
                                  style={{ width: `${emp.accomplishment}%` }}
                                  role="progressbar"
                                  aria-label={`Accomplissement de ${emp.full_name}`}
                                  aria-valuemin="0"
                                  aria-valuemax="100"
                                  aria-valuenow={emp.accomplishment}
                                />
                              </span>
                              <span className="pres-acc-val">{emp.accomplishment}%</span>
                            </span>
                          )}
                        </td>
                        <td>{emp.connected_minutes > 0 ? formatMinutes(emp.connected_minutes) : <span className="pres-muted">—</span>}</td>
                        <td>
                          <span className="pres-row-actions">
                            <button
                              type="button"
                              className="pres-action-button"
                              onClick={() => setProfileEmployee(emp)}
                              aria-label={`Statistiques de ${emp.full_name}`}
                            >
                              <IconBarChart />
                              <span>Statistiques</span>
                            </button>
                            <button
                              type="button"
                              className="pres-action-button"
                              onClick={() => setCorrectionEmployee(emp)}
                              disabled={date > toDateInputValue(new Date())}
                              title={date > toDateInputValue(new Date()) ? 'Une présence future ne peut pas être corrigée' : ''}
                              aria-label={`Corriger la présence de ${emp.full_name}`}
                            >
                              <IconPencil />
                              <span>Corriger</span>
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {correctionEmployee && (
        <AttendanceCorrectionDialog
          employee={correctionEmployee}
          date={date}
          onClose={() => setCorrectionEmployee(null)}
          onSave={saveCorrection}
        />
      )}

      {profileEmployee && (
        <EmployeeAttendanceProfile
          employee={profileEmployee}
          initialMonth={date.slice(0, 7)}
          refreshKey={statsRefreshKey}
          onClose={() => setProfileEmployee(null)}
        />
      )}
    </div>
  );
}

export default AdminPresence;
