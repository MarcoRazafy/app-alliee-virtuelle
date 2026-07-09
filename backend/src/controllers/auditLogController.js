const taskModel = require('../models/task.model');

async function listAuditLog(req, res, next) {
  try {
    const { entity_type: entityType, user_id: userId, limit } = req.query;
    const logs = await taskModel.findAuditLog({
      entityType,
      userId,
      limit: limit ? Number(limit) : 50,
    });
    res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLog };
