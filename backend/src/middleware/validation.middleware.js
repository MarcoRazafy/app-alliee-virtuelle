const { isValidEmail, isValidPassword } = require('../utils/validators');

function validateRegister(req, res, next) {
  const { email, password, full_name, phone, position } = req.body;
  const errors = [];

  if (!isValidEmail(email)) errors.push('Email invalide');
  if (!isValidPassword(password)) errors.push('Le mot de passe doit contenir au moins 8 caractères');
  if (!full_name || !full_name.trim()) errors.push('Le nom complet est requis');
  if (!phone || !phone.trim()) errors.push('Le téléphone est requis');
  if (!position || !position.trim()) errors.push('Le poste est requis');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  if (!isValidEmail(email)) errors.push('Email invalide');
  if (!password) errors.push('Le mot de passe est requis');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

module.exports = { validateRegister, validateLogin };
