import { useCallback, useEffect, useState } from 'react';
import * as planningService from '../../services/planningService';
import { IconAlert, IconX } from '../icons';
import PresAvatar from './PresAvatar';
import { PRESENCE_META, formatMinutes, formatDayLabel, formatMonthLabel, useDialogFocus } from './adminPresenceHelpers';

// Panneau latéral des statistiques de présence d'un employé (par mois). Extrait d'AdminPresence.
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

export default EmployeeAttendanceProfile;
