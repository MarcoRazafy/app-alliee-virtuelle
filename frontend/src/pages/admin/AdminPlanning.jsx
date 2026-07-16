import { useEffect, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as userService from '../../services/userService';
import { notifyError, notifySuccess } from '../../utils/toast';
import { IconAlert, IconTrash, IconX, IconCalendarWeek, IconUser, IconCheckCircle, IconClock } from '../../components/icons';
import {
  ADMIN_STATUS_OPTIONS,
  EFFECTIVE_STATUS_LABELS,
  EFFECTIVE_STATUS_PILL_CLASS,
  HAS_SLOTS_STATUSES,
  formatDayLabel,
  formatWeekRange,
  formatDateTime,
  toDraftDays,
  toDateInputValue,
  getMondayOf,
} from '../../utils/planningFormat';
import '../../styles/app.css';
import '../../styles/planning.css';
import '../../styles/admin-planning.css';

function todayDateInputValue() {
  return toDateInputValue(new Date());
}

function SummaryCards({ summary }) {
  if (!summary) return null;
  return (
    <div className="stat-tile-grid admin-planning-summary">
      <div className="stat-tile">
        <span className="stat-tile-icon stat-tile-icon--blue">
          <IconUser />
        </span>
        <div>
          <div className="stat-tile-value">{summary.active_employees}</div>
          <div className="stat-tile-label">Employés actifs</div>
        </div>
      </div>
      <div className="stat-tile">
        <span className="stat-tile-icon stat-tile-icon--green">
          <IconCheckCircle />
        </span>
        <div>
          <div className="stat-tile-value">{summary.submitted_count}</div>
          <div className="stat-tile-label">Plannings soumis</div>
        </div>
      </div>
      <div className="stat-tile">
        <span className="stat-tile-icon stat-tile-icon--amber">
          <IconAlert />
        </span>
        <div>
          <div className="stat-tile-value">{summary.not_submitted_count}</div>
          <div className="stat-tile-label">Plannings non soumis</div>
        </div>
      </div>
      <div className="stat-tile">
        <span className="stat-tile-icon stat-tile-icon--purple">
          <IconClock />
        </span>
        <div>
          <div className="stat-tile-value">{summary.available_today}</div>
          <div className="stat-tile-label">Disponibles aujourd'hui</div>
        </div>
      </div>
    </div>
  );
}

function AdminDayEditor({ day, index, onStatusChange, onSlotAdd, onSlotRemove, onSlotChange, onNoteChange }) {
  const status = day.availability_status;
  const showSlots = status && HAS_SLOTS_STATUSES.includes(status);

  return (
    <div className="planning-day-card">
      <div className="planning-day-header">
        <span className="planning-day-name">{formatDayLabel(day.date, index)}</span>
      </div>

      <div className="planning-day-status-group" role="group" aria-label="Statut de disponibilité">
        {ADMIN_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${status === option.value ? ' filter-chip--active' : ''}`}
            onClick={() => onStatusChange(day.date, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showSlots && (
        <div className="planning-slots">
          {day.time_slots.map((slot, slotIndex) => (
            <div className="planning-slot-row" key={slotIndex}>
              <input
                type="time"
                value={slot.start_time}
                onChange={(e) => onSlotChange(day.date, slotIndex, 'start_time', e.target.value)}
              />
              <span className="planning-slot-sep">à</span>
              <input type="time" value={slot.end_time} onChange={(e) => onSlotChange(day.date, slotIndex, 'end_time', e.target.value)} />
              <button
                type="button"
                className="icon-link-btn"
                onClick={() => onSlotRemove(day.date, slotIndex)}
                aria-label="Supprimer cette plage"
              >
                <IconTrash />
              </button>
            </div>
          ))}
          <button type="button" className="btn-outline planning-add-slot-btn" onClick={() => onSlotAdd(day.date)}>
            + Ajouter une plage horaire
          </button>
        </div>
      )}

      <label className="planning-day-note">
        <span>Note (facultatif)</span>
        <input type="text" value={day.note} onChange={(e) => onNoteChange(day.date, e.target.value)} />
      </label>
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

  function updateDay(date, patch) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, ...patch } : day)));
  }

  function handleStatusChange(date, status) {
    setDraftDays((days) =>
      days.map((day) =>
        day.date === date
          ? { ...day, availability_status: status, time_slots: HAS_SLOTS_STATUSES.includes(status) ? day.time_slots : [] }
          : day
      )
    );
  }

  function handleSlotAdd(date) {
    setDraftDays((days) =>
      days.map((day) => (day.date === date ? { ...day, time_slots: [...day.time_slots, { start_time: '08:00', end_time: '12:00' }] } : day))
    );
  }

  function handleSlotRemove(date, index) {
    setDraftDays((days) =>
      days.map((day) => (day.date === date ? { ...day, time_slots: day.time_slots.filter((_, i) => i !== index) } : day))
    );
  }

  function handleSlotChange(date, index, field, value) {
    setDraftDays((days) =>
      days.map((day) =>
        day.date === date
          ? { ...day, time_slots: day.time_slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)) }
          : day
      )
    );
  }

  function handleNoteChange(date, note) {
    updateDay(date, { note });
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
    if (!changeReason.trim()) {
      setErrors(['Le motif de la modification est obligatoire.']);
      return;
    }
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

  return (
    <div className="admin-planning-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-planning-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-planning-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-planning-modal-header">
          <div>
            <span className="admin-planning-modal-icon">
              <IconCalendarWeek />
            </span>
            <div>
              <h2 id="admin-planning-detail-title">
                {detail?.user ? detail.user.full_name : 'Détail du planning'}
              </h2>
              <p>{detail ? formatWeekRange(detail.week_start_date, detail.week_end_date) : ''}</p>
            </div>
          </div>
          <button type="button" className="admin-planning-modal-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        <div className="admin-planning-modal-body">
          {loading && <div className="empty-state">Chargement...</div>}

          {!loading && detail && (
            <>
              {detail.admin_modified && (
                <div className="info-banner info-banner--planning-warning">
                  <IconAlert />
                  <span>
                    Modifié par {detail.planning.last_modified_by_name || 'un administrateur'} le{' '}
                    {formatDateTime(detail.planning.admin_modified_at)}. Motif : {detail.planning.last_admin_change_reason}
                  </span>
                </div>
              )}

              <div className="admin-planning-modal-status-row">
                <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[detail.effective_status] || ''}`}>
                  {EFFECTIVE_STATUS_LABELS[detail.effective_status] || detail.effective_status}
                </span>
                <button type="button" className="app-link" onClick={handleToggleHistory}>
                  {showHistory ? "Masquer l'historique" : "Voir l'historique"}
                </button>
              </div>

              {showHistory && (
                <div className="admin-planning-history">
                  {!history && <p className="planning-day-empty">Chargement de l'historique...</p>}
                  {history && history.length === 0 && <p className="planning-day-empty">Aucun historique.</p>}
                  {history && history.length > 0 && (
                    <ul>
                      {history.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.action}</strong> — {formatDateTime(entry.changed_at)}
                          {entry.changed_by_name ? ` par ${entry.changed_by_name}` : ''}
                          {entry.change_reason ? ` (motif : ${entry.change_reason})` : ''}
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

              <label className="planning-general-note">
                <span>Note générale (facultatif)</span>
                <textarea rows="2" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
              </label>

              <div className="planning-days-grid">
                {draftDays.map((day, index) => (
                  <AdminDayEditor
                    key={day.date}
                    day={day}
                    index={index}
                    onStatusChange={handleStatusChange}
                    onSlotAdd={handleSlotAdd}
                    onSlotRemove={handleSlotRemove}
                    onSlotChange={handleSlotChange}
                    onNoteChange={handleNoteChange}
                  />
                ))}
              </div>

              <label className="planning-general-note">
                <span>Motif de la modification (obligatoire)</span>
                <textarea
                  rows="2"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Ex : Absence imprévue, remplacement..."
                  required
                />
              </label>

              <div className="admin-planning-modal-actions">
                <button type="button" className="btn-outline" onClick={onClose}>
                  Annuler
                </button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </>
          )}
        </div>
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

  return (
    <div className="admin-planning-page">
      <h1>Gestion des plannings</h1>
      <p className="admin-planning-subtitle">Supervisez les disponibilités hebdomadaires de l'équipe.</p>

      <SummaryCards summary={summary} />

      <div className="admin-planning-filters filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">Semaine</span>
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
          <span className="filter-group-label">Recherche</span>
          <input
            type="text"
            className="filter-select"
            placeholder="Nom ou email"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
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
          <span className="filter-group-label">Disponibilité</span>
          <select
            className="filter-select"
            value={filters.availability_status}
            onChange={(e) => handleFilterChange('availability_status', e.target.value)}
          >
            <option value="">Toutes</option>
            {ADMIN_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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
      </div>

      <div className="side-card">
        <div className="side-card-header">
          <p className="side-card-title">Plannings de la semaine</p>
        </div>
        {loadingTable && <div className="empty-state">Chargement...</div>}
        {!loadingTable && plannings.length === 0 && <div className="empty-state">Aucun planning ne correspond à ces filtres.</div>}
        {!loadingTable && plannings.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Poste</th>
                  <th>Semaine</th>
                  <th>Statut</th>
                  <th>Heures dispo.</th>
                  <th>Soumis le</th>
                  <th>Dernière modif.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plannings.map((row) => (
                  <tr key={row.planning_id}>
                    <td>{row.full_name}</td>
                    <td>{row.position}</td>
                    <td>{formatWeekRange(row.week_start_date, row.week_end_date)}</td>
                    <td>
                      <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[row.effective_status] || ''}`}>
                        {EFFECTIVE_STATUS_LABELS[row.effective_status] || row.effective_status}
                      </span>
                    </td>
                    <td>{row.total_hours} h</td>
                    <td>{row.submitted_at ? formatDateTime(row.submitted_at) : '—'}</td>
                    <td>{row.updated_at ? formatDateTime(row.updated_at) : '—'}</td>
                    <td>
                      <button type="button" className="app-link" onClick={() => setSelectedPlanningId(row.planning_id)}>
                        Consulter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="side-card">
        <div className="side-card-header">
          <p className="side-card-title">Plannings non soumis</p>
        </div>
        {nonSubmitted.length === 0 && <div className="empty-state">Tous les employés actifs ont soumis leur planning.</div>}
        {nonSubmitted.length > 0 && (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Poste</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {nonSubmitted.map((employee) => (
                  <tr key={employee.user_id}>
                    <td>{employee.full_name}</td>
                    <td>{employee.position}</td>
                    <td>
                      {employee.planning_id ? (
                        <button type="button" className="app-link" onClick={() => setSelectedPlanningId(employee.planning_id)}>
                          Consulter
                        </button>
                      ) : (
                        <button type="button" className="app-link" onClick={() => handleCreateForNonSubmitted(employee)}>
                          Créer un planning
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="side-card">
        <div className="side-card-header">
          <p className="side-card-title">Recherche de disponibilité</p>
        </div>
        <form className="admin-planning-availability-form" onSubmit={handleSearchAvailability}>
          <label>
            <span>Date</span>
            <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} required />
          </label>
          <label>
            <span>Heure de début</span>
            <input type="time" value={availabilityStart} onChange={(e) => setAvailabilityStart(e.target.value)} required />
          </label>
          <label>
            <span>Heure de fin</span>
            <input type="time" value={availabilityEnd} onChange={(e) => setAvailabilityEnd(e.target.value)} required />
          </label>
          <button type="submit" className="btn-primary" disabled={availabilityLoading}>
            {availabilityLoading ? 'Recherche...' : 'Rechercher'}
          </button>
        </form>

        {availabilityResults && (
          <div className="admin-planning-availability-results">
            {availabilityResults.length === 0 && <p className="planning-day-empty">Aucun employé disponible sur ce créneau.</p>}
            {availabilityResults.length > 0 && (
              <ul>
                {availabilityResults.map((employee) => (
                  <li key={employee.user_id}>
                    {employee.full_name} — {employee.position}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
