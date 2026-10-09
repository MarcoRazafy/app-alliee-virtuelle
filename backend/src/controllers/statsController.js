const statsModel = require('../models/stats.model');
const { businessDayNow, businessDayShifted } = require('../utils/businessDay');
const planningDates = require('../utils/planningDates');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultDateRange() {
  return { from: businessDayShifted(-30), to: businessDayNow() };
}

async function getTeamStats(req, res, next) {
  try {
    const defaults = defaultDateRange();
    const from = req.query.from || defaults.from;
    const to = req.query.to || defaults.to;

    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const stats = await statsModel.computeTeamStats(from, to);
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

async function getWeeklyConnections(req, res, next) {
  try {
    const requested = req.query.week_start_date;
    if (requested && !DATE_RE.test(requested)) {
      return res.status(400).json({ error: 'week_start_date doit être au format YYYY-MM-DD' });
    }
    const reference = requested
      ? planningDates.parsePlanningDate(requested)
      : planningDates.nowInPlanningZone();
    const weekStart = planningDates.formatDate(planningDates.getCurrentWeekStart(reference));

    const onlyUserId = req.user.role === 'ADMIN' ? null : req.user.id;
    const data = await statsModel.computeWeeklyConnections(weekStart, { onlyUserId });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getWeeklyTimelog(req, res, next) {
  try {
    const requestedId = req.query.user_id;
    const userId = req.user.role === 'ADMIN' ? requestedId : req.user.id;
    if (!userId || !UUID_RE.test(userId)) {
      return res.status(400).json({ error: 'user_id est requis' });
    }
    const requested = req.query.week_start_date;
    if (requested && !DATE_RE.test(requested)) {
      return res.status(400).json({ error: 'week_start_date doit être au format YYYY-MM-DD' });
    }
    const reference = requested
      ? planningDates.parsePlanningDate(requested)
      : planningDates.nowInPlanningZone();
    const weekStart = planningDates.formatDate(planningDates.getCurrentWeekStart(reference));

    const data = await statsModel.computeWeeklyTimelog(userId, weekStart);
    if (!data) return res.status(404).json({ error: 'Employé introuvable' });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getMyStats(req, res, next) {
  try {
    const defaults = defaultDateRange();
    const from = req.query.from || defaults.from;
    const to = req.query.to || defaults.to;

    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const stats = await statsModel.computeEmployeeStats(req.user.id, from, to);
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTeamStats,
  getMyStats,
  getWeeklyConnections,
  getWeeklyTimelog,
};
