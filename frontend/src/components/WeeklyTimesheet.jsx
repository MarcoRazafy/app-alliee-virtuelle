import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as statsService from '../services/statsService';
import { formatDurationShort } from '../utils/formatters';
import { businessDayNow } from '../utils/businessDay';
import * as taskService from '../services/taskService';
import { notifyError, notifySuccess } from '../utils/toast';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconPencil,
  IconTrash,
} from './icons';
import '../styles/weekly-connections.css';

// Relevé de temps d'un employé sur une semaine. PARTAGÉ : la page admin l'ouvre pour
// n'importe qui (avec correction), l'espace employé pour soi-même (lecture seule).
// Relevé de temps d'un employé sur une semaine : ses entrées de chrono groupées par jour,
// chaque journée repliable, avec son total. Ouvert depuis la feuille de temps de l'équipe.

function shiftDate(dateString, days) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocal(dateString) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(dateString) {
  const label = parseLocal(dateString).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rangeLabel(days) {
  if (!days || days.length === 0) return '';
  const first = parseLocal(days[0]);
  const last = parseLocal(days[days.length - 1]);
  const opts = { day: 'numeric', month: 'short' };
  return `${first.toLocaleDateString('fr-FR', opts)} – ${last.toLocaleDateString('fr-FR', opts)}`;
}

// « 09:48 » à partir d'un horodatage. Les heures de chrono sont enregistrées en heure locale.
function clockTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Valeur attendue par un <input type="datetime-local"> : heure LOCALE, sans fuseau.
function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// `readOnly` : version employé — il consulte son propre relevé, sans jamais pouvoir le
// corriger. Les routes de correction sont de toute façon réservées aux admins ; masquer les
// boutons évite simplement de proposer une action qui serait refusée.
export default function WeeklyTimesheet({ employee, initialWeek, onBack, readOnly = false }) {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(initialWeek || businessDayNow());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Journées repliées. Par défaut tout est ouvert : une journée vide se voit d'un coup d'œil.
  const [collapsed, setCollapsed] = useState(() => new Set());

  const load = useCallback(
    async (dateInWeek) => {
      setLoading(true);
      try {
        const result = await statsService.getWeeklyTimelog(employee.id, dateInWeek);
        setData(result);
        setWeekStart(result.week_start_date);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Impossible de charger le relevé de temps');
      } finally {
        setLoading(false);
      }
    },
    [employee.id]
  );

  useEffect(() => {
    load(initialWeek || businessDayNow());
  }, [load, initialWeek]);

  const days = data?.days || [];
  const today = businessDayNow();
  const isCurrentWeek = days.includes(today);

  const entryCount = useMemo(
    () => days.reduce((sum, day) => sum + (data?.entries_by_day?.[day]?.length || 0), 0),
    [days, data]
  );

  // Correction d'une entrée, en place sous la ligne concernée : { id, start, end }.
  const [editingEntry, setEditingEntry] = useState(null);
  const [savingEntry, setSavingEntry] = useState(false);

  async function saveEntry(event) {
    event.preventDefault();
    if (!editingEntry || savingEntry) return;
    setSavingEntry(true);
    try {
      await taskService.updateTimelogEntry(editingEntry.id, {
        start_time: editingEntry.start,
        end_time: editingEntry.end,
      });
      setEditingEntry(null);
      await load(weekStart);
      notifySuccess('Temps corrigé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Correction impossible');
    } finally {
      setSavingEntry(false);
    }
  }

  async function removeEntry(entry) {
    if (!window.confirm(`Supprimer ce temps sur « ${entry.task_title} » ?\n\nIl sera retiré du total.`)) return;
    try {
      await taskService.deleteTimelogEntry(entry.id);
      await load(weekStart);
      notifySuccess('Temps supprimé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Suppression impossible');
    }
  }

  function toggleDay(day) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <section className="astat-panel wkc-panel">
      <header className="wkc-head wkc-head--detail">
        <div className="wkc-detail-identity">
          {onBack && (
            <button type="button" className="wkc-nav-btn" onClick={onBack} aria-label="Retour" title="Retour">
              <IconArrowLeft />
            </button>
          )}
          <div>
            <p className="astat-panel-eyebrow">Relevé de temps</p>
            <h2>{data?.user?.full_name || employee.full_name}</h2>
          </div>
        </div>

        <div className="wkc-nav">
          <button
            type="button"
            className="wkc-nav-btn"
            onClick={() => load(shiftDate(weekStart, -7))}
            aria-label="Semaine précédente"
            title="Semaine précédente"
          >
            <IconChevronLeft />
          </button>
          <span className="wkc-nav-label">{rangeLabel(days)}</span>
          <button
            type="button"
            className="wkc-nav-btn"
            onClick={() => load(shiftDate(weekStart, 7))}
            aria-label="Semaine suivante"
            title="Semaine suivante"
          >
            <IconChevronRight />
          </button>
          <label className="wkc-jump" title="Aller à une semaine">
            <input
              type="date"
              value={weekStart}
              onChange={(e) => e.target.value && load(e.target.value)}
              aria-label="Aller à la semaine contenant cette date"
            />
          </label>
          <button
            type="button"
            className="wkc-today-btn"
            onClick={() => load(businessDayNow())}
            disabled={isCurrentWeek}
          >
            Cette semaine
          </button>
          <span className="wkc-week-total">
            <IconClock /> {formatDurationShort(data?.total_seconds || 0)}
          </span>
        </div>
      </header>

      <div className="wkc-sheet">
        {loading && !data ? (
          <p className="wkc-empty">Chargement…</p>
        ) : entryCount === 0 ? (
          <p className="wkc-empty">Aucun temps enregistré sur cette semaine.</p>
        ) : (
          days.map((day) => {
            const entries = data.entries_by_day[day] || [];
            const open = !collapsed.has(day);
            return (
              <div key={day} className="wkc-day">
                <button
                  type="button"
                  className="wkc-day-head"
                  onClick={() => toggleDay(day)}
                  aria-expanded={open}
                >
                  <span className={`wkc-day-chevron${open ? ' wkc-day-chevron--open' : ''}`}>
                    <IconChevronDown />
                  </span>
                  <span className={`wkc-day-label${day === today ? ' wkc-day-label--today' : ''}`}>
                    {dayLabel(day)}
                  </span>
                  <span className="wkc-day-count">
                    {entries.length} {entries.length > 1 ? 'entrées' : 'entrée'}
                  </span>
                  {/* Connexion à côté du temps sur les tâches : l'écart entre les deux est
                      justement ce qu'on vient lire. */}
                  {data.connection_by_day && (
                    <span className="wkc-day-connection" title="Temps de connexion ce jour-là">
                      <IconClock /> {formatDurationShort(data.connection_by_day[day] || 0)}
                    </span>
                  )}
                  <span className="wkc-day-total">{formatDurationShort(data.totals_by_day[day] || 0)}</span>
                </button>

                {open &&
                  (entries.length === 0 ? (
                    <p className="wkc-day-empty">Aucun temps ce jour-là.</p>
                  ) : (
                    <table className="wkc-sheet-table">
                      <thead>
                        <tr>
                          <th className="wkc-sheet-th-task">Tâche</th>
                          <th>Début</th>
                          <th>Fin</th>
                          <th>Temps</th>
                          {!readOnly && <th className="wkc-sheet-th-actions" aria-label="Actions" />}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <Fragment key={entry.id}>
                            <tr
                              className="wkc-sheet-row"
                              onClick={() => navigate(`/tasks/${entry.task_id}`)}
                              title="Ouvrir la tâche"
                            >
                              <td className="wkc-sheet-task">
                                <span className="wkc-sheet-title">{entry.task_title}</span>
                                {entry.path.length > 0 && (
                                  <span className="wkc-sheet-path">{entry.path.join(' › ')}</span>
                                )}
                              </td>
                              <td className="wkc-sheet-time">{clockTime(entry.start_time)}</td>
                              <td className="wkc-sheet-time">
                                {entry.running ? (
                                  <span className="wkc-running">en cours</span>
                                ) : (
                                  clockTime(entry.end_time)
                                )}
                              </td>
                              <td className="wkc-sheet-duration">{formatDurationShort(entry.duration_seconds)}</td>
                              {/* stopPropagation : la ligne entière ouvre la tâche, ces boutons non. */}
                              {!readOnly && (
                              <td className="wkc-sheet-actions" onClick={(e) => e.stopPropagation()}>
                                {/* Un chrono encore actif n'a pas de fin à corriger : on l'arrête
                                    d'abord depuis la tâche. */}
                                {!entry.running && (
                                  <button
                                    type="button"
                                    className="icon-link-btn wkc-sheet-action"
                                    onClick={() =>
                                      setEditingEntry({
                                        id: entry.id,
                                        start: toDatetimeLocal(entry.start_time),
                                        end: toDatetimeLocal(entry.end_time),
                                      })
                                    }
                                    aria-label="Corriger ce temps"
                                    title="Corriger les heures"
                                  >
                                    <IconPencil />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="icon-link-btn icon-link-btn--danger wkc-sheet-action"
                                  onClick={() => removeEntry(entry)}
                                  aria-label="Supprimer ce temps"
                                  title="Supprimer"
                                >
                                  <IconTrash />
                                </button>
                              </td>
                              )}
                            </tr>

                            {!readOnly && editingEntry?.id === entry.id && (
                              <tr className="wkc-sheet-edit-row">
                                {/* 5 colonnes : la ligne d'édition n'existe qu'en mode admin,
                                    où la colonne d'actions est présente. */}
                                <td colSpan={5}>
                                  <form className="wkc-sheet-edit" onSubmit={saveEntry}>
                                    <label>
                                      Début
                                      <input
                                        type="datetime-local"
                                        value={editingEntry.start}
                                        onChange={(e) =>
                                          setEditingEntry((c) => ({ ...c, start: e.target.value }))
                                        }
                                        required
                                      />
                                    </label>
                                    <label>
                                      Fin
                                      <input
                                        type="datetime-local"
                                        value={editingEntry.end}
                                        onChange={(e) =>
                                          setEditingEntry((c) => ({ ...c, end: e.target.value }))
                                        }
                                        required
                                      />
                                    </label>
                                    <div className="wkc-sheet-edit-actions">
                                      <button
                                        type="button"
                                        className="wkc-today-btn"
                                        onClick={() => setEditingEntry(null)}
                                      >
                                        Annuler
                                      </button>
                                      <button type="submit" className="btn-primary" disabled={savingEntry}>
                                        {savingEntry ? 'Enregistrement…' : 'Enregistrer'}
                                      </button>
                                    </div>
                                  </form>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
