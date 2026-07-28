const notificationModel = require('../models/notification.model');

async function list(req, res, next) {
  try {
    const data = await notificationModel.findForUser({
      userId: req.user.id,
      role: req.user.role,
      limit: req.query.limit,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const state = await notificationModel.markAllRead(req.user.id);
    res.status(200).json({ read: true, last_read_at: state.last_read_at });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, markAllRead };
