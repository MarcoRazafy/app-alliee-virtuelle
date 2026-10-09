const AUTH_COOKIE = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
