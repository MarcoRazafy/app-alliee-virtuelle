const { DateTime } = require('luxon');
const taskModel = require('../models/task.model');
const statsModel = require('../models/stats.model');
const aiModel = require('../models/ai.model');
const userModel = require('../models/user.model');
const planningModel = require('../models/planning.model');
const planningDates = require('../utils/planningDates');
const mistral = require('../config/mistral');

const TASK_STATUSES = ['DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'];
const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Nom du jour de la semaine (français) à partir d'une date 'YYYY-MM-DD', sans dépendre du fuseau serveur.
function weekdayFr(dateString) {
  const dt = DateTime.fromISO(dateString);
  return dt.isValid ? WEEKDAYS_FR[dt.weekday - 1] : null;
}

function defaultRange() {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

// Agrège les tâches par employé et par statut (comptes compacts, pas de dump brut).
function summarizeTasksByEmployee(tasks, nameById) {
  const agg = new Map();
  for (const task of tasks) {
    const key = task.assigned_to || 'non_assigne';
    if (!agg.has(key)) {
      const row = { employe: nameById.get(task.assigned_to) || 'Non assigné', total: 0 };
      TASK_STATUSES.forEach((s) => {
        row[s] = 0;
      });
      agg.set(key, row);
    }
    const row = agg.get(key);
    row.total += 1;
    if (row[task.status] !== undefined) row[task.status] += 1;
  }
  return [...agg.values()].sort((a, b) => b.total - a.total);
}

const toDateString = planningDates.formatDbDate;

// Fusionne le résumé hebdo (statut, heures, soumis) avec le détail jour par jour
// (disponibilité + créneaux), regroupé par employé.
function mergePlanningWeek(weekRows, dayRows) {
  const byName = new Map();
  for (const r of weekRows) {
    byName.set(r.full_name, {
      employe: r.full_name,
      poste: r.position || null,
      statut: r.status,
      soumis: !!r.submitted_at,
      heures_declarees: Math.round(Number(r.total_hours || 0) * 100) / 100,
      jours: [],
    });
  }
  for (const d of dayRows) {
    const dateStr = toDateString(d.planning_date);
    let entry = byName.get(d.full_name);
    if (!entry) {
      entry = { employe: d.full_name, jours: [] };
      byName.set(d.full_name, entry);
    }
    entry.jours.push({
      jour: weekdayFr(dateStr),
      date: dateStr,
      disponibilite: d.availability_status,
      creneaux: d.creneaux || [],
    });
  }
  for (const entry of byName.values()) {
    entry.jours.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...byName.values()];
}

// Contexte en LECTURE SEULE : instantané enrichi de la base (équipe, tâches, plannings).
// Aucune fonction d'écriture n'est exposée à l'assistant.
async function buildContext() {
  const { from, to } = defaultRange();
  const now = planningDates.nowInPlanningZone();
  const currentWeekStart = planningDates.formatDate(planningDates.getCurrentWeekStart(now));
  const nextWeekStart = planningDates.formatDate(planningDates.getNextWeekStart(now));

  const [
    teamStats,
    realtime,
    lateTasks,
    employees,
    allTasks,
    currentPlannings,
    nextPlannings,
    currentDays,
    nextDays,
  ] = await Promise.all([
    statsModel.computeTeamStats(from, to),
    taskModel.computeRealtimeDashboard(),
    taskModel.findLateTasks(),
    userModel.findAllFiltered({ role: 'EMPLOYEE', status: 'ACTIF' }),
    taskModel.findAllTasks({}),
    planningModel.listPlanningsForAdmin({ weekStartDate: currentWeekStart }),
    planningModel.listPlanningsForAdmin({ weekStartDate: nextWeekStart }),
    planningModel.listDayAvailabilityForWeek(currentWeekStart),
    planningModel.listDayAvailabilityForWeek(nextWeekStart),
  ]);

  const nameById = new Map(employees.map((e) => [e.id, e.full_name]));

  return {
    date_du_jour: planningDates.formatDate(now),
    period_analysee: { from, to },
    statistiques_equipe: teamStats,
    suivi_temps_reel: realtime,
    taches_en_retard: lateTasks,
    equipe: employees.map((e) => ({ nom: e.full_name, poste: e.position || null, statut: e.status })),
    effectif_actif: employees.length,
    taches_par_employe: summarizeTasksByEmployee(allTasks, nameById),
    plannings_semaine_courante: {
      semaine_du: currentWeekStart,
      employes: mergePlanningWeek(currentPlannings, currentDays),
    },
    plannings_semaine_prochaine: {
      semaine_du: nextWeekStart,
      employes: mergePlanningWeek(nextPlannings, nextDays),
    },
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

Le JSON ci-dessous est un instantané en lecture seule de la base de données. Il contient :
- "equipe" et "effectif_actif" : la liste des employés actifs (nom, poste).
- "taches_par_employe" : pour chaque employé, le nombre total de tâches et la répartition par statut (DECLAREE, EN_COURS, TERMINEE, CONFIRMEE).
- "plannings_semaine_courante" et "plannings_semaine_prochaine" : pour chaque employé, le statut du planning, les heures déclarées, s'il est soumis, ET le détail "jours" (un objet par jour avec "jour" en français ex "samedi", "date", "disponibilite" et "creneaux" horaires).
- "statistiques_equipe", "suivi_temps_reel", "taches_en_retard" : indicateurs agrégés.
Statuts de planning : DRAFT (brouillon), SUBMITTED (soumis), ADMIN_MODIFIED (modifié par un admin), LOCKED, NOT_SUBMITTED.
Disponibilité d'un jour : AVAILABLE (disponible), PARTIALLY_AVAILABLE (partiellement), UNAVAILABLE (indisponible), LEAVE (congé), SICK (maladie). Un employé "travaille" un jour si sa disponibilité est AVAILABLE ou PARTIALLY_AVAILABLE avec au moins un créneau. Utilise le champ "jours" pour toute question sur un jour précis (ex : qui travaille samedi).

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
