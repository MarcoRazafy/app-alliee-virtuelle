import { useEffect, useMemo, useRef, useState } from 'react';
import * as aiService from '../../services/aiService';
import * as statsService from '../../services/statsService';
import * as taskService from '../../services/taskService';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { notifyError, notifySuccess } from '../../utils/toast';
import { IconUsers, IconClock, IconUser, IconBarChart, IconCheckCircle, IconAlert, IconSearch, IconMenu, IconX } from '../../components/icons';
import Markdown from '../../components/Markdown';
import {
  RobotIcon, ChatDotIcon, ArrowRightMini, SendIcon, ShieldIcon, PlusIcon, PencilIcon,
  TrashIcon, PaperclipIcon, ImageIcon, MicIcon, XIcon, DownloadIcon, Sparkline,
} from './adminAssistantIcons';
import { newId, isImageType, weekRange } from './adminAssistantHelpers';
import '../../styles/admin-assistant.css';

// Suggestions avec icône (cartes cliquables sur l'écran d'accueil).
const SUGGESTIONS = [
  { icon: IconUsers, text: 'Qui a le plus de tâches confirmées ce mois-ci ?' },
  { icon: IconClock, text: 'Combien de tâches sont en retard actuellement ?' },
  { icon: IconUser, text: "Quel employé a travaillé le plus d'heures cette semaine ?" },
  { icon: IconBarChart, text: "Résume l'activité de l'équipe sur les 7 derniers jours" },
];

function AdminAssistant() {
  const [history, setHistory] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false); // tiroir d'historique (mobile)
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(() => newId());
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [recognizing, setRecognizing] = useState(false);

  const messagesRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const attachmentFetchedRef = useRef(new Set());

  function loadHistory() {
    return aiService
      .getAiHistory()
      .then(setHistory)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'historique"));
  }

  useEffect(() => {
    loadHistory();
  }, []);

  // KPI de l'écran d'accueil : semaine courante vs semaine précédente.
  useEffect(() => {
    const cur = weekRange(0);
    const prev = weekRange(1);
    Promise.all([
      statsService.getTeamStats(cur.from, cur.to),
      statsService.getTeamStats(prev.from, prev.to),
      taskService.getLateTasks().catch(() => []),
    ])
      .then(([curStats, prevStats, late]) => {
        const hours = (s) => Math.round((s.by_day || []).reduce((a, d) => a + (d.hours_worked_seconds || 0), 0) / 3600);
        const sumLate = (s) => (s.by_employee || []).reduce((a, e) => a + (e.late || 0), 0);
        const pct = (c, p) => (p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0);
        setKpis({
          confirmed: {
            value: curStats.summary.tasks_confirmed,
            delta: pct(curStats.summary.tasks_confirmed, prevStats.summary.tasks_confirmed),
            spark: (curStats.by_day || []).map((d) => d.tasks_confirmed || 0),
          },
          late: { value: late.length, delta: pct(sumLate(curStats), sumLate(prevStats)), spark: null },
          hours: { value: hours(curStats), delta: pct(hours(curStats), hours(prevStats)), spark: (curStats.by_day || []).map((d) => Math.round((d.hours_worked_seconds || 0) / 3600)) },
        });
      })
      .catch(() => {});
  }, []);

  // Regroupe les échanges à plat en conversations (par session_id)
  const sessions = useMemo(() => {
    const map = new Map();
    history.forEach((row) => {
      const sid = row.session_id || row.id;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(row);
    });
    const list = [...map.entries()].map(([id, rows]) => {
      const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const titled = sorted.find((r) => r.title);
      const last = sorted[sorted.length - 1];
      // Sous-titre = aperçu de la dernière réponse (1re ligne, sans markdown).
      const preview = (last.answer || last.question || '').replace(/[*_`#>-]/g, '').split('\n').find((l) => l.trim()) || '';
      return {
        id,
        messages: sorted,
        title: titled?.title || sorted[0].question,
        subtitle: preview.trim().slice(0, 42),
        lastAt: last.created_at,
      };
    });
    list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    return list;
  }, [history]);

  const filteredSessions = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.subtitle || '').toLowerCase().includes(q) ||
        s.messages.some((m) => (m.question || '').toLowerCase().includes(q) || (m.answer || '').toLowerCase().includes(q))
    );
  }, [sessions, sidebarSearch]);
  const visibleSessions = showAllSessions ? filteredSessions : filteredSessions.slice(0, 8);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeMessages = activeSession ? activeSession.messages : [];
  const isEmpty = activeMessages.length === 0 && !loading;

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages.length, loading, activeSessionId]);

  // Récupère les blobs des pièces jointes image (sans annulation : voir messagerie).
  useEffect(() => {
    activeMessages
      .filter((m) => m.has_attachment && isImageType(m.attachment_type) && !attachmentFetchedRef.current.has(m.id))
      .forEach(async (m) => {
        attachmentFetchedRef.current.add(m.id);
        try {
          const url = URL.createObjectURL(await aiService.getConversationAttachmentBlob(m.id));
          setAttachmentUrls((current) => ({ ...current, [m.id]: url }));
        } catch {
          attachmentFetchedRef.current.delete(m.id);
        }
      });
  }, [activeMessages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if ((!q && !pendingFile) || loading) return;
    setLoading(true);
    setPending(q || (pendingFile ? `📎 ${pendingFile.name}` : ''));
    const fileToSend = pendingFile;
    setQuestion('');
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = '';
    try {
      await aiService.askAssistant(q || 'Analyse ce fichier.', activeSessionId, fileToSend);
      await loadHistory();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'interroger l'assistant");
      setQuestion(q);
    } finally {
      setLoading(false);
      setPending(null);
    }
  }

  function handleNewConversation() {
    setActiveSessionId(newId());
    setQuestion('');
    setPending(null);
    setPendingFile(null);
    setSidebarOpen(false);
  }

  function handleSelectSession(id) {
    setActiveSessionId(id);
    setQuestion('');
    setEditingId(null);
    setSidebarOpen(false);
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditText(entry.question);
  }
  async function saveEdit(id) {
    const q = editText.trim();
    if (!q) return;
    setEditingId(null);
    setLoading(true);
    setPending(q);
    try {
      await aiService.editConversation(id, q);
      await loadHistory();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de modifier le message');
    } finally {
      setLoading(false);
      setPending(null);
    }
  }
  async function handleDeleteExchange(id) {
    if (!window.confirm('Supprimer cet échange ?')) return;
    try {
      await aiService.deleteConversation(id);
      await loadHistory();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer');
    }
  }

  function startRename(session, e) {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameText(session.title);
  }
  async function saveRename(id) {
    const title = renameText.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      await aiService.renameSession(id, title);
      await loadHistory();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de renommer');
    }
  }
  async function handleDeleteSession(id, e) {
    e.stopPropagation();
    if (!window.confirm('Supprimer toute cette discussion ?')) return;
    try {
      await aiService.deleteSession(id);
      if (id === activeSessionId) setActiveSessionId(newId());
      await loadHistory();
      notifySuccess('Discussion supprimée');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer la discussion');
    }
  }

  async function downloadAttachment(entry) {
    try {
      const blob = await aiService.getConversationAttachmentBlob(entry.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.attachment_name || 'piece-jointe';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyError('Impossible de télécharger la pièce jointe');
    }
  }

  function pickFile(imagesOnly) {
    if (!fileRef.current) return;
    fileRef.current.setAttribute('accept', imagesOnly ? 'image/png,image/jpeg' : 'image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx');
    fileRef.current.click();
  }

  // Dictée vocale (Web Speech API — écrit dans le champ).
  function toggleDictation() {
    if (recognizing) {
      recognitionRef.current?.stop();
      setRecognizing(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notifyError("La dictée vocale n'est pas supportée par ce navigateur");
      return;
    }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = question ? question + ' ' : '';
    rec.onresult = (event) => {
      let txt = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) txt += event.results[i][0].transcript;
      setQuestion(base + txt);
    };
    rec.onend = () => setRecognizing(false);
    rec.onerror = () => setRecognizing(false);
    recognitionRef.current = rec;
    setRecognizing(true);
    rec.start();
  }

  function renderAttachment(entry) {
    if (!entry.has_attachment) return null;
    if (isImageType(entry.attachment_type)) {
      return attachmentUrls[entry.id] ? (
        <a href={attachmentUrls[entry.id]} target="_blank" rel="noreferrer" className="ai-attach-image">
          <img src={attachmentUrls[entry.id]} alt={entry.attachment_name || ''} />
        </a>
      ) : (
        <div className="ai-attach-loading"><ImageIcon /> Chargement…</div>
      );
    }
    return (
      <button type="button" className="ai-attach-file" onClick={() => downloadAttachment(entry)}>
        <PaperclipIcon />
        <span className="ai-attach-name">{entry.attachment_name}</span>
        <DownloadIcon />
      </button>
    );
  }

  function ExchangeBubbles({ entry }) {
    const isEditing = editingId === entry.id;
    return (
      <>
        <div className="ai-msg ai-msg--user">
          <div className="ai-user-wrap">
            {isEditing ? (
              <div className="ai-edit">
                <textarea value={editText} onChange={(ev) => setEditText(ev.target.value)} rows={2} autoFocus />
                <div className="ai-edit-actions">
                  <button type="button" className="ai-edit-cancel" onClick={() => setEditingId(null)}>Annuler</button>
                  <button type="button" className="ai-edit-save" onClick={() => saveEdit(entry.id)} disabled={!editText.trim()}>
                    Regénérer
                  </button>
                </div>
              </div>
            ) : (
              <div className="ai-bubble ai-bubble--user">
                {renderAttachment(entry)}
                {entry.question && <span>{entry.question}</span>}
              </div>
            )}
            {!isEditing && (
              <div className="ai-msg-actions">
                <button type="button" onClick={() => startEdit(entry)} title="Modifier" aria-label="Modifier"><PencilIcon /></button>
                <button type="button" onClick={() => handleDeleteExchange(entry.id)} title="Supprimer" aria-label="Supprimer"><TrashIcon /></button>
              </div>
            )}
          </div>
        </div>
        <div className="ai-msg ai-msg--bot">
          <span className="ai-msg-avatar">
            <RobotIcon />
          </span>
          <div className="ai-bubble ai-bubble--bot">
            <Markdown text={entry.answer} />
            <span className="ai-bubble-time">{formatDateTime(entry.created_at)}</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="ai-shell">
      {sidebarOpen && <div className="ai-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`ai-sidebar${sidebarOpen ? ' ai-sidebar--open' : ''}`}>
        <button
          type="button"
          className="ai-sidebar-close"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer l'historique"
        >
          <IconX />
        </button>
        <button type="button" className="ai-new-btn ai-new-btn--block" onClick={handleNewConversation}>
          <PlusIcon />
          Nouvelle conversation
        </button>
        <label className="ai-search">
          <IconSearch />
          <input
            type="search"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Rechercher une conversation"
            aria-label="Rechercher une conversation"
          />
        </label>
        <div className="ai-sidebar-label">Historique</div>
        <div className="ai-session-list">
          {sessions.length === 0 && <p className="ai-session-empty">Aucune conversation pour le moment.</p>}
          {sessions.length > 0 && filteredSessions.length === 0 && (
            <p className="ai-session-empty">Aucun résultat pour « {sidebarSearch} ».</p>
          )}
          {visibleSessions.map((s) => (
            <div
              key={s.id}
              className={`ai-session-item${s.id === activeSessionId ? ' ai-session-item--active' : ''}`}
              onClick={() => handleSelectSession(s.id)}
              role="button"
              tabIndex={0}
            >
              <span className="ai-session-icon">
                <ChatDotIcon />
              </span>
              <span className="ai-session-body">
                {renamingId === s.id ? (
                  <input
                    className="ai-session-rename"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(s.id); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={() => saveRename(s.id)}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="ai-session-row">
                      <span className="ai-session-title">{s.title}</span>
                      <span className="ai-session-time">{formatRelativeTime(s.lastAt)}</span>
                    </span>
                    {s.subtitle && <span className="ai-session-sub">{s.subtitle}</span>}
                  </>
                )}
              </span>
              <span className="ai-session-tools">
                <button type="button" onClick={(e) => startRename(s, e)} title="Renommer" aria-label="Renommer"><PencilIcon /></button>
                <button type="button" onClick={(e) => handleDeleteSession(s.id, e)} title="Supprimer" aria-label="Supprimer"><TrashIcon /></button>
              </span>
            </div>
          ))}
        </div>
        {filteredSessions.length > 8 && (
          <button type="button" className="ai-see-all" onClick={() => setShowAllSessions((v) => !v)}>
            {showAllSessions ? 'Réduire' : 'Voir toutes les conversations'}
          </button>
        )}
      </aside>

      <div className="ai-main">
        <header className="ai-header">
          <button
            type="button"
            className="ai-history-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir l'historique des conversations"
            title="Historique des conversations"
          >
            <IconMenu />
          </button>
          <div className="ai-header-brand">
            <span className="ai-agent ai-agent--mini" aria-hidden="true">
              <img src="/agentIAImage-removebg-preview.png" alt="" className="ai-agent-robot" />
            </span>
            <div className="ai-header-copy">
              <h1>Assistant IA</h1>
              <p className="ai-subtitle">Analyse et recommandations opérationnelles</p>
            </div>
          </div>
          <div className="ai-header-pills">
            <span className="ai-pill ai-pill--online">
              <span className="ai-status-dot" /> En ligne
            </span>
            <span className="ai-pill ai-pill--model">
              <RobotIcon /> MISTRAL AI
            </span>
            <button type="button" className="ai-new-btn ai-main-new" onClick={handleNewConversation}>
              <PlusIcon />
              Nouveau
            </button>
          </div>
        </header>

        <div className="ai-notice">
          <ShieldIcon />
          <span>
            <strong>Mode lecture seule</strong> — l'assistant analyse les données existantes sans modifier les
            informations.
          </span>
        </div>

        <div className="ai-messages" ref={messagesRef}>
          {isEmpty && (
            <div className="ai-welcome">
              <div className="ai-hero">
                <span className="ai-hero-decor" aria-hidden="true" />
                <span className="ai-agent ai-agent--hero" aria-hidden="true">
                  <img src="/agentIAImage-removebg-preview.png" alt="" className="ai-agent-robot" />
                </span>
                <h2>Comment puis-je vous aider ?</h2>
                <p>Interrogez l'assistant sur l'activité, les tâches, les retards et les performances de votre équipe.</p>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button key={s.text} type="button" className="ai-suggestion-card" onClick={() => setQuestion(s.text)}>
                        <span className="ai-suggestion-icon"><Icon /></span>
                        <span className="ai-suggestion-text">{s.text}</span>
                        <span className="ai-suggestion-arrow"><ArrowRightMini /></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {kpis && (
                <div className="ai-kpis">
                  <div className="ai-kpi">
                    <span className="ai-kpi-icon ai-kpi-icon--ok"><IconCheckCircle /></span>
                    <div className="ai-kpi-body">
                      <span className="ai-kpi-label">Tâches confirmées</span>
                      <span className="ai-kpi-value">{kpis.confirmed.value}</span>
                      <span className={`ai-kpi-delta${kpis.confirmed.delta >= 0 ? ' up' : ' down'}`}>
                        {kpis.confirmed.delta >= 0 ? '+' : ''}{kpis.confirmed.delta}% vs la semaine dernière
                      </span>
                    </div>
                    <Sparkline points={kpis.confirmed.spark} color="var(--color-success)" />
                  </div>

                  <div className="ai-kpi">
                    <span className="ai-kpi-icon ai-kpi-icon--warn"><IconAlert /></span>
                    <div className="ai-kpi-body">
                      <span className="ai-kpi-label">Retards</span>
                      <span className="ai-kpi-value">{kpis.late.value}</span>
                      <span className={`ai-kpi-delta${kpis.late.delta <= 0 ? ' up' : ' down'}`}>
                        {kpis.late.delta >= 0 ? '+' : ''}{kpis.late.delta}% vs la semaine dernière
                      </span>
                    </div>
                    <Sparkline points={kpis.confirmed.spark?.map(() => kpis.late.value)} color="var(--color-warning)" />
                  </div>

                  <div className="ai-kpi">
                    <span className="ai-kpi-icon ai-kpi-icon--time"><IconClock /></span>
                    <div className="ai-kpi-body">
                      <span className="ai-kpi-label">Heures cette semaine</span>
                      <span className="ai-kpi-value">{kpis.hours.value} h</span>
                      <span className={`ai-kpi-delta${kpis.hours.delta >= 0 ? ' up' : ' down'}`}>
                        {kpis.hours.delta >= 0 ? '+' : ''}{kpis.hours.delta}% vs la semaine dernière
                      </span>
                    </div>
                    <Sparkline points={kpis.hours.spark} color="var(--color-accent)" />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeMessages.map((entry) => (
            <ExchangeBubbles key={entry.id} entry={entry} />
          ))}

          {loading && (
            <>
              {pending && (
                <div className="ai-msg ai-msg--user">
                  <div className="ai-bubble ai-bubble--user">{pending}</div>
                </div>
              )}
              <div className="ai-msg ai-msg--bot">
                <span className="ai-msg-avatar ai-msg-avatar--live">
                  <RobotIcon />
                </span>
                <div className="ai-bubble ai-bubble--bot ai-typing">
                  <span className="ai-typing-label">Analyse des données</span>
                  <span className="ai-typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <form className="ai-input-bar" onSubmit={handleSubmit}>
          {pendingFile && (
            <div className="ai-input-file">
              {isImageType(pendingFile.type) ? <ImageIcon /> : <PaperclipIcon />}
              <span className="ai-input-file-name">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Retirer">
                <XIcon />
              </button>
            </div>
          )}
          <div className="ai-input-row">
            <input ref={fileRef} type="file" hidden onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
            <button type="button" className="ai-input-icon" onClick={() => pickFile(false)} disabled={loading} title="Pièce jointe" aria-label="Pièce jointe"><PaperclipIcon /></button>
            <button type="button" className="ai-input-icon" onClick={() => pickFile(true)} disabled={loading} title="Photo" aria-label="Photo"><ImageIcon /></button>
            <button type="button" className={`ai-input-icon${recognizing ? ' ai-input-icon--rec' : ''}`} onClick={toggleDictation} disabled={loading} title="Dicter" aria-label="Dicter"><MicIcon /></button>
            <div className="ai-input-field">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={recognizing ? 'Parlez…' : "Posez votre question à l'assistant…"}
                disabled={loading}
              />
            </div>
            <button type="submit" className="ai-send" disabled={loading || (!question.trim() && !pendingFile)} aria-label="Envoyer">
              {loading ? <span className="ai-send-spinner" /> : <SendIcon />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminAssistant;
