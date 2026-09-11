import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as statsService from '../services/statsService';
import * as avatarService from '../services/avatarService';
import * as sessionService from '../services/sessionService';
import { formatDurationShort } from '../utils/formatters';
import { businessDayNow } from '../utils/businessDay';
import { notifyError, notifySuccess } from '../utils/toast';
import { IconChevronLeft, IconChevronRight, IconClock, IconPencil, IconTrash, IconX } from './icons';
import '../styles/weekly-connections.css';

// Feuille de temps hebdomadaire : une ligne par employé, une colonne par jour, façon ClickUp.
// Le serveur renvoie déjà les 7 dates de la semaine et le temps par jour ; ce composant ne
// fait que naviguer et mettre en forme.

// Décalage d'une date 'YYYY-MM-DD' en jours, sans passer par les fuseaux : construire un
// Date depuis la chaîne complète l'interpréterait en UTC et pourrait reculer d'un jour.
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

// « Lun. 7 sept. » — jour abrégé, pour tenir dans une colonne étroite.
function dayHeader(dateString) {
  const date = parseLocal(dateString);
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' });
  const rest = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), rest };
}

function rangeLabel(days) {
  if (!days || days.length === 0) return '';
  const first = parseLocal(days[0]);
  const last = parseLocal(days[days.length - 1]);
  const opts = { day: 'numeric', month: 'short' };
  const sameYear = first.getFullYear() === last.getFullYear();
  const end = last.toLocaleDateString('fr-FR', sameYear ? opts : { ...opts, year: 'numeric' });
  return `${first.toLocaleDateString('fr-FR', opts)} – ${end}`;
}

// Valeur attendue par un <input type="datetime-local"> : heure LOCALE, sans fuseau.
function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function clockDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Nom compact pour les écrans étroits : « Fahendrena Razafimamonjy » → « Fahendrena R. ».
// Couper simplement à l'ellipse donnerait « Fahendrena Razafi… », qui occupe la même place
// sans rien apprendre de plus ; l'initiale suffit à distinguer deux homonymes de prénom.
function shortName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name || '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function initialsOf(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

// Photo de profil, initiales en repli. Le blob est chargé une seule fois par personne et
// libéré au démontage : sans cela, changer de semaine fuirait un objectURL par employé.
function Avatar({ employee, url }) {
  if (url) return <img src={url} alt="" className="wkc-avatar wkc-avatar--img" />;
  return <span className="wkc-avatar">{initialsOf(employee.full_name) || '?'}</span>;
}

// `readOnly` : version employé — la grille se consulte, une cellule ne s'y corrige pas.
// Les routes de correction restent de toute façon réservées aux admins ; masquer l'action
// évite seulement d'en proposer une qui serait refusée.
export default function WeeklyConnectionsTable({ onOpenEmployee, readOnly = false }) {
  const [weekStart, setWeekStart] = useState(() => businessDayNow());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (dateInWeek) => {
    setLoading(true);
    try {
      // Le serveur ramène toujours au lundi de la semaine demandée : on peut donc lui
      // envoyer une date quelconque, y compris celle choisie dans le sélecteur.
      const result = await statsService.getWeeklyConnections(dateInWeek);
      setData(result);
      setWeekStart(result.week_start_date);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les temps de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(businessDayNow());
  }, [load]);

  // Photos de profil : une requête par personne, mémorisée d'une semaine à l'autre puisque
  // ce sont les mêmes employés. Les objectURL sont libérés au démontage du composant.
  const [avatarUrls, setAvatarUrls] = useState({});
  const fetchedRef = useRef(new Set());
  const urlsRef = useRef({});
  useEffect(() => {
    urlsRef.current = avatarUrls;
  }, [avatarUrls]);
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const need = (data?.employees || [])
      .filter((e) => e.has_avatar && !fetchedRef.current.has(e.id))
      .map((e) => e.id);
    if (need.length === 0) return;
    need.forEach((id) => fetchedRef.current.add(id));
    need.forEach(async (id) => {
      try {
        const blob = await avatarService.getUserAvatarBlob(id);
        const url = URL.createObjectURL(blob);
        if (mountedRef.current) setAvatarUrls((cur) => ({ ...cur, [id]: url }));
        else URL.revokeObjectURL(url);
      } catch {
        fetchedRef.current.delete(id); // autorise une nouvelle tentative
      }
    });
  }, [data]);

  const days = data?.days || [];
  const employees = data?.employees || [];
  const today = businessDayNow();

  // Correction d'une cellule : les sessions RÉELLES de cette personne ce jour-là. Une cellule
  // est une somme, pas un enregistrement — on corrige donc les sessions qui la composent,
  // plutôt que de laisser saisir un total qui ne correspondrait à rien en base.
  const [cell, setCell] = useState(null); // { employee, day }
  const [cellSessions, setCellSessions] = useState([]);
  const [cellLoading, setCellLoading] = useState(false);
  const [editingSession, setEditingSession] = useState(null); // { id, login, logout }
  const [savingSession, setSavingSession] = useState(false);

  const loadCellSessions = useCallback(async (employee, day) => {
    setCellLoading(true);
    try {
      // On part de la veille : une connexion de nuit commence le jour précédent et compte
      // pourtant sur cette journée de travail.
      const rows = await sessionService.getUserSessionsAdmin(employee.id, {
        start: shiftDate(day, -1),
        end: day,
      });
      setCellSessions(rows);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les sessions');
      setCellSessions([]);
    } finally {
      setCellLoading(false);
    }
  }, []);

  function openCell(employee, day) {
    setCell({ employee, day });
    setEditingSession(null);
    loadCellSessions(employee, day);
  }

  async function saveSession(event) {
    event.preventDefault();
    if (!editingSession || savingSession) return;
    setSavingSession(true);
    try {
      await sessionService.updateUserSessionAdmin(editingSession.id, {
        login_at: editingSession.login,
        logout_at: editingSession.logout || null,
      });
      setEditingSession(null);
      await Promise.all([loadCellSessions(cell.employee, cell.day), load(weekStart)]);
      notifySuccess('Temps de connexion corrigé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Correction impossible');
    } finally {
      setSavingSession(false);
    }
  }

  async function removeSession(session) {
    if (!window.confirm('Supprimer cette session de connexion ?\n\nLe temps correspondant sera retiré du total.')) return;
    try {
      await sessionService.deleteUserSessionAdmin(session.id);
      await Promise.all([loadCellSessions(cell.employee, cell.day), load(weekStart)]);
      notifySuccess('Session supprimée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Suppression impossible');
    }
  }

  // Total de l'équipe par jour : la ligne de pied donne la charge réelle de chaque journée.
  const dayTotals = useMemo(() => {
    const totals = {};
    days.forEach((day) => {
      totals[day] = employees.reduce((sum, e) => sum + (e.by_day?.[day] || 0), 0);
    });
    return totals;
  }, [days, employees]);

  const weekTotal = employees.reduce((sum, e) => sum + (e.total_seconds || 0), 0);
  const isCurrentWeek = days.includes(today);

  return (
    <section className="astat-panel wkc-panel">
      <header className="wkc-head">
        <div>
          <p className="astat-panel-eyebrow">Détail</p>
          <h2>{readOnly ? 'Mon temps de connexion' : 'Temps de connexion'}</h2>
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

          {/* Aller directement à n'importe quelle semaine : la date choisie n'a pas besoin
              d'être un lundi, le serveur ramène à la semaine qui la contient. */}
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
        </div>
      </header>

      <div className="wkc-scroll">
        <table className="wkc-table">
          <thead>
            <tr>
              <th className="wkc-th-name">
                {/* Côté employé la grille ne contient que lui : compter les « personnes »
                    n'aurait aucun sens. */}
                {employees.length === 1 ? 'Ma semaine' : `Personnes (${employees.length})`}
              </th>
              {days.map((day) => {
                const { weekday, rest } = dayHeader(day);
                return (
                  <th key={day} className={`wkc-th-day${day === today ? ' wkc-th-day--today' : ''}`}>
                    <span className="wkc-th-weekday">{weekday}</span>
                    <span className="wkc-th-date">{rest}</span>
                  </th>
                );
              })}
              <th className="wkc-th-total">Total</th>
            </tr>
          </thead>

          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={days.length + 2} className="wkc-empty">
                  {loading ? 'Chargement…' : 'Aucun employé actif.'}
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id}>
                  <th scope="row" className="wkc-td-name">
                    {/* Toute l'identité ouvre le relevé détaillé de la personne. */}
                    <button
                      type="button"
                      className="wkc-person-btn"
                      onClick={() => onOpenEmployee?.(employee, weekStart)}
                      title={`Voir le relevé de temps de ${employee.full_name}`}
                    >
                      <Avatar employee={employee} url={avatarUrls[employee.id]} />
                      {/* Les deux formes coexistent, la CSS choisit selon la largeur : un
                          basculement en JS demanderait d'écouter le redimensionnement pour
                          un simple détail d'affichage. La version courte est masquée aux
                          lecteurs d'écran, qui doivent entendre le nom entier. */}
                      <span className="wkc-name wkc-name--full">{employee.full_name}</span>
                      <span className="wkc-name wkc-name--short" aria-hidden="true">
                        {shortName(employee.full_name)}
                      </span>
                    </button>
                  </th>
                  {days.map((day) => {
                    const seconds = employee.by_day?.[day] || 0;
                    return (
                      <td
                        key={day}
                        className={`wkc-cell${seconds > 0 ? ' wkc-cell--filled' : ''}${
                          day === today ? ' wkc-cell--today' : ''
                        }`}
                      >
                        {readOnly ? (
                          seconds > 0 ? (
                            formatDurationShort(seconds)
                          ) : (
                            <span className="wkc-zero">0h</span>
                          )
                        ) : (
                          <button
                            type="button"
                            className="wkc-cell-btn"
                            onClick={() => openCell(employee, day)}
                            title={`Corriger le temps de connexion de ${employee.full_name}`}
                          >
                            {seconds > 0 ? formatDurationShort(seconds) : <span className="wkc-zero">0h</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="wkc-cell wkc-cell--total">
                    {employee.total_seconds > 0 ? (
                      formatDurationShort(employee.total_seconds)
                    ) : (
                      <span className="wkc-zero">0h</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* Le total d'équipe répéterait mot pour mot l'unique ligne : on l'omet. */}
          {employees.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row" className="wkc-td-name wkc-foot-label">
                  <IconClock /> Total équipe
                </th>
                {days.map((day) => (
                  <td key={day} className="wkc-cell wkc-foot-cell">
                    {dayTotals[day] > 0 ? formatDurationShort(dayTotals[day]) : <span className="wkc-zero">0h</span>}
                  </td>
                ))}
                <td className="wkc-cell wkc-foot-cell wkc-cell--total">
                  {weekTotal > 0 ? formatDurationShort(weekTotal) : <span className="wkc-zero">0h</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {cell &&
        createPortal(
          <div className="wkc-modal-overlay" role="dialog" aria-modal="true" onClick={() => setCell(null)}>
            <div className="wkc-modal" onClick={(e) => e.stopPropagation()}>
              <header className="wkc-modal-head">
                <div>
                  <p className="astat-panel-eyebrow">Temps de connexion</p>
                  <h3>
                    {cell.employee.full_name} — {dayHeader(cell.day).weekday} {dayHeader(cell.day).rest}
                  </h3>
                </div>
                <button
                  type="button"
                  className="wkc-nav-btn"
                  onClick={() => setCell(null)}
                  aria-label="Fermer"
                >
                  <IconX />
                </button>
              </header>

              <p className="wkc-modal-hint">
                Une cellule est la somme des sessions ci-dessous. Corrigez la session concernée
                plutôt qu'un total : une connexion de nuit peut commencer la veille.
              </p>

              {cellLoading ? (
                <p className="wkc-empty">Chargement…</p>
              ) : cellSessions.length === 0 ? (
                <p className="wkc-empty">Aucune session enregistrée autour de cette journée.</p>
              ) : (
                <ul className="wkc-session-list">
                  {cellSessions.map((session) => (
                    <li key={session.id} className="wkc-session">
                      {editingSession?.id === session.id ? (
                        <form className="wkc-sheet-edit" onSubmit={saveSession}>
                          <label>
                            Connexion
                            <input
                              type="datetime-local"
                              value={editingSession.login}
                              onChange={(e) => setEditingSession((c) => ({ ...c, login: e.target.value }))}
                              required
                            />
                          </label>
                          <label>
                            Déconnexion
                            <input
                              type="datetime-local"
                              value={editingSession.logout}
                              onChange={(e) => setEditingSession((c) => ({ ...c, logout: e.target.value }))}
                            />
                          </label>
                          <div className="wkc-sheet-edit-actions">
                            <button type="button" className="wkc-today-btn" onClick={() => setEditingSession(null)}>
                              Annuler
                            </button>
                            <button type="submit" className="btn-primary" disabled={savingSession}>
                              {savingSession ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <span className="wkc-session-range">
                            {clockDateTime(session.login_at)}
                            {' → '}
                            {session.is_open ? (
                              <span className="wkc-running">en cours</span>
                            ) : (
                              clockDateTime(session.logout_at)
                            )}
                          </span>
                          <span className="wkc-session-duration">
                            {formatDurationShort(session.duration_seconds || 0)}
                          </span>
                          <span className="wkc-session-actions">
                            <button
                              type="button"
                              className="icon-link-btn wkc-sheet-action"
                              onClick={() =>
                                setEditingSession({
                                  id: session.id,
                                  login: toDatetimeLocal(session.login_at),
                                  logout: toDatetimeLocal(session.logout_at),
                                })
                              }
                              aria-label="Corriger cette session"
                              title="Corriger les heures"
                            >
                              <IconPencil />
                            </button>
                            <button
                              type="button"
                              className="icon-link-btn icon-link-btn--danger wkc-sheet-action"
                              onClick={() => removeSession(session)}
                              aria-label="Supprimer cette session"
                              title="Supprimer"
                            >
                              <IconTrash />
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
