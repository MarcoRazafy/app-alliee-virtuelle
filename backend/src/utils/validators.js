const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

const TASK_PRIORITIES = ['URGENT', 'HAUTE', 'NORMALE', 'FAIBLE'];

function isValidPriority(priority) {
  return TASK_PRIORITIES.includes(priority);
}

function isValidTitle(title) {
  return typeof title === 'string' && title.trim().length > 0 && title.length < 255;
}

function isFutureDate(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date.getTime() > today.getTime();
}

// Vrai si la date est aujourd'hui OU dans le futur (utilisé pour la deadline : une échéance
// « aujourd'hui » est autorisée). On compare au jour calendaire, à minuit.
function isTodayOrFuture(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date.getTime() >= today.getTime();
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidPriority,
  isValidTitle,
  isFutureDate,
  isTodayOrFuture,
  TASK_PRIORITIES,
};
