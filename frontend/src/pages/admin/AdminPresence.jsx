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
        const message = err.response?.data?.error || 'Unable to load attendance';
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
          ? 'Automatic attendance calculation restored'
          : 'Attendance corrected'
      );
      setCorrectionEmployee(null);
      setStatsRefreshKey((key) => key + 1);
      await load(date);
    } catch (requestError) {
      notifyError(requestError.response?.data?.error || 'Unable to save the correction');
      throw requestError;
    }
  }

  const summary = data?.summary;

  if (loading && !data) return <PageSkeleton variant="table" />;

  return (
    <div className="pres-page">
      <div className="pres-toolbar">
        <div>
          <p className="pres-eyebrow">Team attendance</p>
          <p className="pres-sub">Tracking schedule compliance: present, late or absent.</p>
        </div>
        <div className="pres-toolbar-actions">
          <label className="pres-date">
            <span>Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn-outline" onClick={() => load(date)} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="info-banner info-banner--planning-error pres-error" role="alert">
          <IconAlert />
          <span>{data ? `${error}. The last valid data remains displayed.` : error}</span>
          {!data && <button type="button" className="btn-outline" onClick={() => load(date)}>Retry</button>}
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-loading-spinner" /><p>Loading attendance…</p></div>
      ) : !data ? (
        <div className="empty-state">Attendance data is temporarily unavailable.</div>
      ) : (
        <>
          <div className="pres-kpi-grid">
            <div className="pres-kpi pres-kpi--present">
              <span className="pres-kpi-icon"><IconCheckCircle /></span>
              <div><strong>{summary.present}</strong><span>Present</span></div>
            </div>
            <div className="pres-kpi pres-kpi--late">
              <span className="pres-kpi-icon"><IconClock /></span>
              <div><strong>{summary.late}</strong><span>Late</span></div>
            </div>
            <div className="pres-kpi pres-kpi--partial">
              <span className="pres-kpi-icon"><IconAlert /></span>
              <div><strong>{(summary.partial || 0) + (summary.outside || 0)}</strong><span>Partial / off schedule</span></div>
            </div>
            <div className="pres-kpi pres-kpi--absent">
              <span className="pres-kpi-icon"><IconAlert /></span>
              <div><strong>{summary.absent}</strong><span>Absent</span></div>
            </div>
            <div className="pres-kpi pres-kpi--pending">
              <span className="pres-kpi-icon"><IconClock /></span>
              <div><strong>{summary.pending || 0}</strong><span>Upcoming / waiting</span></div>
            </div>
            <div className="pres-kpi">
              <span className="pres-kpi-icon"><IconUser /></span>
              <div><strong>{summary.off}</strong><span>Off / leave</span></div>
            </div>
            <div className="pres-kpi pres-kpi--acc">
              <div className="pres-kpi-ring" style={{ '--val': `${summary.avg_accomplishment ?? 0}` }}>
                <span>{summary.avg_accomplishment != null ? `${summary.avg_accomplishment}%` : '—'}</span>
              </div>
              <div><strong className="pres-kpi-acc-label">Accomplishment</strong><span>average of the schedule</span></div>
            </div>
          </div>

          {data.employees.length === 0 ? (
            <div className="empty-state">No employee.</div>
          ) : (
            <div className="task-table-wrap pres-table-wrap">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Day schedule</th>
                    <th>Attendance</th>
                    <th>Arrival</th>
                    <th>Accomplishment</th>
                    <th>Connected time</th>
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
                            aria-label={`View ${emp.full_name}'s attendance statistics`}
                          >
                            <PresAvatar user={emp} />
                            <span className="pres-user-text">
                              <span className="pres-user-name">
                                {emp.full_name}
                                {emp.is_connected_now && (
                                  <span className="pres-online-dot" role="img" aria-label="Connected right now" />
                                )}
                              </span>
                              <span className="pres-user-pos">{emp.position || 'Employee'}</span>
                            </span>
                          </button>
                        </td>
                        <td>
                          {emp.availability_status ? (
                            <span className={`pill ${STATUS_PILL_CLASS[emp.availability_status] || ''}`}>
                              {STATUS_LABELS[emp.availability_status]}
                            </span>
                          ) : (
                            <span className="pres-muted">Not declared</span>
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
                                title={emp.manual_correction.reason || 'Status corrected by an administrator'}
                              >
                                Corrected
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
                                <span className="pres-arrival-planned">/ planned {emp.planned_start}</span>
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
                                  aria-label={`Accomplishment of ${emp.full_name}`}
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
                              aria-label={`Statistics for ${emp.full_name}`}
                            >
                              <IconBarChart />
                              <span>Statistics</span>
                            </button>
                            <button
                              type="button"
                              className="pres-action-button"
                              onClick={() => setCorrectionEmployee(emp)}
                              disabled={date > toDateInputValue(new Date())}
                              title={date > toDateInputValue(new Date()) ? 'Future attendance cannot be corrected' : ''}
                              aria-label={`Correct ${emp.full_name}'s attendance`}
                            >
                              <IconPencil />
                              <span>Correct</span>
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
