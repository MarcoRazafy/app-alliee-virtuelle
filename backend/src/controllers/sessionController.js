const sessionModel = require('../models/session.model');
const planningDates = require('../utils/planningDates');

// GET /api/sessions/week?week_start_date=YYYY-MM-DD
// Retourne les périodes de connexion réelle de l'utilisateur connecté, découpées par jour,
// pour superposition sur la grille de planning (lecture seule, chrono indépendant des tâches).
async function getMySessionsForWeek(req, res, next) {
  try {
    const { week_start_date: requestedDate } = req.query;
    if (!requestedDate) {
      return res.status(400).json({ error: 'Le paramètre week_start_date est requis.' });
    }

    const weekStartDT = planningDates.getCurrentWeekStart(planningDates.parsePlanningDate(requestedDate));
    const weekEndDT = planningDates.getWeekEnd(weekStartDT).plus({ days: 1 }); // borne exclusive (lundi suivant 00:00)

    const sessions = await sessionModel.findSessionsOverlappingRange(
      req.user.id,
      weekStartDT.toISO(),
      weekEndDT.toISO()
    );

    const weekDates = planningDates.getWeekDates(planningDates.formatDate(weekStartDT));
    const segments = sessions
      .flatMap((session) =>
        planningDates.splitRangeIntoDaySegments(
          // pg renvoie les colonnes TIMESTAMPTZ sous forme d'objets Date : splitRangeIntoDaySegments
          // attend des chaînes ISO (DateTime.fromISO), d'où la conversion explicite ici.
          session.login_at.toISOString(),
          (session.logout_at ? session.logout_at.toISOString() : null) || planningDates.nowInPlanningZone().toISO()
        )
      )
      .filter((segment) => weekDates.includes(segment.date));

    res.status(200).json(segments);
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions/close — ferme le chrono de connexion en cours, indépendamment du
// chrono de tâche. Appelé à la fermeture de l'application (au-delà de la déconnexion
// explicite, déjà gérée dans authController.logout) via un envoi "keepalive" au déchargement
// de la page : ne doit donc avoir AUCUN effet de bord sur le chrono de tâche (timelog).
async function closeMySession(req, res, next) {
  try {
    await sessionModel.closeOpenSessions(req.user.id);
    res.status(200).json({ closed: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/sessions/current — session de connexion ouverte, pour le chrono flottant
// (l'affichage calcule lui-même le temps écoulé depuis login_at, pas de polling nécessaire).
async function getMyCurrentSession(req, res, next) {
  try {
    const session = await sessionModel.findOpenSession(req.user.id);
    res.status(200).json({ login_at: session ? session.login_at : null });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMySessionsForWeek, closeMySession, getMyCurrentSession };
