import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as aiService from '../../services/aiService';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { notifyError } from '../../utils/toast';
import '../../styles/admin-assistant.css';

const SUGGESTIONS = [
  'Qui a le plus de tâches confirmées ce mois-ci ?',
  'Combien de tâches sont en retard actuellement ?',
  "Quel employé a travaillé le plus d'heures cette semaine ?",
  "Résume l'activité de l'équipe sur les 7 derniers jours",
];

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------- Rendu Markdown léger (l'assistant renvoie du markdown : **gras**, listes…) ---------- */

function parseInline(text) {
  const nodes = [];
  const re = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|\*([^*]+?)\*|_([^_]+?)_)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4] != null) nodes.push(<code key={k++}>{m[4]}</code>);
    else if (m[5] != null) nodes.push(<em key={k++}>{m[5]}</em>);
    else if (m[6] != null) nodes.push(<em key={k++}>{m[6]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', lines: para });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.t !== 'ul') {
        flushList();
        list = { t: 'ul', items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (!list || list.t !== 'ol') {
        flushList();
        list = { t: 'ol', items: [] };
      }
      list.items.push(numbered[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  });
  flushPara();
  flushList();

  return (
    <div className="ai-md">
      {blocks.map((blk, i) => {
        if (blk.t === 'p') {
          return (
            <p key={i} className="ai-md-p">
              {blk.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {parseInline(l)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (blk.t === 'ul') {
          return (
            <ul key={i} className="ai-md-list">
              {blk.items.map((it, j) => (
                <li key={j}>{parseInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="ai-md-list">
            {blk.items.map((it, j) => (
              <li key={j}>{parseInline(it)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

/* ---------- Icônes ---------- */

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="2.4" r="1.1" fill="currentColor" />
      <rect x="4.5" y="6" width="15" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.6 11v3M21.4 11v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9" cy="12" r="1.35" fill="currentColor" />
      <circle cx="15" cy="12" r="1.35" fill="currentColor" />
      <path d="M9.5 15.4h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12 20 4l-4 16-4.5-6L4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m11.5 14 4.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ExchangeBubbles({ entry }) {
  return (
    <>
      <div className="ai-msg ai-msg--user">
        <div className="ai-bubble ai-bubble--user">{entry.question}</div>
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

function AdminAssistant() {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(() => newId());
  const messagesRef = useRef(null);

  function loadHistory() {
    return aiService
      .getAiHistory()
      .then(setHistory)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'historique"));
  }

  useEffect(() => {
    loadHistory();
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
      return { id, messages: sorted, title: sorted[0].question, lastAt: sorted[sorted.length - 1].created_at };
    });
    list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    return list;
  }, [history]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeMessages = activeSession ? activeSession.messages : [];
  const isEmpty = activeMessages.length === 0 && !loading;

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages.length, loading, activeSessionId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setPending(q);
    setQuestion('');
    try {
      await aiService.askAssistant(q, activeSessionId);
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
  }

  function handleSelectSession(id) {
    setActiveSessionId(id);
    setQuestion('');
  }

  return (
    <div className="ai-shell">
      <aside className="ai-sidebar">
        <button type="button" className="ai-new-btn ai-new-btn--block" onClick={handleNewConversation}>
          <PlusIcon />
          Nouvelle conversation
        </button>
        <div className="ai-sidebar-label">Historique</div>
        <div className="ai-session-list">
          {sessions.length === 0 && <p className="ai-session-empty">Aucune conversation pour le moment.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ai-session-item${s.id === activeSessionId ? ' ai-session-item--active' : ''}`}
              onClick={() => handleSelectSession(s.id)}
            >
              <span className="ai-session-icon">
                <RobotIcon />
              </span>
              <span className="ai-session-body">
                <span className="ai-session-title">{s.title}</span>
                <span className="ai-session-time">{formatRelativeTime(s.lastAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="ai-main">
        <header className="ai-header">
          <div className="ai-header-brand">
            <span className="ai-avatar ai-avatar--lg">
              <RobotIcon />
            </span>
            <div className="ai-header-copy">
              <h1>Assistant IA</h1>
              <p className="ai-status">
                <span className="ai-status-dot" />
                En ligne · <span className="ai-model">MISTRAL.AI</span>
              </p>
            </div>
          </div>
          <button type="button" className="ai-new-btn ai-main-new" onClick={handleNewConversation}>
            <PlusIcon />
            Nouveau
          </button>
        </header>

        <div className="ai-notice">
          <ShieldIcon />
          <span>
            Mode lecture seule — l'assistant analyse les données existantes mais ne peut jamais créer, modifier,
            confirmer ni supprimer quoi que ce soit.
          </span>
        </div>

        <div className="ai-messages" ref={messagesRef}>
          {isEmpty && (
            <div className="ai-empty">
              <span className="ai-avatar ai-avatar--xl">
                <RobotIcon />
              </span>
              <h2>Comment puis-je vous aider ?</h2>
              <p>Interrogez l'assistant sur l'activité, les tâches et les performances de votre équipe.</p>
              <div className="ai-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="ai-suggestion-chip" onClick={() => setQuestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
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
          <div className="ai-input-field">
            <span className="ai-input-glyph">
              <RobotIcon />
            </span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez votre question à l'assistant…"
              disabled={loading}
            />
          </div>
          <button type="submit" className="ai-send" disabled={loading || !question.trim()} aria-label="Envoyer">
            {loading ? <span className="ai-send-spinner" /> : <SendIcon />}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminAssistant;
