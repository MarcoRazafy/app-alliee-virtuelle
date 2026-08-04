// Sanitizer HTML léger (sans dépendance) pour le contenu riche des annonces.
// Ne conserve qu'une liste blanche de balises/attributs → neutralise script, styles inline,
// gestionnaires d'événements (onXxx) et liens javascript:. Reconstruit un arbre propre.

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'A', 'UL', 'OL', 'LI', 'P', 'BR', 'SPAN', 'DIV',
]);
const ALLOWED_ATTRS = { A: ['href'] };
const SAFE_HREF = /^(https?:|mailto:)/i;

// Propriétés de style autorisées (mise en forme uniquement) : évite de perdre le gras/italique
// quand le navigateur émet des <span style> au lieu de balises sémantiques.
const SAFE_STYLE_PROPS = new Set(['font-weight', 'font-style', 'text-decoration', 'text-decoration-line']);

function safeStyle(value) {
  return (value || '')
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      if (/url\(|expression|javascript:/i.test(decl)) return false;
      const prop = decl.split(':')[0].trim().toLowerCase();
      return SAFE_STYLE_PROPS.has(prop);
    })
    .join('; ');
}

function cleanInto(source, out) {
  source.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(child.nodeValue));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return; // supprimé, contenu inclus
    if (!ALLOWED_TAGS.has(tag)) {
      cleanInto(child, out); // balise inconnue : on déballe (garde le contenu)
      return;
    }

    const el = document.createElement(tag);
    (ALLOWED_ATTRS[tag] || []).forEach((attr) => {
      if (!child.hasAttribute(attr)) return;
      const value = child.getAttribute(attr);
      if (attr === 'href' && !SAFE_HREF.test(value.trim())) return;
      el.setAttribute(attr, value);
    });
    if (child.hasAttribute('style')) {
      const cleaned = safeStyle(child.getAttribute('style'));
      if (cleaned) el.setAttribute('style', cleaned);
    }
    if (tag === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    cleanInto(child, el);
    out.appendChild(el);
  });
}

export function sanitizeHtml(dirty) {
  const template = document.createElement('template');
  template.innerHTML = dirty || '';
  const out = document.createElement('div');
  cleanInto(template.content, out);
  return out.innerHTML;
}

// Texte brut (pour aperçus, popup, validation « non vide »), en préservant les sauts de ligne :
// les blocs (div/p/li…) et les <br> deviennent des retours à la ligne, sinon « test\ntest »
// se retrouverait collé en « testtest ».
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);

export function htmlToText(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  let text = '';
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue;
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (child.tagName === 'BR') {
        text += '\n';
        return;
      }
      const isBlock = BLOCK_TAGS.has(child.tagName);
      if (isBlock && text && !text.endsWith('\n')) text += '\n';
      walk(child);
      if (isBlock && !text.endsWith('\n')) text += '\n';
    });
  };
  walk(template.content);
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
