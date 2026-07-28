import { useEffect, useMemo, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as userService from '../../services/userService';
import * as avatarService from '../../services/avatarService';
import * as sessionService from '../../services/sessionService';
import { notifyError, notifySuccess } from '../../utils/toast';
import WeekCalendarGrid from '../../components/employee/WeekCalendarGrid';
import { IconAlert, IconX, IconUser, IconCheckCircle, IconClock, IconSearch } from '../../components/icons';
import {
  EFFECTIVE_STATUS_LABELS,
  EFFECTIVE_STATUS_PILL_CLASS,
  formatWeekRange,
  formatDateTime,
  getMondayOf,
} from '../../utils/planningFormat';
import '../../styles/app.css';
import '../../styles/planning.css';
import '../../styles/week-calendar.css';
import '../../styles/admin.css';
import '../../styles/admin-planning.css';
import PlanningDetailModal from '../../components/admin/PlanningDetailModal';
import { todayDateInputValue, shiftDays, initials } from '../../components/admin/adminPlanningHelpers';

function SummaryCards({ summary }) {
  if (!summary) return null;
  const tiles = [
    { icon: <IconUser />, value: summary.active_employees, label: 'Active employees' },
    { icon: <IconCheckCircle />, value: summary.submitted_count, label: 'Submitted schedules' },
    { icon: <IconAlert />, value: summary.not_submitted_count, label: 'Not submitted' },
    { icon: <IconClock />, value: summary.available_today, label: 'Available today' },
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
  const [avatarUrls, setAvatarUrls] = useState({});
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

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];
    const loadAvatars = async () => {
      const entries = await Promise.all(
        employees.filter((employee) => employee.has_avatar).map(async (employee) => {
          try {
            const blob = await avatarService.getUserAvatarBlob(employee.id);
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
            return [employee.id, objectUrl];
          } catch { return null; }
        })
      );
      if (!cancelled) {
        setAvatarUrls(Object.fromEntries(entries.filter(Boolean)));
      }
    };
    loadAvatars();
    return () => {
      cancelled = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [employees]);

  function employeeAvatar(userId, name, size = 'default') {
    const className = `aplan-row-avatar${size === 'sm' ? ' aplan-row-avatar--sm' : ''}`;
    return avatarUrls[userId] ? (
      <img
        src={avatarUrls[userId]}
        alt={`Photo of ${name}`}
        className={`${className} aplan-row-avatar--image`}
      />
    ) : (
      <span className={className}>{initials(name)}</span>
    );
  }

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
      .catch((err) => notifyError(err.response?.data?.error || 'Unable to load schedules'))
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
      notifyError(err.response?.data?.error || 'Unable to create this schedule');
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
      notifyError(err.response?.data?.error || 'Unable to search for availability');
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
    return status === 'SUBMITTED' || status === 'ADMIN_MODIFIED' ? 'Edit' : 'View';
  }

  return (
    <div className="aplan-page">
      <SummaryCards summary={summary} />

      <div className="admin-filter-bar aplan-filters">
        <div className="filter-group">
          <span className="filter-group-label">Week</span>
          <button
            type="button"
            className={`filter-chip${filters.week_start_date === currentWeekStart ? ' filter-chip--active' : ''}`}
            onClick={() => handleFilterChange('week_start_date', currentWeekStart)}
          >
            This week
          </button>
          <button
            type="button"
            className={`filter-chip${filters.week_start_date === nextWeekStart ? ' filter-chip--active' : ''}`}
            onClick={() => handleFilterChange('week_start_date', nextWeekStart)}
          >
            Next week
          </button>
          <input
            type="date"
            className="filter-select"
            value={filters.week_start_date}
            onChange={(e) => handleWeekPick(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Employee</span>
          <select className="filter-select" value={filters.user_id} onChange={(e) => handleFilterChange('user_id', e.target.value)}>
            <option value="">All</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
          <select className="filter-select" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="ADMIN_MODIFIED">Modified by an admin</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Submission</span>
          <select className="filter-select" value={filters.submitted} onChange={(e) => handleFilterChange('submitted', e.target.value)}>
            <option value="">All</option>
            <option value="true">Submitted</option>
            <option value="false">Not submitted</option>
          </select>
        </div>
        <div className="filter-search aplan-search">
          <IconSearch />
          <input
            type="text"
            placeholder="Search an employee…"
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
            Reset
          </button>
        )}
      </div>

      <section className="aplan-panel">
        <header className="aplan-panel-head">
          <h2>Schedules for the week</h2>
          <span className="aplan-panel-count">{plannings.length}</span>
        </header>
        {loadingTable ? (
          <div className="admin-loading"><span className="admin-loading-spinner" /><p>Loading…</p></div>
        ) : plannings.length === 0 ? (
          <div className="empty-state">No schedule matches these filters.</div>
        ) : (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Position</th>
                  <th>Week</th>
                  <th>Status</th>
                  <th>Hours</th>
                  <th>Submitted on</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {plannings.map((row) => (
                  <tr key={row.planning_id} className="aplan-row" onClick={() => setSelectedPlanningId(row.planning_id)}>
                    <td>
                      <span className="aplan-row-name">
                        {employeeAvatar(row.user_id, row.full_name)}
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
            <h2>Unsubmitted schedules</h2>
            {nonSubmitted.length > 0 && <span className="aplan-panel-count aplan-panel-count--warn">{nonSubmitted.length}</span>}
          </header>
          {nonSubmitted.length === 0 ? (
            <div className="empty-state">All active employees have submitted their schedule. 🎉</div>
          ) : (
            <ul className="aplan-nonsubmitted">
              {nonSubmitted.map((employee) => (
                <li key={employee.user_id}>
                  {employeeAvatar(employee.user_id, employee.full_name)}
                  <span className="aplan-nonsubmitted-info">
                    <strong>{employee.full_name}</strong>
                    <span>{employee.position || '—'}</span>
                  </span>
                  {employee.planning_id ? (
                    <button type="button" className="aplan-action" onClick={() => setSelectedPlanningId(employee.planning_id)}>
                      View
                    </button>
                  ) : (
                    <button type="button" className="aplan-action aplan-action--create" onClick={() => handleCreateForNonSubmitted(employee)}>
                      + Create
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="aplan-panel">
          <header className="aplan-panel-head">
            <h2>Availability search</h2>
          </header>
          <form className="aplan-availability-form" onSubmit={handleSearchAvailability}>
            <label>
              <span>Date</span>
              <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} required />
            </label>
            <div className="aplan-availability-times">
              <label>
                <span>Start</span>
                <input type="time" value={availabilityStart} onChange={(e) => setAvailabilityStart(e.target.value)} required />
              </label>
              <label>
                <span>End</span>
                <input type="time" value={availabilityEnd} onChange={(e) => setAvailabilityEnd(e.target.value)} required />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={availabilityLoading}>
              {availabilityLoading ? 'Searching…' : 'Search available'}
            </button>
          </form>

          {availabilityResults && (
            <div className="aplan-availability-results">
              {availabilityResults.length === 0 ? (
                <p className="planning-day-empty">No employee available for this slot.</p>
              ) : (
                <div className="aplan-availability-chips">
                  {availabilityResults.map((employee) => (
                    <span className="aplan-availability-chip" key={employee.user_id}>
                      {employeeAvatar(employee.user_id, employee.full_name, 'sm')}
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
          avatarUrls={avatarUrls}
          onClose={() => setSelectedPlanningId(null)}
          onSaved={handleDetailSaved}
        />
      )}
    </div>
  );
}

export default AdminPlanning;
