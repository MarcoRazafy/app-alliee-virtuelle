const statsModel = require('../models/stats.model');

function defaultDateRange() {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
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

module.exports = { getTeamStats, getMyStats };
