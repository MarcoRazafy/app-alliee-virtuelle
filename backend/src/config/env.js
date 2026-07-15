require('dotenv').config();

module.exports = {
  port: process.env.API_PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  mistralApiKey: process.env.MISTRAL_API_KEY,
  mistralModel: process.env.MISTRAL_MODEL || 'mistral-medium',
  planningTimezone: process.env.PLANNING_TIMEZONE || 'Indian/Antananarivo',
  // Bascule de TEST uniquement : force la fenêtre de saisie employé (samedi/dimanche) à
  // rester ouverte en permanence, pour pouvoir qualifier l'interface sans attendre le week-end.
  // Doit rester à false hors environnement de test/démo (voir .env.example).
  planningForceEditWindow: process.env.PLANNING_FORCE_EDIT_WINDOW === 'true',
};
