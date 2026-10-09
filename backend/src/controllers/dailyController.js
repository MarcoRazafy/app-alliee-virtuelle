const dailyModel = require('../models/daily.model');
const taskModel = require('../models/task.model');
const db = require('../config/database');
const { businessDayNow } = require('../utils/businessDay');

const todayDateString = businessDayNow;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getMyDailyDone(req, res, next) {
  try {
    const date = DATE_RE.test(req.query.date) ? req.query.date : todayDateString();
    const done = await dailyModel.findDailyDone(req.user.id, date);
    const doneIds = new Set(done.map((t) => t.id));
    const assigned = await taskModel.findAssignedTasks(req.user.id);
    const available = assigned.filter(
      (t) => !['TERMINEE', 'CONFIRMEE', 'DECLAREE'].includes(t.status) && !doneIds.has(t.id)
    );
    res.status(200).json({ date, done, available });
  } catch (err) {
    next(err);
  }
}

async function saveMyDailyDone(req, res, next) {
  try {
    const date = DATE_RE.test(req.body.date) ? req.body.date : todayDateString();
    const raw = Array.isArray(req.body.task_ids) ? req.body.task_ids : null;
    if (raw === null) return res.status(400).json({ error: 'task_ids doit être un tableau' });

    const ids = raw.filter((id) => typeof id === 'string' && UUID_RE.test(id));
    const assigned = ids.length
      ? (
          await db.query(
            `SELECT task_id FROM task_assignees WHERE user_id = $1 AND task_id = ANY($2::uuid[])`,
            [req.user.id, ids]
          )
        ).rows.map((r) => r.task_id)
      : [];
    const assignedSet = new Set(assigned);
    const cleanIds = ids.filter((id) => assignedSet.has(id));

    await dailyModel.replaceDailyDone(req.user.id, date, cleanIds);
    const tasks = await dailyModel.findDailyDone(req.user.id, date);
    res.status(200).json({ date, tasks });
  } catch (err) {
    next(err);
  }
}

async function getOverview(req, res, next) {
  try {
    const date = DATE_RE.test(req.query.date) ? req.query.date : todayDateString();
    const employees = await dailyModel.getDailyOverview(date);
    res.status(200).json({ date, employees });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyDailyDone, saveMyDailyDone, getOverview };
