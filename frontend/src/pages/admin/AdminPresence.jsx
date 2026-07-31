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
  IconPencil,
  IconBarChart,
} from '../../components/icons';
import '../../styles/admin.css';
import '../../styles/admin-presence.css';
import { PageSkeleton } from '../../components/Skeleton';
import PresAvatar from '../../components/admin/PresAvatar';
import AttendanceCorrectionDialog from '../../components/admin/AttendanceCorrectionDialog';
import EmployeeAttendanceProfile from '../../components/admin/EmployeeAttendanceProfile';
import { PRESENCE_META, formatMinutes, accomplishmentClass } from '../../components/admin/adminPresenceHelpers';

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

  if (loading && !data) return <PageSkeleton variant="table" />;

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
