import { useEffect, useMemo, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as userService from '../../services/userService';
import { notifyError, notifySuccess } from '../../utils/toast';
import WeekCalendarGrid from '../../components/employee/WeekCalendarGrid';
import { IconAlert, IconX, IconCalendarWeek, IconUser, IconCheckCircle, IconClock, IconSearch } from '../../components/icons';
import {
  ADMIN_STATUS_OPTIONS,
  EFFECTIVE_STATUS_LABELS,
  EFFECTIVE_STATUS_PILL_CLASS,
  HAS_SLOTS_STATUSES,
  formatWeekRange,
  formatDateTime,
  toDraftDays,
  toDateInputValue,
  getMondayOf,
  timeToMinutes,
} from '../../utils/planningFormat';
import '../../styles/app.css';
import '../../styles/planning.css';
import '../../styles/week-calendar.css';
import '../../styles/admin.css';
import '../../styles/admin-planning.css';

function todayDateInputValue() {
  return toDateInputValue(new Date());
}

// Décale une date (chaîne YYYY-MM-DD) de n jours et renvoie une chaîne YYYY-MM-DD.
function shiftDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function totalHoursOf(days) {
  let minutes = 0;
  days.forEach((day) => {
    if (HAS_SLOTS_STATUSES.includes(day.availability_status)) {
      day.time_slots.forEach((slot) => {
        minutes += timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
      });
    }
  });
  return Math.round((minutes / 60) * 10) / 10;
}

function SummaryCards({ summary }) {
  if (!summary) return null;
  const tiles = [
    { icon: <IconUser />, value: summary.active_employees, label: 'Employés actifs' },
    { icon: <IconCheckCircle />, value: summary.submitted_count, label: 'Plannings soumis' },
    { icon: <IconAlert />, value: summary.not_submitted_count, label: 'Non soumis' },
    { icon: <IconClock />, value: summary.available_today, label: "Disponibles aujourd'hui" },
  ];
  return (
    <div className="aplan-summary">
      {tiles.map((tile) => (
        <div className="aplan-kpi" key={tile.label}>
          <span className="aplan-kpi-icon">{tile.icon}</span>
          <div>
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanningDetailModal({ planningId, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [draftDays, setDraftDays] = useState([]);
  const [draftNote, setDraftNote] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    planningService
      .getAdminPlanningDetail(planningId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDraftDays(toDraftDays(data.days));
        setDraftNote(data.planning?.general_note || '');
      })
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger le planning'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planningId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleStatusChange(date, status) {
    setDraftDays((days) =>
      days.map((day) =>
        day.date === date
          ? { ...day, availability_status: status, time_slots: HAS_SLOTS_STATUSES.includes(status) ? day.time_slots : [] }
          : day
      )
    );
  }

  function handleSlotsChange(date, slots) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, time_slots: slots } : day)));
  }

  function handleCopyTo(fromDate, toDate) {
    setDraftDays((days) => {
      const src = days.find((d) => d.date === fromDate);
      if (!src) return days;
      return days.map((day) =>
        day.date === toDate
          ? { ...day, availability_status: src.availability_status, time_slots: src.time_slots.map((s) => ({ ...s })) }
          : day
      );
    });
  }

  function handleNoteChange(date, note) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, note } : day)));
  }

  async function handleToggleHistory() {
    if (!showHistory && !history) {
      try {
        const data = await planningService.getAdminPlanningHistory(planningId);
        setHistory(data.items);
      } catch (err) {
        notifyError(err.response?.data?.error || "Impossible de charger l'historique");
      }
    }
    setShowHistory((value) => !value);
  }

  async function handleSave() {
    // Le motif est facultatif : aucune validation bloquante côté client.
    setSaving(true);
    setErrors([]);
    try {
      const payloadDays = draftDays.map((day) => ({
        date: day.date,
        availability_status: day.availability_status,
        note: day.note || null,
        time_slots: HAS_SLOTS_STATUSES.includes(day.availability_status) ? day.time_slots : [],
      }));
      const result = await planningService.updateAdminPlanning(planningId, {
        changeReason,
        generalNote: draftNote,
        days: payloadDays,
      });
      notifySuccess('Planning mis à jour');
      onSaved(result);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      else notifyError(data?.error || "Impossible d'enregistrer les modifications");
    } finally {
      setSaving(false);
    }
  }

  const totalHours = totalHoursOf(draftDays);

  return (
    <div className="aplan-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="aplan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aplan-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="aplan-modal-head">
          <span className="aplan-modal-avatar">{initials(detail?.user?.full_name)}</span>
          <div className="aplan-modal-identity">
            <h2 id="aplan-detail-title">{detail?.user ? detail.user.full_name : 'Détail du planning'}</h2>
            <p>
              <IconCalendarWeek />
              {detail ? formatWeekRange(detail.week_start_date, detail.week_end_date) : ''}
            </p>
          </div>
          {detail && (
            <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[detail.effective_status] || ''}`}>
              {EFFECTIVE_STATUS_LABELS[detail.effective_status] || detail.effective_status}
            </span>
          )}
          <button type="button" className="aplan-modal-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </header>

        <div className="aplan-modal-body">
          {loading && (
            <div className="admin-loading">
              <span className="admin-loading-spinner" />
              <p>Chargement du planning…</p>
            </div>
          )}

          {!loading && detail && (
            <>
              {detail.admin_modified && (
                <div className="info-banner info-banner--planning-warning">
                  <IconAlert />
                  <span>
                    Modifié par {detail.planning.last_modified_by_name || 'un administrateur'} le{' '}
                    {formatDateTime(detail.planning.admin_modified_at)}
                    {detail.planning.last_admin_change_reason
                      ? `. Motif : ${detail.planning.last_admin_change_reason}`
                      : ''}
                  </span>
                </div>
              )}

              <div className="aplan-modal-toolbar">
                <span className="aplan-modal-total">
                  <IconClock />
                  Total déclaré : <strong>{totalHours} h</strong>
                </span>
                <button type="button" className="app-link" onClick={handleToggleHistory}>
                  {showHistory ? "Masquer l'historique" : "Voir l'historique"}
                </button>
              </div>

              {showHistory && (
                <div className="aplan-history">
                  {!history && <p className="planning-day-empty">Chargement de l'historique…</p>}
                  {history && history.length === 0 && <p className="planning-day-empty">Aucun historique.</p>}
                  {history && history.length > 0 && (
                    <ul>
                      {history.map((entry) => (
                        <li key={entry.id}>
                          <span className="aplan-history-dot" />
                          <span className="aplan-history-text">
                            <strong>{entry.action}</strong>
                            {entry.changed_by_name ? ` par ${entry.changed_by_name}` : ''}
                            {entry.change_reason ? ` — ${entry.change_reason}` : ''}
                          </span>
                          <span className="aplan-history-time">{formatDateTime(entry.changed_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {errors.length > 0 && (
                <div className="info-banner info-banner--planning-error">
                  <IconAlert />
                  <ul className="planning-error-list">
                    {errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="aplan-modal-hint">
                Glissez dans une colonne pour créer une plage, faites glisser ses bords pour l'ajuster. Les points de
                couleur définissent le statut du jour.
              </p>

              <WeekCalendarGrid
                days={draftDays}
                canEdit
                statusOptions={ADMIN_STATUS_OPTIONS}
                onStatusChange={handleStatusChange}
                onSlotsChange={handleSlotsChange}
                onCopyTo={handleCopyTo}
                onNoteChange={handleNoteChange}
              />

              <label className="planning-general-note aplan-note">
                <span>Note générale (facultatif)</span>
                <textarea rows="2" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
              </label>

              <label className="planning-general-note aplan-note">
                <span>Motif de la modification (facultatif)</span>
                <textarea
                  rows="2"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Ex : Absence imprévue, remplacement… (optionnel)"
                />
              </label>
            </>
          )}
        </div>

        <footer className="aplan-modal-foot">
          <button type="button" className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function AdminPlanning() {
  const [filters, setFilters] = useState({
    week_start_date: '',
    user_id: '',
    status: '',
    search: '',
    availability_status: '',
    submitted: '',
  });
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [plannings, setPlannings] = useState([]);
  const [nonSubmitted, setNonSubmitted] = useState([]);
  const [loadingTable, setLoadingTable] = useState(true);
  const [selectedPlanningId, setSelectedPlanningId] = useState(null);

  const [availabilityDate, setAvailabilityDate] = useState(todayDateInputValue());
  const [availabilityStart, setAvailabilityStart] = useState('09:00');
  const [availabilityEnd, setAvailabilityEnd] = useState('11:00');
  const [availabilityResults, setAvailabilityResults] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    userService
      .getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' })
      .then(setEmployees)
      .catch(() => setEmployees([]));
    planningService
      .getAdminPlanningSummary()
      .then((data) => {
        setSummary(data);
        setFilters((current) => ({ ...current, week_start_date: current.week_start_date || data.week_start_date }));
      })
      .catch(() => {});
  }, []);

  function loadTable(activeFilters) {
    setLoadingTable(true);
    const params = {};
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    Promise.all([
      planningService.getAdminPlannings(params),
      activeFilters.week_start_date ? planningService.getAdminNonSubmitted(activeFilters.week_start_date) : Promise.resolve([]),
      planningService.getAdminPlanningSummary(activeFilters.week_start_date ? { week_start_date: activeFilters.week_start_date } : {}),
    ])
      .then(([planningsData, nonSubmittedData, summaryData]) => {
        setPlannings(planningsData);
        setNonSubmitted(nonSubmittedData);
        setSummary(summaryData);
      })
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les plannings'))
      .finally(() => setLoadingTable(false));
  }

  useEffect(() => {
    if (!filters.week_start_date) return;
    loadTable(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function handleFilterChange(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function handleWeekPick(value) {
    if (!value) return;
    handleFilterChange('week_start_date', getMondayOf(value));
  }

  // Raccourcis de semaine (lundi de la semaine courante / suivante).
  const currentWeekStart = getMondayOf(todayDateInputValue());
  const nextWeekStart = shiftDays(currentWeekStart, 7);

  async function handleCreateForNonSubmitted(employee) {
    try {
      const result = await planningService.createAdminPlanningForUser({
        userId: employee.user_id,
        weekStartDate: filters.week_start_date,
      });
      setSelectedPlanningId(result.planning_id);
      loadTable(filters);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de créer ce planning');
    }
  }

  async function handleSearchAvailability(event) {
    event.preventDefault();
    setAvailabilityLoading(true);
    try {
      const results = await planningService.searchAdminAvailability({
        date: availabilityDate,
        startTime: availabilityStart,
        endTime: availabilityEnd,
      });
      setAvailabilityResults(results);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de rechercher les disponibilités');
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function handleDetailSaved() {
    setSelectedPlanningId(null);
    loadTable(filters);
  }

  const hasFilters = useMemo(
    () => filters.user_id || filters.search || filters.status || filters.availability_status || filters.submitted,
    [filters]
  );

  function actionLabel(status) {
    return status === 'SUBMITTED' || status === 'ADMIN_MODIFIED' ? 'Modifier' : 'Consulter';
  }

  return (
    <div className="aplan-page">
      <SummaryCards summary={summary} />

      <div className="admin-filter-bar aplan-filters">
        <div className="filter-group">
          <span className="filter-group-label">Semaine</span>
          <button
            type="button"
            className={`filter-chip${filters.week_start_date === currentWeekStart ? ' filter-chip--active' : ''}`}
            onClick={() => handleFilterChange('week_start_date', currentWeekStart)}
          >
            Cette semaine
          </button>
          <button
            type="button"
            className={`filter-chip${filters.week_start_date === nextWeekStart ? ' filter-chip--active' : ''}`}
            onClick={() => handleFilterChange('week_start_date', nextWeekStart)}
          >
            Semaine prochaine
          </button>
          <input
            type="date"
            className="filter-select"
            value={filters.week_start_date}
            onChange={(e) => handleWeekPick(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Employé</span>
          <select className="filter-select" value={filters.user_id} onChange={(e) => handleFilterChange('user_id', e.target.value)}>
            <option value="">Tous</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Statut</span>
          <select className="filter-select" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="">Tous</option>
            <option value="DRAFT">Brouillon</option>
            <option value="SUBMITTED">Soumis</option>
            <option value="ADMIN_MODIFIED">Modifié par un admin</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Soumission</span>
          <select className="filter-select" value={filters.submitted} onChange={(e) => handleFilterChange('submitted', e.target.value)}>
            <option value="">Toutes</option>
            <option value="true">Soumis</option>
            <option value="false">Non soumis</option>
          </select>
        </div>
        <div className="filter-search aplan-search">
          <IconSearch />
          <input
            type="text"
            placeholder="Rechercher un employé…"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            className="admin-filter-reset"
            onClick={() =>
              setFilters((c) => ({ ...c, user_id: '', search: '', status: '', availability_status: '', submitted: '' }))
            }
          >
            Réinitialiser
          </button>
        )}
      </div>

      <section className="aplan-panel">
        <header className="aplan-panel-head">
          <h2>Plannings de la semaine</h2>
          <span className="aplan-panel-count">{plannings.length}</span>
        </header>
        {loadingTable ? (
          <div className="admin-loading"><span className="admin-loading-spinner" /><p>Chargement…</p></div>
        ) : plannings.length === 0 ? (
          <div className="empty-state">Aucun planning ne correspond à ces filtres.</div>
        ) : (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Poste</th>
                  <th>Semaine</th>
                  <th>Statut</th>
                  <th>Heures</th>
                  <th>Soumis le</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {plannings.map((row) => (
                  <tr key={row.planning_id} className="aplan-row" onClick={() => setSelectedPlanningId(row.planning_id)}>
                    <td>
                      <span className="aplan-row-name">
                        <span className="aplan-row-avatar">{initials(row.full_name)}</span>
                        {row.full_name}
                      </span>
                    </td>
                    <td>{row.position || '—'}</td>
                    <td>{formatWeekRange(row.week_start_date, row.week_end_date)}</td>
                    <td>
                      <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[row.effective_status] || ''}`}>
                        {EFFECTIVE_STATUS_LABELS[row.effective_status] || row.effective_status}
                      </span>
                    </td>
                    <td>{row.total_hours} h</td>
                    <td>{row.submitted_at ? formatDateTime(row.submitted_at) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="aplan-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlanningId(row.planning_id);
                        }}
                      >
                        {actionLabel(row.effective_status)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="aplan-two-col">
        <section className="aplan-panel">
          <header className="aplan-panel-head">
            <h2>Plannings non soumis</h2>
            {nonSubmitted.length > 0 && <span className="aplan-panel-count aplan-panel-count--warn">{nonSubmitted.length}</span>}
          </header>
          {nonSubmitted.length === 0 ? (
            <div className="empty-state">Tous les employés actifs ont soumis leur planning. 🎉</div>
          ) : (
            <ul className="aplan-nonsubmitted">
              {nonSubmitted.map((employee) => (
                <li key={employee.user_id}>
                  <span className="aplan-row-avatar">{initials(employee.full_name)}</span>
                  <span className="aplan-nonsubmitted-info">
                    <strong>{employee.full_name}</strong>
                    <span>{employee.position || '—'}</span>
                  </span>
                  {employee.planning_id ? (
                    <button type="button" className="aplan-action" onClick={() => setSelectedPlanningId(employee.planning_id)}>
                      Consulter
                    </button>
                  ) : (
                    <button type="button" className="aplan-action aplan-action--create" onClick={() => handleCreateForNonSubmitted(employee)}>
                      + Créer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="aplan-panel">
          <header className="aplan-panel-head">
            <h2>Recherche de disponibilité</h2>
          </header>
          <form className="aplan-availability-form" onSubmit={handleSearchAvailability}>
            <label>
              <span>Date</span>
              <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} required />
            </label>
            <div className="aplan-availability-times">
              <label>
                <span>Début</span>
                <input type="time" value={availabilityStart} onChange={(e) => setAvailabilityStart(e.target.value)} required />
              </label>
              <label>
                <span>Fin</span>
                <input type="time" value={availabilityEnd} onChange={(e) => setAvailabilityEnd(e.target.value)} required />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={availabilityLoading}>
              {availabilityLoading ? 'Recherche…' : 'Rechercher les disponibles'}
            </button>
          </form>

          {availabilityResults && (
            <div className="aplan-availability-results">
              {availabilityResults.length === 0 ? (
                <p className="planning-day-empty">Aucun employé disponible sur ce créneau.</p>
              ) : (
                <div className="aplan-availability-chips">
                  {availabilityResults.map((employee) => (
                    <span className="aplan-availability-chip" key={employee.user_id}>
                      <span className="aplan-row-avatar aplan-row-avatar--sm">{initials(employee.full_name)}</span>
                      {employee.full_name}
                      <small>{employee.position}</small>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {selectedPlanningId && (
        <PlanningDetailModal
          planningId={selectedPlanningId}
          onClose={() => setSelectedPlanningId(null)}
          onSaved={handleDetailSaved}
        />
      )}
    </div>
  );
}

export default AdminPlanning;
