const dailyModel = require('../models/daily.model');
const taskModel = require('../models/task.model');
const db = require('../config/database');

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/daily/done?date=YYYY-MM-DD
// Renvoie ma sélection Daily (done) + le POOL disponible = MES tâches assignées non encore
// dans le Daily (via findAssignedTasks → toujours l'utilisateur courant, quel que soit le rôle).
async function getMyDailyDone(req, res, next) {
  try {
    const date = DATE_RE.test(req.query.date) ? req.query.date : todayDateString();
    const done = await dailyModel.findDailyDone(req.user.id, date);
    const doneIds = new Set(done.map((t) => t.id));
    const assigned = await taskModel.findAssignedTasks(req.user.id);
    // On exclut du pool : CONFIRMÉE (clôturées), DECLAREE (non validées) et celles déjà dans le Daily.
    const available = assigned.filter(
      (t) => t.status !== 'CONFIRMEE' && t.status !== 'DECLAREE' && !doneIds.has(t.id)
    );
    res.status(200).json({ date, done, available });
  } catch (err) {
    next(err);
  }
}

// PUT /api/daily/done { date?, task_ids: [] } → remplace ma sélection Daily du jour
async function saveMyDailyDone(req, res, next) {
  try {
    const date = DATE_RE.test(req.body.date) ? req.body.date : todayDateString();
    const raw = Array.isArray(req.body.task_ids) ? req.body.task_ids : null;
    if (raw === null) return res.status(400).json({ error: 'task_ids doit être un tableau' });

    const ids = raw.filter((id) => typeof id === 'string' && UUID_RE.test(id));
    // Sécurité : on ne garde que les tâches réellement assignées à l'employé.
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

// GET /api/daily/admin?date=YYYY-MM-DD (admin) → par employé : To Do (jour validé) + Daily (tâches faites)
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
