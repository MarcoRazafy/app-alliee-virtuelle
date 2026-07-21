import { useEffect, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as avatarService from '../../services/avatarService';
import { notifyError } from '../../utils/toast';
import { STATUS_LABELS, STATUS_PILL_CLASS, toDateInputValue } from '../../utils/planningFormat';
import { IconCheckCircle, IconClock, IconAlert, IconUser } from '../../components/icons';
import '../../styles/admin.css';
import '../../styles/admin-presence.css';

const PRESENCE_META = {
  present: { label: 'Présent', cls: 'present' },
  late: { label: 'En retard', cls: 'late' },
  absent: { label: 'Absent', cls: 'absent' },
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

function AdminPresence() {
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  function load(d) {
    setLoading(true);
    planningService
      .getAdminAttendance(d)
      .then(setData)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger la présence'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(date);
  }, [date]);

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

      {loading ? (
        <div className="admin-loading"><span className="admin-loading-spinner" /><p>Chargement de la présence…</p></div>
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
            <div className="pres-kpi pres-kpi--absent">
              <span className="pres-kpi-icon"><IconAlert /></span>
              <div><strong>{summary.absent}</strong><span>Absents</span></div>
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
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp) => {
                    const meta = PRESENCE_META[emp.presence_status] || PRESENCE_META.off;
                    return (
                      <tr key={emp.id}>
                        <td>
                          <span className="pres-user">
                            <PresAvatar user={emp} />
                            <span className="pres-user-text">
                              <span className="pres-user-name">
                                {emp.full_name}
                                {emp.is_connected_now && <span className="pres-online-dot" title="Connecté en ce moment" />}
                              </span>
                              <span className="pres-user-pos">{emp.position || 'Employé'}</span>
                            </span>
                          </span>
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
                          <span className={`pres-badge pres-badge--${meta.cls}`}>
                            <span className="pres-badge-dot" />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          {emp.presence_status === 'absent' || emp.presence_status === 'off' ? (
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
                                />
                              </span>
                              <span className="pres-acc-val">{emp.accomplishment}%</span>
                            </span>
                          )}
                        </td>
                        <td>{emp.connected_minutes > 0 ? formatMinutes(emp.connected_minutes) : <span className="pres-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminPresence;
