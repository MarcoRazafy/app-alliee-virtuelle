const { sendFileOr404 } = require('../utils/sendFile');
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

// Guide de navigation/utilisation, injecté dans les prompts pour que l'assistant sache aider
// un nouvel utilisateur à SE SERVIR de l'application (où aller, comment faire une action).
// À garder synchronisé avec les menus réels (AdminLayout.jsx / EmployeeLayout.jsx).
const APP_TASK_CYCLE = `Cycle d'une tâche : un employé DÉCLARE une tâche (statut "déclarée" = simple proposition), l'admin la VALIDE ; une fois faite, l'employé la marque TERMINÉE, puis l'admin la CONFIRME (= "complétée"). Une tâche créée directement par l'admin est VALIDÉE d'emblée.`;

const APP_MESSAGING_GUIDE = `Messagerie (icône BULLE en haut) : discussions privées à deux ET conversations de GROUPE.
- Créer un GROUPE : ouvrir la messagerie, onglet "Groupes", bouton "+" ("Créer un groupe"), puis choisir les membres.
- Gérer un groupe : le renommer, changer sa photo, ajouter ou retirer des membres, le quitter, ou le supprimer (réservé au créateur / à un admin).
- Dans une discussion : écrire un message (avec mise en forme), joindre un fichier, envoyer un message vocal, réagir, modifier ou supprimer ses propres messages, et TRANSFÉRER un message vers une autre discussion.
La messagerie est interne à l'équipe. Pour communiquer à TOUTE l'équipe d'un coup, utiliser plutôt le menu "Annonce" (à gauche).`;

const EMPLOYEE_APP_GUIDE = `GUIDE D'UTILISATION DE L'APPLICATION (pour guider un employé pas à pas) :
Menu vertical à gauche :
- "Dashboard" : page d'accueil (résumé de la journée, tâche en cours, raccourcis).
- "Gestionnaire de tâche" (menu qui se déplie) :
   • "Mon Espace" : vue d'ensemble de ses espaces et listes de tâches.
   • "Ma journée" : déclarer les tâches prévues pour aujourd'hui et lancer/arrêter le minuteur de la tâche en cours. C'est aussi ici qu'on fait une DEMANDE de tâche supplémentaire (avec une justification) une fois la journée validée.
   • "Mes tâches" : la liste de toutes ses tâches (statut, priorité, échéance) ; on ouvre une tâche pour la démarrer ou la marquer terminée.
- "Planning" : indiquer ses disponibilités jour par jour (créneaux horaires) pour la semaine, puis SOUMETTRE la semaine à l'admin.
- "Statistique" : ses statistiques personnelles (tâches, temps de travail, présence).
- "Ressources" : les documents partagés par l'équipe.
- "Annonces" : les communications de l'administration (un popup s'affiche à la connexion pour une nouvelle annonce).
- "Profil" : ses informations personnelles et sa photo de profil.
Barre du haut, à droite, trois icônes : une BULLE = "Messagerie", une CLOCHE = "Notifications", une ÉTINCELLE = ce chatbot.
${APP_MESSAGING_GUIDE}
${APP_TASK_CYCLE}`;

const ADMIN_APP_GUIDE = `GUIDE D'UTILISATION DE L'APPLICATION (pour guider un administrateur pas à pas) :
Menu vertical à gauche :
- "Vue d'ensemble" : tableau de bord temps réel (employés actifs, tâches en cours, tâches en retard).
- "Gestionnaire de tâche" (menu qui se déplie) :
   • "Projets" : toutes les tâches classées par espace / dossier / liste ; on peut y ajouter une tâche à un projet (l'emplacement se pré-remplit automatiquement).
   • "Liste des tâches" : les déclarations et livraisons des employés à contrôler (valider / confirmer).
   • "Demande des tâches" : les demandes de tâches supplémentaires des employés à approuver ou refuser.
- "Gestionnaire des employés" (menu qui se déplie) :
   • "Planning & Présence" : les disponibilités et la présence de l'équipe.
   • "Équipe" : les membres de l'équipe et l'approbation des nouvelles inscriptions.
- "Statistique" : la performance de l'équipe.
- "Annonce" : publier une communication à toute l'équipe.
- "Mon planning" : ses propres disponibilités de la semaine.
- "Ressources" : les documents partagés. "Admin Profil" : ses informations.
- "Créer une tâche" : formulaire complet pour créer et assigner une nouvelle tâche.
Barre du haut, à droite : une BULLE = "Messagerie", une CLOCHE = "Notifications", une ÉTINCELLE = cet assistant.
${APP_MESSAGING_GUIDE}
${APP_TASK_CYCLE}`;

const ADMIN_SYSTEM_PROMPT = `Tu es l'assistant IA de L'Alliée Virtuelle, un outil de suivi des tâches en équipe.
Tu as DEUX missions :
1) Répondre aux questions sur les données de l'équipe (tâches, plannings, statistiques) à partir du JSON fourni plus bas.
2) AIDER les utilisateurs — souvent nouveaux sur l'application — à s'en servir : leur expliquer où aller et comment réaliser une action, en langage simple, avec des étapes numérotées. Pour cela, appuie-toi sur le "GUIDE D'UTILISATION" ci-dessous.

RÈGLES STRICTES (à respecter impérativement) :
- Tu es en LECTURE SEULE : tu ne peux jamais créer, modifier, confirmer ni supprimer quoi que ce soit. Pour une action, tu EXPLIQUES à l'utilisateur comment la faire lui-même (quel menu, quel bouton) ; tu ne la réalises pas à sa place.
- Pour les DONNÉES : n'invente JAMAIS. Si le JSON ne permet pas de répondre, dis "Je n'ai pas assez de données pour répondre. Pouvez-vous préciser la période ou le projet ?"
- Pour l'AIDE À L'UTILISATION : appuie-toi uniquement sur le GUIDE ci-dessous. Si une manipulation n'y figure pas, dis-le simplement plutôt que d'inventer un écran ou un bouton.
- Une tâche "complétée" signifie toujours statut CONFIRMEE (jamais TERMINEE - ce sont deux indicateurs différents).
- Lorsque tu cites des chiffres, précise la période analysée.
- Réponds en français, de façon concise, claire et bienveillante ; pour une manipulation, donne des étapes numérotées.

${ADMIN_APP_GUIDE}

Le JSON ci-dessous est un instantané en lecture seule de la base de données. Il contient :
- "equipe" et "effectif_actif" : la liste des employés actifs (nom, poste).
- "taches_par_employe" : pour chaque employé, le nombre total de tâches et la répartition par statut (DECLAREE, EN_COURS, TERMINEE, CONFIRMEE).
- "plannings_semaine_courante" et "plannings_semaine_prochaine" : pour chaque employé, le statut du planning, les heures déclarées, s'il est soumis, ET le détail "jours" (un objet par jour avec "jour" en français ex "samedi", "date", "disponibilite" et "creneaux" horaires).
- "statistiques_equipe", "suivi_temps_reel", "taches_en_retard" : indicateurs agrégés.
Statuts de planning : DRAFT (brouillon), SUBMITTED (soumis), ADMIN_MODIFIED (modifié par un admin), LOCKED, NOT_SUBMITTED.
Disponibilité d'un jour : AVAILABLE (disponible), PARTIALLY_AVAILABLE (partiellement), UNAVAILABLE (indisponible), LEAVE (congé), SICK (maladie). Un employé "travaille" un jour si sa disponibilité est AVAILABLE ou PARTIALLY_AVAILABLE avec au moins un créneau. Utilise le champ "jours" pour toute question sur un jour précis (ex : qui travaille samedi).

Données actuelles de l'équipe (JSON) :
`;

const EMPLOYEE_SYSTEM_PROMPT = `Tu es le chatbot personnel de L'Alliée Virtuelle.
Tu as DEUX missions :
1) Répondre aux questions de l'employé sur SES tâches et SES statistiques personnelles (à partir du JSON plus bas).
2) AIDER l'employé — souvent nouveau sur l'application — à s'en servir : lui expliquer où aller et comment réaliser une action, en langage simple, avec des étapes numérotées, en t'appuyant sur le "GUIDE D'UTILISATION" ci-dessous.

RÈGLES STRICTES :
- Tu es en LECTURE SEULE : tu ne peux créer, modifier, confirmer ou supprimer aucune donnée. Pour une action, tu EXPLIQUES à l'employé comment la faire lui-même (quel menu, quel bouton) ; tu ne la fais pas à sa place.
- Pour les données personnelles, appuie-toi sur le JSON ; pour l'aide à l'utilisation, appuie-toi sur le GUIDE. N'invente jamais : si l'information ne s'y trouve pas, indique-le clairement.
- Tu ne fournis aucune information concernant les autres employés ou l'administration.
- Une tâche complétée signifie le statut CONFIRMEE ; TERMINEE signifie qu'elle attend encore une confirmation.
- Réponds en français, de façon concise, pratique et bienveillante ; pour une manipulation, donne des étapes numérotées.
- Précise la période utilisée lorsque tu cites des statistiques.

${EMPLOYEE_APP_GUIDE}

Données personnelles de l'employé (JSON) :
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mémoire du chatbot : on renvoie au modèle les derniers échanges de la conversation en cours.
const HISTORY_LIMIT = 8; // nombre d'échanges (question+réponse) rappelés au modèle
const HISTORY_ANSWER_MAX = 1000; // borne la longueur des réponses passées (maîtrise des tokens)

function trimForHistory(text) {
  if (!text) return '';
  return text.length > HISTORY_ANSWER_MAX ? `${text.slice(0, HISTORY_ANSWER_MAX)}…` : text;
}

// Génère une réponse Mistral pour une question (avec mention éventuelle d'une pièce jointe).
// sessionId + excludeId servent à rappeler l'historique de la conversation (mémoire).
async function generateAnswer(question, attachmentName, requester, sessionId = null, excludeId = null) {
  const isAdmin = requester.role === 'ADMIN';
  const context = isAdmin ? await buildAdminContext() : await buildEmployeeContext(requester.id);
  const userContent = attachmentName
    ? `${question}\n\n[L'utilisateur a joint un fichier nommé « ${attachmentName} ». Tu ne peux pas ouvrir son contenu ; base-toi sur le nom et la question.]`
    : question;

  // Historique de la session → messages user/assistant intercalés (mémoire du fil).
  const history = await aiModel.findSessionHistory(sessionId, requester.id, {
    limit: HISTORY_LIMIT,
    excludeId,
  });
  const historyMessages = [];
  for (const turn of history) {
    if (turn.question) historyMessages.push({ role: 'user', content: turn.question });
    if (turn.answer) historyMessages.push({ role: 'assistant', content: trimForHistory(turn.answer) });
  }

  const messages = [
    {
      role: 'system',
      content: (isAdmin ? ADMIN_SYSTEM_PROMPT : EMPLOYEE_SYSTEM_PROMPT) + JSON.stringify(context),
    },
    ...historyMessages,
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
      return res.status(400).json({ error: 'La question est requise' });
    }
    // Le front envoie l'id de la conversation en cours ; sinon le modèle en génère un.
    const validSessionId = sessionId && UUID_RE.test(sessionId) ? sessionId : null;
    const attachment = req.file
      ? { path: req.file.path, name: req.file.originalname, type: req.file.mimetype }
      : null;

    // On passe la session pour que le modèle se souvienne des échanges précédents (le nouvel
    // échange n'est pas encore enregistré à ce stade, donc pas besoin d'excludeId ici).
    const { answer, context } = await generateAnswer(question, attachment?.name, req.user, validSessionId);

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
    if (!conversation) return res.status(404).json({ error: 'Échange introuvable' });
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'La question est requise' });
    // Ré-édition : on rappelle l'historique de la session en excluant l'échange qu'on réécrit.
    const { answer } = await generateAnswer(
      question,
      conversation.attachment_name,
      req.user,
      conversation.session_id,
      conversation.id
    );
    const updated = await aiModel.updateConversation(req.params.id, req.user.id, { question, answer });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    const count = await aiModel.deleteConversation(req.params.id, req.user.id);
    if (count === 0) return res.status(404).json({ error: 'Échange introuvable' });
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
    if (!title) return res.status(400).json({ error: 'Le titre est requis' });
    const count = await aiModel.renameSession(req.params.sessionId, req.user.id, title.slice(0, 120));
    if (count === 0) return res.status(404).json({ error: 'Conversation introuvable' });
    res.status(200).json({ title: title.slice(0, 120) });
  } catch (err) {
    next(err);
  }
}

async function getConversationAttachment(req, res, next) {
  try {
    const conversation = await aiModel.findConversationById(req.params.id, req.user.id);
    if (!conversation || !conversation.attachment_path) {
      return res.status(404).json({ error: 'Pièce jointe introuvable' });
    }
    return sendFileOr404(res, conversation.attachment_path, 'Pièce jointe introuvable');
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
