const { isValidEmail, isValidPassword } = require('../utils/validators');

const USERNAME_REGEX = /^[a-z0-9_]{3,50}$/;

function validateRegister(req, res, next) {
  const { email, password, first_name, last_name, username, phone, position } = req.body;
  const errors = [];

  if (!isValidEmail(email)) errors.push('Email invalide');
  if (!isValidPassword(password)) errors.push('Le mot de passe doit contenir au moins 8 caractères');
  if (!first_name || !first_name.trim()) errors.push('Le prénom est requis');
  if (!last_name || !last_name.trim()) errors.push('Le nom est requis');
  if (!username || !USERNAME_REGEX.test(username.toLowerCase())) {
    errors.push("Le nom d'utilisateur doit contenir 3 à 50 caractères (lettres, chiffres, underscore uniquement)");
  }
  if (!phone || !phone.trim()) errors.push('Le téléphone est requis');
  if (!position || !position.trim()) errors.push('Le poste est requis');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

function validateUpdateProfile(req, res, next) {
  const { first_name, last_name, phone } = req.body;
  const errors = [];

  if (!first_name || !first_name.trim()) errors.push('Le prénom est requis');
  if (!last_name || !last_name.trim()) errors.push('Le nom est requis');
  if (!phone || !phone.trim()) errors.push('Le téléphone est requis');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

function validateLogin(req, res, next) {
  const { identifier, password } = req.body;
  const errors = [];

  // Un identifiant peut être un email OU un nom d'utilisateur : ne pas exiger un format email
  if (!identifier || !identifier.trim()) errors.push("L'identifiant (email ou nom d'utilisateur) est requis");
  if (!password) errors.push('Le mot de passe est requis');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

module.exports = { validateRegister, validateLogin, validateUpdateProfile };
