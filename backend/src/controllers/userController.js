const userModel = require('../models/user.model');

async function listUsers(req, res, next) {
  try {
    const users = await userModel.findActiveExcept(req.user.id);
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers };
