import { useEffect, useState, useCallback } from 'react';
import * as dailyService from '../../services/dailyService';
import * as avatarService from '../../services/avatarService';
import { notifyError } from '../../utils/toast';
import '../../styles/daily.css';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatLongDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
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
function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
function formatSubmit(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

function Column({ label, count, tasks, emptyText, submittedAt }) {
  return (
    <div className="daily-report-col">
      <p className="daily-report-label">
        {label} · {count}
      </p>
      {submittedAt && <span className="daily-report-sent">Envoyé le {formatSubmit(submittedAt)}</span>}
      {tasks.length === 0 ? (
        <span className="daily-report-empty">{emptyText}</span>
      ) : (
        groupByProject(tasks).map((group) => (
          <div key={group.project} className="daily-recap-group">
            <p className="daily-recap-project">{group.project}</p>
            {group.tasks.map((t) => (
              <div key={t.task_id} className="daily-report-item">
                <span className="daily-bullet" />
                <span>{t.title}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function AdminDaily() {
  const [date, setDate] = useState(todayStr());
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrls, setAvatarUrls] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dailyService.getOverview(date);
      setEmployees(data.employees || []);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les rapports');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Photos (même mécanisme que le dashboard : on tente le blob, on ignore les échecs).
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      employees.map(async (e) => {
        try {
          return [e.id, URL.createObjectURL(await avatarService.getUserAvatarBlob(e.id))];
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!cancelled) setAvatarUrls(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => {
      cancelled = true;
    };
  }, [employees]);

  const isToday = date === todayStr();

  return (
    <>
      <div className="daily-toolbar">
        <div className="daily-datenav">
          <button type="button" className="daily-datenav-btn" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Jour précédent">
            ‹
          </button>
          <input
            type="date"
            className="form-input daily-dateinput"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value || todayStr())}
          />
          <button
            type="button"
            className="daily-datenav-btn"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            disabled={isToday}
            aria-label="Jour suivant"
          >
            ›
          </button>
          {!isToday && (
            <button type="button" className="btn-outline daily-today-btn" onClick={() => setDate(todayStr())}>
              Aujourd'hui
            </button>
          )}
          <span className="daily-admin-date">{formatLongDate(date)}</span>
        </div>
        <span className="results-count">{employees.length} employé(s)</span>
      </div>

      {loading ? (
        <div className="empty-state">Chargement…</div>
      ) : employees.length === 0 ? (
        <div className="empty-state">Aucun rapport pour cette date.</div>
      ) : (
        <div className="daily-admin-list">
          {employees.map((emp) => (
            <div key={emp.id} className="side-card daily-report">
              <div className="daily-report-head">
                {avatarUrls[emp.id] ? (
                  <img src={avatarUrls[emp.id]} alt="" className="daily-report-avatar" />
                ) : (
                  <span className="daily-report-avatar daily-report-avatar--initials">{initialsOf(emp.full_name) || '?'}</span>
                )}
                <div>
                  <strong className="daily-report-name">{emp.full_name}</strong>
                  {emp.position && <span className="daily-report-role">{emp.position}</span>}
                </div>
              </div>
              <div className="daily-report-cols">
                <Column label="To do" count={emp.todo.length} tasks={emp.todo} emptyText="Journée non validée" submittedAt={emp.todo_submitted_at} />
                <Column label="Daily" count={emp.daily.length} tasks={emp.daily} emptyText="—" submittedAt={emp.daily_submitted_at} />

              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default AdminDaily;
