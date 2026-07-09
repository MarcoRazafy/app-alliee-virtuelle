const taskModel = require('../models/task.model');

async function getRealtime(req, res, next) {
  try {
    const data = await taskModel.computeRealtimeDashboard();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getRealtime };
