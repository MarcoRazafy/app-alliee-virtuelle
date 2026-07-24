import { useEffect, useMemo, useRef, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import { IconChat, IconCheckCircle, IconClock, IconSend } from '../components/icons';
import Markdown from '../components/Markdown';
import * as aiService from '../services/aiService';
import { formatRelativeTime } from '../utils/formatters';
import { notifyError } from '../utils/toast';
import '../styles/employee-assistant.css';

const SUGGESTIONS = [
  'Quelles sont mes tâches les plus urgentes ?',
  'Résume ma progression de cette semaine.',
  'Quelles tâches attendent une confirmation ?',
];

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function EmployeeAssistant() {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(createSessionId);
  const endRef = useRef(null);

  useEffect(() => {
    aiService
      .getAiHistory(40)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const sessionMessages = useMemo(
    () => history.filter((item) => item.session_id === sessionId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [history, sessionId]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [sessionMessages, loading]);

  async function submit(event, suggestedQuestion = null) {
    event?.preventDefault();
    const text = (suggestedQuestion || question).trim();
    if (!text || loading) return;
    setQuestion('');
    setLoading(true);
    try {
      const response = await aiService.askAssistant(text, sessionId);
      setHistory((current) => [response, ...current]);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Le chatbot ne peut pas répondre pour le moment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <EmployeeLayout
      title="Chatbot"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Chatbot' }]}
      subtitle="Assistant personnel en lecture seule"
    >
      <section className="employee-ai" aria-label="Chatbot personnel">
        <header className="employee-ai-hero">
          <span className="employee-ai-hero-icon employee-ai-hero-icon--robot">
            <img src="/agentIAImage-removebg-preview.png" alt="" className="employee-ai-robot" />
          </span>
          <div>
            <h2>Comment puis-je vous aider ?</h2>
            <p>Je peux analyser vos tâches et vos statistiques, sans accéder aux données privées de vos collègues.</p>
          </div>
        </header>

        {sessionMessages.length === 0 && (
          <div className="employee-ai-suggestions">
            {SUGGESTIONS.map((suggestion, index) => {
              const SuggestionIcon = index === 0 ? IconClock : index === 1 ? IconCheckCircle : IconChat;
              return (
                <button key={suggestion} type="button" onClick={(event) => submit(event, suggestion)}>
                  <SuggestionIcon />
                  <span>{suggestion}</span>
                </button>
              );
            })}
          </div>
        )}

        {sessionMessages.length > 0 && (
          <div className="employee-ai-thread" aria-live="polite">
            {sessionMessages.map((message) => (
              <article key={message.id} className="employee-ai-exchange">
                <div className="employee-ai-bubble employee-ai-bubble--user">{message.question}</div>
                <div className="employee-ai-bubble employee-ai-bubble--assistant">
                  <span className="employee-ai-mini-icon employee-ai-mini-icon--robot">
                    <img src="/agentIAImage-removebg-preview.png" alt="" className="employee-ai-robot" />
                  </span>
                  <div>
                    <Markdown text={message.answer} className="ai-md employee-ai-md" />
                    <time dateTime={message.created_at}>{formatRelativeTime(message.created_at)}</time>
                  </div>
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {loading && (
          <div className="employee-ai-thinking" role="status">
            <span />
            <span />
            <span />
            Analyse de vos données…
          </div>
        )}

        <form className="employee-ai-composer" onSubmit={submit}>
          <label htmlFor="employee-ai-question">Votre question</label>
          <div>
            <textarea
              id="employee-ai-question"
              rows="2"
              maxLength="1200"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ex. Quelle tâche dois-je traiter en premier ?"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !question.trim()} aria-label="Envoyer la question">
              <IconSend />
            </button>
          </div>
          <p>Le chatbot consulte uniquement vos données et ne réalise aucune modification.</p>
        </form>
      </section>
    </EmployeeLayout>
  );
}

export default EmployeeAssistant;
