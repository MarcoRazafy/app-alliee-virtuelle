import { useCallback, useEffect, useState } from 'react';
import * as taskService from '../../services/taskService';
import * as avatarService from '../../services/avatarService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconBell, IconCheckCircle, IconX, IconClock } from '../../components/icons';
import '../../styles/admin.css';

const PRIORITY_LABEL = { URGENT: 'Urgent', HAUTE: 'Haute', NORMALE: 'Normale', FAIBLE: 'Faible' };

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

function Avatar({ userId, name, hasAvatar }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    if (hasAvatar) {
      avatarService
        .getUserAvatarBlob(userId)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        })
        .catch(() => setUrl(null));
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [userId, hasAvatar]);

  if (url) return <img src={url} alt={name} className="atr-avatar atr-avatar--img" />;
  return <span className="atr-avatar">{initials(name)}</span>;
}

function formatDeadline(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function AdminTaskRequests() {
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(
    () =>
      taskService
        .getExtraTaskRequests()
        .then(setRequests)
        .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les demandes')),
    []
  );

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  const pending = requests.filter((r) => r.status === 'PENDING');
  const treated = requests.filter((r) => r.status !== 'PENDING').slice(0, 20);

  async function approve(id) {
    setBusyId(id);
    try {
      await taskService.approveExtraTaskRequest(id);
      notifySuccess("Demande approuvée — la tâche a été ajoutée à la journée de l'employé");
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'approuver la demande");
    } finally {
      setBusyId(null);
    }
  }

  function startReject(id) {
    setRejectingId(id);
    setRejectNote('');
  }

  async function confirmReject(id) {
    setBusyId(id);
    try {
      await taskService.rejectExtraTaskRequest(id, rejectNote.trim() || undefined);
      notifySuccess('Demande refusée');
      setRejectingId(null);
      setRejectNote('');
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de refuser la demande');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="atr-page">
      <div className="atr-summary">
        <span className="atr-summary-icon">
          <IconBell />
        </span>
        <div className="atr-summary-copy">
          <strong>
            {pending.length} demande{pending.length > 1 ? 's' : ''} en attente
          </strong>
          <span>Tâches supplémentaires demandées par les employés après validation de leur journée.</span>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="atr-empty">
          <IconCheckCircle />
          <p>Aucune demande en attente.</p>
        </div>
      ) : (
        <div className="atr-list">
          {pending.map((r) => {
            const deadline = formatDeadline(r.deadline);
            const isRejecting = rejectingId === r.id;
            return (
              <div key={r.id} className="atr-card">
                <Avatar userId={r.user_id} name={r.full_name} hasAvatar={r.has_avatar} />
                <div className="atr-body">
                  <div className="atr-line">
                    <span className="atr-name">{r.full_name}</span>
                    {r.position && <span className="atr-position">{r.position}</span>}
                    <span className="atr-time">{formatTime(r.created_at)}</span>
                  </div>
                  <div className="atr-task">
                    <span className={`atr-prio atr-prio--${(r.priority || 'NORMALE').toLowerCase()}`}>
                      {PRIORITY_LABEL[r.priority] || r.priority}
                    </span>
                    <span className="atr-task-title">{r.title}</span>
                    {r.list_name && <span className="atr-list-name">{r.list_name}</span>}
                    {deadline && (
                      <span className="atr-deadline">
                        <IconClock /> {deadline}
                      </span>
                    )}
                  </div>
                  {r.message && <p className="atr-message">« {r.message} »</p>}

                  {isRejecting ? (
                    <div className="atr-reject">
                      <textarea
                        className="atr-reject-input"
                        rows={2}
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Motif du refus (facultatif)"
                        autoFocus
                      />
                      <div className="atr-actions">
                        <button type="button" className="btn-outline" onClick={() => setRejectingId(null)}>
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="atr-btn atr-btn--reject"
                          disabled={busyId === r.id}
                          onClick={() => confirmReject(r.id)}
                        >
                          Confirmer le refus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="atr-actions">
                      <button
                        type="button"
                        className="atr-btn atr-btn--reject"
                        disabled={busyId === r.id}
                        onClick={() => startReject(r.id)}
                      >
                        <IconX /> Refuser
                      </button>
                      <button
                        type="button"
                        className="atr-btn atr-btn--approve"
                        disabled={busyId === r.id}
                        onClick={() => approve(r.id)}
                      >
                        <IconCheckCircle /> Approuver
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {treated.length > 0 && (
        <div className="atr-history">
          <p className="atr-history-title">Traitées récemment</p>
          {treated.map((r) => (
            <div key={r.id} className="atr-history-row">
              <span className={`atr-status-dot atr-status-dot--${r.status.toLowerCase()}`} />
              <span className="atr-history-name">{r.full_name}</span>
              <span className="atr-history-task">{r.title}</span>
              <span className={`atr-history-status atr-history-status--${r.status.toLowerCase()}`}>
                {r.status === 'APPROVED' ? 'Approuvée' : 'Refusée'}
              </span>
              <span className="atr-time">{formatTime(r.reviewed_at || r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminTaskRequests;
