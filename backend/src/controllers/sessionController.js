const sessionModel = require('../models/session.model');
const planningDates = require('../utils/planningDates');

// Construit les segments de connexion (découpés par jour) d'un utilisateur pour une semaine.
// Le dernier segment d'une session encore ouverte est marqué is_live (suivi temps réel).
async function buildWeekSegments(userId, requestedDate) {
  const weekStartDT = planningDates.getCurrentWeekStart(planningDates.parsePlanningDate(requestedDate));
  const weekEndDT = planningDates.getWeekEnd(weekStartDT).plus({ days: 1 }); // borne exclusive (lundi suivant 00:00)

  const sessions = await sessionModel.findSessionsOverlappingRange(userId, weekStartDT.toISO(), weekEndDT.toISO());
  const weekDates = planningDates.getWeekDates(planningDates.formatDate(weekStartDT));

  return sessions
    .flatMap((session) => {
      // pg renvoie les TIMESTAMPTZ sous forme d'objets Date : splitRangeIntoDaySegments attend des chaînes ISO.
      const segs = planningDates.splitRangeIntoDaySegments(
        session.login_at.toISOString(),
        session.effective_logout_at.toISOString()
      );
      // Seul un heartbeat récent marque réellement la session "en direct".
      if (session.is_live && segs.length > 0) {
        segs[segs.length - 1].is_live = true;
      }
      return segs;
    })
    .filter((segment) => weekDates.includes(segment.date));
}

// GET /api/sessions/week?week_start_date=YYYY-MM-DD
// Périodes de connexion réelle de l'utilisateur connecté, découpées par jour, pour
// superposition sur la grille de planning (lecture seule, chrono indépendant des tâches).
async function getMySessionsForWeek(req, res, next) {
  try {
    const { week_start_date: requestedDate } = req.query;
    if (!requestedDate) {
      return res.status(400).json({ error: 'Le paramètre week_start_date est requis.' });
    }
    const segments = await buildWeekSegments(req.user.id, requestedDate);
    res.status(200).json(segments);
  } catch (err) {
    next(err);
  }
}

// GET /api/sessions/admin/week?user_id=&week_start_date= — sessions d'un employé (admin),
// pour superposer sa présence réelle sur le calendrier de planning côté admin.
async function getUserSessionsForWeekAdmin(req, res, next) {
  try {
    const { user_id: userId, week_start_date: requestedDate } = req.query;
    if (!userId || !requestedDate) {
      return res.status(400).json({ error: 'Les paramètres user_id et week_start_date sont requis.' });
    }
    const segments = await buildWeekSegments(userId, requestedDate);
    res.status(200).json(segments);
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions/close — fermeture explicite de secours, indépendante du chrono de tâche.
// La déconnexion standard passe déjà par authController.logout ; la fermeture du navigateur
// est, elle, gérée par l'expiration du heartbeat et n'appelle plus cette route.
async function closeMySession(req, res, next) {
  try {
    await sessionModel.closeOpenSessions(req.user.id);
    res.status(200).json({ closed: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions/heartbeat — PROLONGE la session de présence ouverte (résiste aux
// rechargements). Ne crée jamais de session : rouvrir l'app sans se reconnecter ne rend pas
// le compte actif. Renvoie login_at:null s'il n'y a aucune session ouverte.
async function heartbeatMySession(req, res, next) {
  try {
    const session = await sessionModel.heartbeatSession(req.user.id);
    res.status(200).json({
      login_at: session ? session.login_at : null,
      last_seen_at: session ? session.last_seen_at : null,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions/disconnect — signal best-effort envoyé avec fetch keepalive au
// pagehide. La fermeture effective est différée pour distinguer un rechargement.
async function requestMyDisconnect(req, res, next) {
  try {
    await sessionModel.requestDisconnect(req.user.id);
    res.status(202).json({ pending: true });
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

module.exports = {
  getMySessionsForWeek,
  getUserSessionsForWeekAdmin,
  closeMySession,
  heartbeatMySession,
  requestMyDisconnect,
  getMyCurrentSession,
};
