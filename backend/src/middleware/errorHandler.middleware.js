const { captureError } = require('../config/observability');

function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;
  const message = err.status ? err.message : 'Internal server error';

  if (!err.status) captureError(err);

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
