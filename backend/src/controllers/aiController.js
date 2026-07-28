const { DateTime } = require('luxon');
const taskModel = require('../models/task.model');
const statsModel = require('../models/stats.model');
const aiModel = require('../models/ai.model');
const userModel = require('../models/user.model');
const planningModel = require('../models/planning.model');
const planningDates = require('../utils/planningDates');
const mistral = require('../config/mistral');

const TASK_STATUSES = ['DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'];
const WEEKDAYS_FR = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
      const row = { employe: nameById.get(task.assigned_to) || 'Unassigned', total: 0 };
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
async function buildAdminContext() {
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

async function buildEmployeeContext(userId) {
  const { from, to } = defaultRange();
  const [employee, tasks, stats] = await Promise.all([
    userModel.findById(userId),
    taskModel.findAssignedTasks(userId),
    statsModel.computeEmployeeStats(userId, from, to),
  ]);

  return {
    date_du_jour: planningDates.formatDate(planningDates.nowInPlanningZone()),
    period_analysee: { from, to },
    employe: {
      nom: employee?.full_name || null,
      poste: employee?.position || null,
    },
    statistiques_personnelles: stats,
    mes_taches: tasks.map((task) => ({
      titre: task.title,
      statut: task.status,
      priorite: task.priority,
      echeance: task.deadline,
      projet: task.list_name || null,
    })),
  };
}

const ADMIN_SYSTEM_PROMPT = `You are the AI assistant of L'Alliée Virtuelle, a team task-tracking tool.

STRICT RULES (must be followed at all times):
- You are READ-ONLY: you can never create, modify, confirm or delete a task or a user. You only answer questions.
- NEVER invent data. If the provided data is not enough to answer, say explicitly:
  "I don't have enough data to answer. Could you specify the period or the project?"
- A "completed" task always means the CONFIRMEE status (never TERMINEE - these are two different indicators).
- Always state the analyzed period in your answer.
- Answer in English, concisely and factually, based only on the data below.

The JSON below is a read-only snapshot of the database. It contains:
- "equipe" and "effectif_actif": the list of active employees (name, position).
- "taches_par_employe": for each employee, the total number of tasks and the breakdown by status (DECLAREE, EN_COURS, TERMINEE, CONFIRMEE).
- "plannings_semaine_courante" and "plannings_semaine_prochaine": for each employee, the schedule status, the declared hours, whether it is submitted, AND the "jours" detail (one object per day with "jour" as a weekday name, "date", "disponibilite" and "creneaux" time slots).
- "statistiques_equipe", "suivi_temps_reel", "taches_en_retard": aggregated indicators.
Schedule statuses: DRAFT, SUBMITTED, ADMIN_MODIFIED (modified by an admin), LOCKED, NOT_SUBMITTED.
Day availability: AVAILABLE, PARTIALLY_AVAILABLE, UNAVAILABLE, LEAVE, SICK. An employee "works" on a day if their availability is AVAILABLE or PARTIALLY_AVAILABLE with at least one slot. Use the "jours" field for any question about a specific day (e.g. who works on Saturday).

Current team data (JSON):
`;

const EMPLOYEE_SYSTEM_PROMPT = `You are the personal chatbot of L'Alliée Virtuelle.

STRICT RULES:
- You are READ-ONLY: you cannot create, modify, confirm or delete any data.
- You only answer about the personal tasks and statistics present in the JSON.
- You provide no information about other employees or the administration.
- Never invent data. If the context is not enough, say so clearly.
- A completed task means the CONFIRMEE status; TERMINEE means it is still awaiting confirmation.
- Answer in English, concisely, practically and factually.
- State the period used when you cite statistics.

Personal data of the employee (JSON):
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Génère une réponse Mistral pour une question (avec mention éventuelle d'une pièce jointe).
async function generateAnswer(question, attachmentName, requester) {
  const isAdmin = requester.role === 'ADMIN';
  const context = isAdmin ? await buildAdminContext() : await buildEmployeeContext(requester.id);
  const userContent = attachmentName
    ? `${question}\n\n[The user attached a file named "${attachmentName}". You cannot open its content; rely on the name and the question.]`
    : question;
  const messages = [
    {
      role: 'system',
      content: (isAdmin ? ADMIN_SYSTEM_PROMPT : EMPLOYEE_SYSTEM_PROMPT) + JSON.stringify(context),
    },
    { role: 'user', content: userContent },
  ];
  const answer = await mistral.askMistral(messages);
  return { answer, context };
}

async function ask(req, res, next) {
  try {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    const sessionId = req.body.session_id;
    if (!question) {
      return res.status(400).json({ error: 'The question is required' });
    }
    // Le front envoie l'id de la conversation en cours ; sinon le modèle en génère un.
    const validSessionId = sessionId && UUID_RE.test(sessionId) ? sessionId : null;
    const attachment = req.file
      ? { path: req.file.path, name: req.file.originalname, type: req.file.mimetype }
      : null;

    const { answer, context } = await generateAnswer(question, attachment?.name, req.user);

    const conversation = await aiModel.createConversation({
      adminId: req.user.id,
      sessionId: validSessionId,
      question,
      answer,
      contextData: { period: context.period_analysee },
      attachment,
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

// Édition d'un message : nouvelle question → nouvelle réponse générée.
async function editConversation(req, res, next) {
  try {
    const conversation = await aiModel.findConversationById(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation entry not found' });
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'The question is required' });
    const { answer } = await generateAnswer(question, conversation.attachment_name, req.user);
    const updated = await aiModel.updateConversation(req.params.id, req.user.id, { question, answer });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    const count = await aiModel.deleteConversation(req.params.id, req.user.id);
    if (count === 0) return res.status(404).json({ error: 'Conversation entry not found' });
    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    const count = await aiModel.deleteSession(req.params.sessionId, req.user.id);
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
}

async function renameSession(req, res, next) {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'The title is required' });
    const count = await aiModel.renameSession(req.params.sessionId, req.user.id, title.slice(0, 120));
    if (count === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.status(200).json({ title: title.slice(0, 120) });
  } catch (err) {
    next(err);
  }
}

async function getConversationAttachment(req, res, next) {
  try {
    const conversation = await aiModel.findConversationById(req.params.id, req.user.id);
    if (!conversation || !conversation.attachment_path) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    res.sendFile(conversation.attachment_path);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ask,
  getHistory,
  editConversation,
  deleteConversation,
  deleteSession,
  renameSession,
  getConversationAttachment,
};
