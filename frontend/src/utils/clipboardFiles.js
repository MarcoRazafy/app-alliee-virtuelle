// Fichiers collés depuis le presse-papiers (Ctrl+V) : capture d'écran, image copiée, PDF…
//
// Une capture d'écran arrive sans vrai nom — « image.png » pour tous les navigateurs. Collées
// l'une après l'autre dans un fil de discussion, elles seraient indiscernables : on les renomme
// d'après l'instant du collage (« capture-2026-09-19-10h04.png »).

const GENERIC_NAME_RE = /^(image|blob|clipboard|screenshot)(\.\w+)?$/i;

const EXTENSION_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function pastedFileName(file, now = new Date()) {
  const name = file?.name || '';
  if (name && !GENERIC_NAME_RE.test(name)) return name;
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}h${pad(now.getMinutes())}`;
  const ext = EXTENSION_BY_TYPE[file?.type] || (name.includes('.') ? name.split('.').pop() : 'bin');
  const prefix = String(file?.type || '').startsWith('image/') ? 'capture' : 'fichier';
  return `${prefix}-${stamp}.${ext}`;
}

// Fichiers d'un événement `paste`, renommés si besoin. Tableau vide quand on colle du texte :
// l'appelant laisse alors le collage se faire normalement.
export function filesFromPaste(event, now = new Date()) {
  const data = event?.clipboardData;
  if (!data) return [];
  let files = Array.from(data.files || []);
  // Certains navigateurs ne remplissent que `items`.
  if (files.length === 0 && data.items) {
    files = Array.from(data.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }
  return files.map((file) => {
    const name = pastedFileName(file, now);
    return name === file.name ? file : new File([file], name, { type: file.type, lastModified: now.getTime() });
  });
}
