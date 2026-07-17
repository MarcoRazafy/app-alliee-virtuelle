const taskModel = require('../models/task.model');
const statsModel = require('../models/stats.model');
const aiModel = require('../models/ai.model');
const mistral = require('../config/mistral');

function defaultRange() {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

// Contexte en lecture seule uniquement : aucune fonction d'écriture n'est exposée à l'assistant
async function buildContext() {
  const { from, to } = defaultRange();
  const [teamStats, realtime, lateTasks] = await Promise.all([
    statsModel.computeTeamStats(from, to),
    taskModel.computeRealtimeDashboard(),
    taskModel.findLateTasks(),
  ]);

  return {
    period_analysee: { from, to },
    statistiques_equipe: teamStats,
    suivi_temps_reel: realtime,
    taches_en_retard: lateTasks,
  };
}

const SYSTEM_PROMPT = `Tu es l'assistant IA de L'Alliée Virtuelle, un outil de suivi des tâches en équipe.

RÈGLES STRICTES (à respecter impérativement) :
- Tu es en LECTURE SEULE : tu ne peux jamais créer, modifier, confirmer, supprimer une tâche ou un utilisateur. Tu réponds seulement à des questions.
- N'invente JAMAIS de données. Si les données fournies ne permettent pas de répondre, dis explicitement :
  "Je n'ai pas assez de données pour répondre. Pouvez-vous préciser la période ou le projet ?"
- Une tâche "complétée" signifie toujours statut CONFIRMEE (jamais TERMINEE - ce sont deux indicateurs différents).
- Précise toujours la période analysée dans ta réponse.
- Réponds en français, de façon concise et factuelle, en te basant uniquement sur les données ci-dessous.

Données actuelles de l'équipe (JSON) :
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ask(req, res, next) {
  try {
    const { question, session_id: sessionId } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La question est requise' });
    }
    // Le front envoie l'id de la conversation en cours ; sinon le modèle en génère un.
    const validSessionId = sessionId && UUID_RE.test(sessionId) ? sessionId : null;

    const context = await buildContext();

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + JSON.stringify(context) },
      { role: 'user', content: question },
    ];

    const answer = await mistral.askMistral(messages);

    const conversation = await aiModel.createConversation({
      adminId: req.user.id,
      sessionId: validSessionId,
      question,
      answer,
      contextData: { period: context.period_analysee },
    });

    res.status(200).json(conversation);
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const conversations = await aiModel.findConversations(req.user.id, limit);
    res.status(200).json(conversations);
  } catch (err) {
    next(err);
  }
}

module.exports = { ask, getHistory };
