import { useEffect, useState } from 'react';
import * as aiService from '../../services/aiService';
import { formatDateTime } from '../../utils/formatters';
import { notifyError, notifySuccess } from '../../utils/toast';

function AdminAssistant() {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  // Sépare visuellement la conversation en cours de l'historique précédent,
  // sans mélanger les échanges entre eux
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  function loadHistory() {
    aiService
      .getAiHistory()
      .then(setHistory)
      .catch((err) => notifyError(err.response?.data?.error || "Impossible de charger l'historique"));
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    try {
      await aiService.askAssistant(question);
      setQuestion('');
      loadHistory();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'interroger l'assistant");
    } finally {
      setLoading(false);
    }
  }

  function handleNewMessage() {
    setSessionStartedAt(new Date().toISOString());
    setQuestion('');
    notifySuccess('Nouvelle conversation démarrée');
  }

  const currentSession = history.filter((entry) => entry.created_at >= sessionStartedAt);
  const previousSessions = history.filter((entry) => entry.created_at < sessionStartedAt);

  return (
    <div>
      <h1>Assistant IA</h1>
      <p>
        Assistant en lecture seule (Mistral.ai) : il analyse les données existantes mais ne peut jamais créer,
        modifier, confirmer ou supprimer une tâche ou un utilisateur.
      </p>

      <button onClick={handleNewMessage}>Nouveau message</button>

      <form onSubmit={handleSubmit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex : Qui a le plus de tâches confirmées ce mois-ci ?"
          style={{ width: '400px' }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? 'Réflexion en cours...' : 'Envoyer'}
        </button>
      </form>

      <h2>Conversation en cours</h2>
      {currentSession.length === 0 && <p>Posez une question pour commencer.</p>}
      <ul>
        {currentSession.map((entry) => (
          <li key={entry.id} style={{ marginBottom: '15px', borderBottom: '1px solid gray', paddingBottom: '10px' }}>
            <p>
              <strong>Q :</strong> {entry.question}
            </p>
            <p>
              <strong>R :</strong> {entry.answer}
            </p>
            <small>{formatDateTime(entry.created_at)}</small>
          </li>
        ))}
      </ul>

      {previousSessions.length > 0 && (
        <>
          <h2>Historique précédent</h2>
          <ul>
            {previousSessions.map((entry) => (
              <li key={entry.id} style={{ marginBottom: '15px', borderBottom: '1px solid gray', paddingBottom: '10px' }}>
                <p>
                  <strong>Q :</strong> {entry.question}
                </p>
                <p>
                  <strong>R :</strong> {entry.answer}
                </p>
                <small>{formatDateTime(entry.created_at)}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default AdminAssistant;
