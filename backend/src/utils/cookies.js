// Gestion du cookie d'authentification httpOnly (le token JWT n'est plus exposé au JS du
// navigateur → protège du vol par XSS). Le token reste aussi renvoyé dans le corps de la
// réponse de login pour les clients non-navigateur (tests, éventuelles intégrations API).

const AUTH_COOKIE = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Parse un en-tête Cookie brut en objet { nom: valeur } (sans dépendance cookie-parser).
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// Options du cookie d'auth. `secure` uniquement en production (HTTPS) ; SameSite=Lax suffit
// contre le CSRF pour un SPA same-origin (le cookie n'est pas envoyé sur les POST cross-site).
function authCookieOptions(nodeEnv) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: SEVEN_DAYS_MS,
    path: '/',
  };
}

module.exports = { AUTH_COOKIE, parseCookieHeader, authCookieOptions };
