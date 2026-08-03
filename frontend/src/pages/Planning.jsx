import { useEffect, useMemo, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import WeekCalendarGrid from '../components/employee/WeekCalendarGrid';
import * as planningService from '../services/planningService';
import * as sessionService from '../services/sessionService';
import { notifyError, notifySuccess } from '../utils/toast';
import { IconAlert, IconCheckCircle, IconCalendarWeek, IconClock, IconTrendingUp } from '../components/icons';
import { computeWeekPresence, formatPresenceMinutes } from '../utils/presenceMetrics';
import {
  EMPLOYEE_STATUS_OPTIONS,
  EFFECTIVE_STATUS_LABELS,
  EFFECTIVE_STATUS_PILL_CLASS,
  formatWeekRange,
  formatDateTime,
  formatDayLabel,
  toTimeInputValue,
  toDraftDays,
  computeTotalHours,
  slotsOverlap,
  generateWeekOptions,
} from '../utils/planningFormat';
import '../styles/planning.css';
import '../styles/week-calendar.css';

function AdminModifiedAlert({ planning }) {
  if (!planning) return null;
  return (
    <div className="info-banner info-banner--planning-warning">
      <IconAlert />
      <div>
        <strong>Votre planning a été modifié par un administrateur.</strong>
        <p>
          Le {formatDateTime(planning.admin_modified_at)}
          {planning.last_modified_by_name ? ` par ${planning.last_modified_by_name}` : ''}.
        </p>
        {planning.last_admin_change_reason && <p>Motif : {planning.last_admin_change_reason}</p>}
      </div>
    </div>
  );
}

function PresenceSummaryCards({ summary, loading }) {
  if (loading) {
    return <div className="presence-kpi-loading" role="status">Calcul de la présence en cours…</div>;
  }
  if (!summary) return null;

  const lateValue = summary.lateDays > 0
    ? `${summary.lateDays} j · ${formatPresenceMinutes(summary.lateMinutes)}`
    : 'Aucun';
  const cards = [
    {
      icon: <IconCalendarWeek />,
      value: formatPresenceMinutes(summary.plannedMinutes),
      label: 'Temps planifié',
      hint: 'Créneaux déclarés pour la semaine',
    },
    {
      icon: <IconClock />,
      value: formatPresenceMinutes(summary.connectedMinutes),
      label: 'Temps connecté',
      hint: 'Toutes les connexions, planning compris ou non',
    },
    {
      icon: <IconCheckCircle />,
      value: formatPresenceMinutes(summary.coveredMinutes),
      label: 'Temps couvert',
      hint: 'Connexion réellement comprise dans les créneaux',
    },
    {
      icon: <IconTrendingUp />,
      value: lateValue,
      label: 'Retards',
      hint: 'Tolérance de 10 minutes incluse',
    },
  ];

  return (
    <div className="presence-kpi-grid" aria-label="Synthèse de présence de la semaine">
      {cards.map((card) => (
        <article className="presence-kpi-card" key={card.label}>
          <span className="presence-kpi-icon" aria-hidden="true">{card.icon}</span>
          <div>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
            <small>{card.hint}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function QuickAddForm({ days, canEdit, onAdd }) {
  const [date, setDate] = useState(days[0]?.date || '');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');

  useEffect(() => {
    if (!days.some((day) => day.date === date)) setDate(days[0]?.date || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (!canEdit) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onAdd(date, startTime, endTime);
  }

  return (
    <form className="planning-quick-add" onSubmit={handleSubmit}>
      <span className="planning-quick-add-label">Ajouter une disponibilité</span>
      <select className="filter-select" value={date} onChange={(event) => setDate(event.target.value)}>
        {days.map((day, index) => (
          <option key={day.date} value={day.date}>
            {formatDayLabel(day.date, index)}
          </option>
        ))}
      </select>
      <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
      <span className="planning-quick-add-sep">à</span>
      <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
      <button type="submit" className="btn-primary">
        Ajouter
      </button>
    </form>
  );
}

function Planning() {
  // Le planning est accessible à l'employé ET à l'admin (pour son propre planning) : on choisit
  // le layout selon le rôle. AdminLayout ignore les props title/subtitle (il n'utilise que children).
  const isAdmin = useAuthStore((state) => state.user?.role === 'ADMIN');
  const Layout = isAdmin ? AdminLayout : EmployeeLayout;
  const [currentWeek, setCurrentWeek] = useState(null);
  const [nextWeek, setNextWeek] = useState(null);
  const [draftDays, setDraftDays] = useState([]);
  const [draftNote, setDraftNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  const [browsedWeek, setBrowsedWeek] = useState(null);
  const [browsing, setBrowsing] = useState(false);

  // Chrono de connexion (présence), indépendant du chrono de tâche : uniquement affiché
  // sur la semaine actuelle (lecture seule), une semaine future ne pouvant avoir de connexion réelle.
  const [sessionSegmentsByDate, setSessionSegmentsByDate] = useState({});
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [hasSessionSnapshot, setHasSessionSnapshot] = useState(false);
  const [sessionsError, setSessionsError] = useState('');

  const [myPlannings, setMyPlannings] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listWeekFilter, setListWeekFilter] = useState('');
  const weekOptions = useMemo(() => generateWeekOptions({ pastCount: 12, futureCount: 1 }), []);

  useEffect(() => {
    async function load() {
      try {
        const [current, next] = await Promise.all([planningService.getCurrentWeekPlanning(), planningService.getNextWeekPlanning()]);
        setCurrentWeek(current);
        setNextWeek(next);
        // La semaine éditée est la semaine prochaine (normal) ou, en rattrapage, la semaine en cours.
        const target = Boolean(current.can_edit) && !next.can_edit ? current : next;
        setDraftDays(toDraftDays(target.days));
        setDraftNote(target.planning?.general_note || '');

        sessionService
          .getMySessionsForWeek(current.week_start_date)
          .then((segments) => {
            const byDate = {};
            segments.forEach((segment) => {
              if (!byDate[segment.date]) byDate[segment.date] = [];
              byDate[segment.date].push(segment);
            });
            setSessionSegmentsByDate(byDate);
            setHasSessionSnapshot(true);
            setSessionsError('');
          })
          .catch(() => setSessionsError('Impossible de charger la présence. Aucun statut d’absence n’est déduit.'))
          .finally(() => setSessionsLoaded(true));
      } catch (err) {
        notifyError(err.response?.data?.error || 'Impossible de charger le planning');
      } finally {
        setLoading(false);
      }
    }
    load();
    loadMyPlannings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suivi temps réel : rafraîchit périodiquement les sessions de connexion pour que la
  // bande de présence s'étende et change de couleur en direct (à l'heure / en retard).
  useEffect(() => {
    const weekStart = currentWeek?.week_start_date;
    if (!weekStart) return undefined;
    function refresh() {
      sessionService
        .getMySessionsForWeek(weekStart)
        .then((segments) => {
          const byDate = {};
          segments.forEach((segment) => {
            if (!byDate[segment.date]) byDate[segment.date] = [];
            byDate[segment.date].push(segment);
          });
          setSessionSegmentsByDate(byDate);
          setHasSessionSnapshot(true);
          setSessionsError('');
        })
        .catch(() => setSessionsError('La présence en direct ne peut pas être actualisée. Les dernières données valides restent affichées.'));
    }
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, [currentWeek?.week_start_date]);

  async function loadMyPlannings(weekStartDate) {
    setLoadingList(true);
    try {
      const items = await planningService.getMyPlannings(weekStartDate ? { week_start_date: weekStartDate } : {});
      setMyPlannings(items);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger vos plannings');
    } finally {
      setLoadingList(false);
    }
  }

  function handleListWeekFilterChange(weekStart) {
    setListWeekFilter(weekStart);
    loadMyPlannings(weekStart || undefined);
  }

  // Semaine réellement éditée : la semaine prochaine (cas normal) ou, en rattrapage, la
  // semaine en cours (nouvel employé / oubli — voir backend canEmployeeEditWeek).
  const editingCurrentWeek = Boolean(currentWeek?.can_edit) && !nextWeek?.can_edit;
  const editTarget = editingCurrentWeek ? currentWeek : nextWeek;
  const canEdit = Boolean(editTarget?.can_edit);

  // Réinitialise le brouillon quand la semaine cible change (ex. après avoir soumis le
  // rattrapage, l'édition repasse sur la semaine prochaine).
  useEffect(() => {
    if (!editTarget) return;
    setDraftDays(toDraftDays(editTarget.days));
    setDraftNote(editTarget.planning?.general_note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget?.week_start_date]);

  // Tous les indicateurs sont dérivés des mêmes segments que la grille. Les sessions qui
  // se chevauchent sont fusionnées et ne sont donc jamais comptées deux fois.
  const presenceSummary = useMemo(
    () => (currentWeek && hasSessionSnapshot ? computeWeekPresence(currentWeek.days, sessionSegmentsByDate) : null),
    [currentWeek, sessionSegmentsByDate, hasSessionSnapshot]
  );

  function handleStatusChange(date, status) {
    setDraftDays((days) =>
      days.map((day) =>
        day.date === date
          ? { ...day, availability_status: status, time_slots: status === 'UNAVAILABLE' ? [] : day.time_slots }
          : day
      )
    );
  }

  function handleSlotsChange(date, slots) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, time_slots: slots } : day)));
  }

  function handleNoteChange(date, note) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, note } : day)));
  }

  // Petite fonction dédiée pour ajouter rapidement une plage jour+heure sans passer par le
  // glisser-déposer : le résultat s'affiche immédiatement dans la grille, comme un tracé manuel.
  function handleQuickAdd(date, startTime, endTime) {
    if (!date) return;
    if (!startTime || !endTime || endTime <= startTime) {
      notifyError("L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }
    const day = draftDays.find((d) => d.date === date);
    if (!day) return;
    if (day.availability_status === 'UNAVAILABLE') {
      notifyError("Ce jour est marqué indisponible : changez d'abord son statut.");
      return;
    }

    const nextSlots = [...day.time_slots, { start_time: startTime, end_time: endTime }];
    if (slotsOverlap(nextSlots)) {
      notifyError('Cette plage chevauche une plage existante.');
      return;
    }

    setDraftDays((days) =>
      days.map((d) =>
        d.date === date ? { ...d, availability_status: d.availability_status || 'AVAILABLE', time_slots: nextSlots } : d
      )
    );
    notifySuccess('Plage ajoutée au planning');
  }

  async function handleConsultWeek(weekStartDate) {
    setBrowsing(true);
    try {
      const result = await planningService.getWeekPlanning(weekStartDate);
      setBrowsedWeek(result);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger cette semaine');
    } finally {
      setBrowsing(false);
    }
  }

  function handleCopyTo(sourceDate, targetDate) {
    setDraftDays((days) => {
      const source = days.find((day) => day.date === sourceDate);
      if (!source) return days;
      return days.map((day) =>
        day.date === targetDate
          ? {
              ...day,
              availability_status: source.availability_status,
              note: source.note,
              time_slots: source.time_slots.map((slot) => ({ ...slot })),
            }
          : day
      );
    });
  }

  function handleCopyPreviousWeek() {
    if (!currentWeek?.planning) return;
    setDraftDays((days) =>
      days.map((day, index) => {
        const previous = currentWeek.days[index];
        const previousStatus = previous?.availability_status;
        const isEmployeeStatus = EMPLOYEE_STATUS_OPTIONS.some((option) => option.value === previousStatus);
        if (!isEmployeeStatus) return day;
        return {
          ...day,
          availability_status: previousStatus,
          note: previous.note || '',
          time_slots: (previous.time_slots || []).map((slot) => ({
            start_time: toTimeInputValue(slot.start_time),
            end_time: toTimeInputValue(slot.end_time),
          })),
        };
      })
    );
    notifySuccess('Disponibilités de la semaine actuelle copiées');
  }

  function buildPayloadDays() {
    return draftDays.map((day) => ({
      date: day.date,
      availability_status: day.availability_status,
      note: day.note || null,
      time_slots: day.availability_status === 'UNAVAILABLE' ? [] : day.time_slots,
    }));
  }

  async function handleSaveDraft() {
    setSaving(true);
    setErrors([]);
    try {
      const result = editingCurrentWeek
        ? await planningService.saveCurrentWeekPlanning({ generalNote: draftNote, days: buildPayloadDays() })
        : await planningService.saveNextWeekPlanning({ generalNote: draftNote, days: buildPayloadDays() });
      if (editingCurrentWeek) setCurrentWeek(result);
      else setNextWeek(result);
      setDraftDays(toDraftDays(result.days));
      notifySuccess('Brouillon enregistré');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setErrors(data.errors);
      } else {
        notifyError(data?.error || "Impossible d'enregistrer le brouillon");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const confirmMessage = editingCurrentWeek
      ? 'Confirmez-vous la soumission de votre planning pour la semaine en cours ?'
      : "Confirmez-vous la soumission de votre planning pour la semaine prochaine ? Vous pourrez encore le modifier jusqu'à dimanche 23h59.";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      if (editingCurrentWeek) {
        await planningService.saveCurrentWeekPlanning({ generalNote: draftNote, days: buildPayloadDays() });
        const result = await planningService.submitCurrentWeekPlanning();
        setCurrentWeek(result);
        setDraftDays(toDraftDays(result.days));
      } else {
        await planningService.saveNextWeekPlanning({ generalNote: draftNote, days: buildPayloadDays() });
        const result = await planningService.submitNextWeekPlanning();
        setNextWeek(result);
        setDraftDays(toDraftDays(result.days));
      }
      notifySuccess('Planning soumis');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setErrors(data.errors);
      } else {
        notifyError(data?.error || 'Impossible de soumettre le planning');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout
      title="Planning hebdomadaire"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Planning' }]}
      subtitle="Déclarez vos disponibilités pour la semaine prochaine"
      skeleton={loading && !currentWeek ? 'cards' : null}
    >
      <section className="planning-page">
        {loading && <div className="empty-state">Chargement du planning...</div>}

        {!loading && currentWeek && nextWeek && (
          <>
            {!editingCurrentWeek && (
            <div className="side-card planning-week-card">
              <div className="side-card-header">
                <p className="side-card-title">Semaine actuelle</p>
                <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[currentWeek.effective_status] || ''}`}>
                  {EFFECTIVE_STATUS_LABELS[currentWeek.effective_status] || currentWeek.effective_status}
                </span>
              </div>
              <p className="planning-week-range">
                <IconCalendarWeek /> {formatWeekRange(currentWeek.week_start_date, currentWeek.week_end_date)}
              </p>

              <AdminModifiedAlert planning={currentWeek.admin_modified ? currentWeek.planning : null} />

              <p className="cal-session-legend" aria-label="Légende de présence réelle">
                Présence réelle :
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--ontime" /> conforme</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--late" /> retard</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--off" /> hors planning</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--missing" /> non couvert</span>
              </p>

              <PresenceSummaryCards summary={presenceSummary} loading={!sessionsLoaded} />

              {sessionsError && (
                <div className="info-banner info-banner--planning-error" role="alert">
                  <IconAlert />
                  <span>{sessionsError}</span>
                </div>
              )}

              <WeekCalendarGrid
                days={currentWeek.days}
                canEdit={false}
                onNoteChange={() => {}}
                sessionSegmentsByDate={hasSessionSnapshot ? sessionSegmentsByDate : undefined}
              />

              <p className="planning-total-hours">Total : {currentWeek.total_hours} h disponibles</p>
            </div>
            )}

            <div className="side-card planning-week-card">
              <div className="side-card-header">
                <p className="side-card-title">
                  {editingCurrentWeek ? 'Semaine en cours (à compléter)' : 'Semaine prochaine'}
                </p>
                <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[editTarget.effective_status] || ''}`}>
                  {EFFECTIVE_STATUS_LABELS[editTarget.effective_status] || editTarget.effective_status}
                </span>
              </div>
              <p className="planning-week-range">
                <IconCalendarWeek /> {formatWeekRange(editTarget.week_start_date, editTarget.week_end_date)}
              </p>

              <AdminModifiedAlert planning={editTarget.admin_modified ? editTarget.planning : null} />

              <div className={`info-banner${canEdit ? '' : ' info-banner--planning-warning'}`}>
                {editingCurrentWeek ? (
                  <>
                    <IconCheckCircle />
                    <span>
                      Votre planning de la semaine en cours est vide : vous pouvez le compléter dès maintenant
                      (rattrapage). Il ne sera plus modifiable une fois soumis.
                    </span>
                  </>
                ) : canEdit ? (
                  <>
                    <IconCheckCircle />
                    <span>La saisie est ouverte jusqu'au {formatDateTime(nextWeek.editing_window_closes_at)}.</span>
                  </>
                ) : (
                  <>
                    <IconAlert />
                    <span>
                      La période de saisie du planning est fermée. Seul un administrateur peut maintenant modifier ce
                      planning.
                    </span>
                  </>
                )}
              </div>

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

              {!editingCurrentWeek && canEdit && currentWeek.planning && (
                <button type="button" className="btn-outline" onClick={handleCopyPreviousWeek}>
                  Copier la semaine actuelle
                </button>
              )}

              <label className="planning-general-note">
                <span>Note générale (facultatif)</span>
                <textarea
                  rows="2"
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Disponibilités de la semaine, remarques..."
                />
              </label>

              <QuickAddForm days={draftDays} canEdit={canEdit} onAdd={handleQuickAdd} />

              <WeekCalendarGrid
                days={draftDays}
                canEdit={canEdit}
                onStatusChange={handleStatusChange}
                onSlotsChange={handleSlotsChange}
                onCopyTo={handleCopyTo}
                onNoteChange={handleNoteChange}
              />

              <p className="planning-total-hours">Total : {computeTotalHours(draftDays)} h disponibles</p>

              <div className="planning-actions">
                <button type="button" className="btn-outline" onClick={handleSaveDraft} disabled={!canEdit || saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer le brouillon'}
                </button>
                <button type="button" className="btn-primary" onClick={handleSubmit} disabled={!canEdit || submitting}>
                  {submitting ? 'Envoi...' : 'Soumettre mon planning'}
                </button>
              </div>
            </div>

            <div className="side-card planning-week-card">
              <div className="side-card-header">
                <p className="side-card-title">Mes plannings</p>
              </div>
              <p className="planning-week-filter-hint">
                Filtrez par semaine de disponibilité pour retrouver un planning passé (lecture seule).
              </p>
              <div className="planning-week-filter">
                <select
                  className="filter-select"
                  value={listWeekFilter}
                  onChange={(e) => handleListWeekFilterChange(e.target.value)}
                  aria-label="Filtrer par semaine"
                >
                  <option value="">Toutes les semaines</option>
                  {weekOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {loadingList && <div className="empty-state">Chargement de vos plannings...</div>}
              {!loadingList && myPlannings.length === 0 && (
                <div className="empty-state">Aucun planning ne correspond à ce filtre.</div>
              )}
              {!loadingList && myPlannings.length > 0 && (
                <div className="task-table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Semaine</th>
                        <th>Statut</th>
                        <th>Soumis le</th>
                        <th>Heures dispo.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {myPlannings.map((item) => (
                        <tr key={item.planning_id}>
                          <td>{formatWeekRange(item.week_start_date, item.week_end_date)}</td>
                          <td>
                            <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[item.effective_status] || ''}`}>
                              {EFFECTIVE_STATUS_LABELS[item.effective_status] || item.effective_status}
                            </span>
                          </td>
                          <td>{item.submitted_at ? formatDateTime(item.submitted_at) : '—'}</td>
                          <td>{item.total_hours} h</td>
                          <td>
                            <button type="button" className="btn-outline btn-sm" onClick={() => handleConsultWeek(item.week_start_date)}>
                              Consulter
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {browsing && <div className="empty-state">Chargement...</div>}

              {browsedWeek && (
                <>
                  <div className="side-card-header planning-week-filter-result-header">
                    <p className="planning-week-range">
                      <IconCalendarWeek /> {formatWeekRange(browsedWeek.week_start_date, browsedWeek.week_end_date)}
                    </p>
                    <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[browsedWeek.effective_status] || ''}`}>
                      {EFFECTIVE_STATUS_LABELS[browsedWeek.effective_status] || browsedWeek.effective_status}
                    </span>
                  </div>

                  <AdminModifiedAlert planning={browsedWeek.admin_modified ? browsedWeek.planning : null} />

                  <WeekCalendarGrid days={browsedWeek.days} canEdit={false} onNoteChange={() => {}} />

                  <p className="planning-total-hours">Total : {browsedWeek.total_hours} h disponibles</p>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}

export default Planning;
