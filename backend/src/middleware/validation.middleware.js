const { isValidEmail, isValidPassword } = require('../utils/validators');

const USERNAME_REGEX = /^[a-z0-9_]{3,50}$/;

function validateRegister(req, res, next) {
  const { email, password, first_name, last_name, username, phone, position } = req.body;
  const errors = [];

  if (!isValidEmail(email)) errors.push('Invalid email');
  if (!isValidPassword(password)) errors.push('The password must be at least 8 characters long');
  if (!first_name || !first_name.trim()) errors.push('First name is required');
  if (!last_name || !last_name.trim()) errors.push('Last name is required');
  if (!username || !USERNAME_REGEX.test(username.toLowerCase())) {
    errors.push('The username must be 3 to 50 characters (letters, digits, underscore only)');
  }
  if (!phone || !phone.trim()) errors.push('Phone is required');
  if (!position || !position.trim()) errors.push('Position is required');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

function validateUpdateProfile(req, res, next) {
  const { first_name, last_name, phone, email } = req.body;
  const errors = [];

  if (!first_name || !first_name.trim()) errors.push('First name is required');
  if (!last_name || !last_name.trim()) errors.push('Last name is required');
  if (!phone || !phone.trim()) errors.push('Phone is required');
  // L'email est modifiable : requis et valide s'il est fourni.
  if (email !== undefined && (!email || !isValidEmail(email))) errors.push('Invalid email address');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

function validateLogin(req, res, next) {
  const { identifier, password } = req.body;
  const errors = [];

  // Un identifiant peut être un email OU un nom d'utilisateur : ne pas exiger un format email
  if (!identifier || !identifier.trim()) errors.push('The identifier (email or username) is required');
  if (!password) errors.push('Password is required');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

module.exports = { validateRegister, validateLogin, validateUpdateProfile };
