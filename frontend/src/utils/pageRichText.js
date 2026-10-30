import { PALETTE_VALUES, lienSur } from './pageBlocks.js';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const STYLE_KEYS = ['g', 'i', 's', 'lien', 'couleur', 'taille'];
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
const LIST_TAGS = new Set(['UL', 'OL']);
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

export const SIZE_TO_CSS = { petit: 'small', grand: 'x-large', 'tres-grand': 'xx-large' };

function sizeFromCss(value) {
  if (['xx-small', 'x-small', 'small', 'smaller'].includes(value)) return 'petit';
  if (['large', 'x-large', 'larger'].includes(value)) return 'grand';
  if (['xx-large', 'xxx-large'].includes(value)) return 'tres-grand';
  return undefined;
}

function sizeFromFontAttribute(value) {
  const size = Number(value);
  if (size === 1 || size === 2) return 'petit';
  if (size === 4 || size === 5) return 'grand';
  if (size === 6 || size === 7) return 'tres-grand';
  return undefined;
}

function colorToHex(value) {
  if (!value) return undefined;
  const color = String(value).trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (!rgb) return undefined;
  return `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

function paletteColor(value) {
  const hex = colorToHex(value);
  return hex && PALETTE_VALUES.includes(hex) ? hex : undefined;
}

function styleOf(element, inherited) {
  const style = { ...inherited };
  const tag = element.tagName;
  if (tag === 'B' || tag === 'STRONG') style.g = true;
  if (tag === 'I' || tag === 'EM') style.i = true;
  if (tag === 'U') style.s = true;

  const css = element.style;
  if (css) {
    const weight = css.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) style.g = true;
    else if (weight === 'normal' || Number(weight) === 400) delete style.g;
    if (css.fontStyle === 'italic' || css.fontStyle === 'oblique') style.i = true;
    else if (css.fontStyle === 'normal') delete style.i;
    const decoration = `${css.textDecorationLine || ''} ${css.textDecoration || ''}`;
    if (decoration.includes('underline')) style.s = true;
    if (css.color) {
      const couleur = paletteColor(css.color);
      if (couleur) style.couleur = couleur;
      else delete style.couleur;
    }
    if (css.fontSize) {
      const taille = sizeFromCss(css.fontSize);
      if (taille) style.taille = taille;
      else delete style.taille;
    }
  }

  if (tag === 'FONT') {
    if (element.hasAttribute('color')) {
      const couleur = paletteColor(element.getAttribute('color'));
      if (couleur) style.couleur = couleur;
      else delete style.couleur;
    }
    if (element.hasAttribute('size')) {
      const taille = sizeFromFontAttribute(element.getAttribute('size'));
      if (taille) style.taille = taille;
      else delete style.taille;
    }
  }
  if (tag === 'A') {
    const lien = lienSur(element.getAttribute('href') || '');
    if (lien) style.lien = lien;
  }
  return style;
}

function passage(text, style) {
  const out = { t: text };
  for (const key of STYLE_KEYS) if (style[key]) out[key] = style[key];
  return out;
}

function collectInline(node, style, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      if (child.nodeValue) out.push(passage(child.nodeValue.replace(/ /g, ' ').replace(/\r\n?/g, '\n'), style));
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE || IGNORED_TAGS.has(child.tagName)) continue;
    if (child.tagName === 'BR') {
      out.push(passage('\n', style));
      continue;
    }
    if (BLOCK_TAGS.has(child.tagName) || LIST_TAGS.has(child.tagName) || child.tagName === 'LI') {
      if (out.length && !out[out.length - 1].t.endsWith('\n')) out.push(passage('\n', style));
    }
    collectInline(child, styleOf(child, style), out);
  }
  return out;
}

const sameStyle = (a, b) => STYLE_KEYS.every((key) => a[key] === b[key]);

export function normalizePassages(passages) {
  const out = [];
  for (const item of passages) {
    if (!item || typeof item.t !== 'string' || item.t === '') continue;
    const previous = out[out.length - 1];
    if (previous && sameStyle(previous, item)) previous.t += item.t;
    else out.push({ ...item });
  }
  return out;
}

function stripPlaceholderBreak(passages) {
  const last = passages[passages.length - 1];
  if (last && last.t.endsWith('\n')) {
    last.t = last.t.slice(0, -1);
    if (!last.t) passages.pop();
  }
  return passages;
}

function alignmentOf(element) {
  const align = (element.style?.textAlign || element.getAttribute('align') || '').toLowerCase();
  if (align === 'center') return 'centre';
  if (align === 'right' || align === 'end') return 'droite';
  return undefined;
}

function paragraph(passages, alignement) {
  const line = { genre: 'p', passages: stripPlaceholderBreak(normalizePassages(passages)) };
  if (alignement) line.alignement = alignement;
  return line;
}

function listLine(element) {
  const items = [];
  for (const child of element.childNodes) {
    if (child.nodeType !== ELEMENT_NODE || child.tagName !== 'LI') continue;
    items.push(stripPlaceholderBreak(normalizePassages(collectInline(child, styleOf(child, {}), []))));
  }
  return { genre: element.tagName === 'OL' ? 'ol' : 'ul', items: items.length ? items : [[]] };
}

const hasBlockChild = (element) =>
  [...element.childNodes].some(
    (child) => child.nodeType === ELEMENT_NODE && (BLOCK_TAGS.has(child.tagName) || LIST_TAGS.has(child.tagName))
  );

export function domToLines(root) {
  const lines = [];
  let pending = null;
  const flush = () => {
    if (pending) lines.push(paragraph(pending, undefined));
    pending = null;
  };
  for (const child of root.childNodes) {
    if (child.nodeType === ELEMENT_NODE && IGNORED_TAGS.has(child.tagName)) continue;
    if (child.nodeType === ELEMENT_NODE && LIST_TAGS.has(child.tagName)) {
      flush();
      lines.push(listLine(child));
      continue;
    }
    if (child.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)) {
      flush();
      if (hasBlockChild(child)) lines.push(...domToLines(child));
      else lines.push(paragraph(collectInline(child, styleOf(child, {}), []), alignmentOf(child)));
      continue;
    }
    if (!pending) pending = [];
    collectInline({ childNodes: [child] }, {}, pending);
  }
  flush();
  return lines.length ? lines : [{ genre: 'p', passages: [] }];
}

function appendPassages(parent, passages, doc) {
  for (const item of passages) {
    let node = doc.createDocumentFragment();
    item.t.split('\n').forEach((part, index) => {
      if (index > 0) node.appendChild(doc.createElement('br'));
      if (part) node.appendChild(doc.createTextNode(part));
    });
    const wrap = (tag) => {
      const element = doc.createElement(tag);
      element.appendChild(node);
      node = element;
      return element;
    };
    if (item.couleur || item.taille) {
      const span = wrap('span');
      if (item.couleur && PALETTE_VALUES.includes(item.couleur)) span.style.color = item.couleur;
      if (item.taille && SIZE_TO_CSS[item.taille]) span.style.fontSize = SIZE_TO_CSS[item.taille];
    }
    if (item.s) wrap('u');
    if (item.i) wrap('em');
    if (item.g) wrap('strong');
    if (item.lien && lienSur(item.lien)) wrap('a').setAttribute('href', item.lien);
    parent.appendChild(node);
  }
  const last = passages[passages.length - 1];
  if (!passages.length || (last && last.t.endsWith('\n'))) parent.appendChild(doc.createElement('br'));
}

export function linesToDom(lines, doc = document) {
  const fragment = doc.createDocumentFragment();
  for (const line of lines?.length ? lines : [{ genre: 'p', passages: [] }]) {
    if (line.genre === 'ul' || line.genre === 'ol') {
      const list = doc.createElement(line.genre);
      for (const item of line.items) {
        const li = doc.createElement('li');
        appendPassages(li, item, doc);
        list.appendChild(li);
      }
      fragment.appendChild(list);
      continue;
    }
    const p = doc.createElement('p');
    if (line.alignement === 'centre') p.style.textAlign = 'center';
    if (line.alignement === 'droite') p.style.textAlign = 'right';
    appendPassages(p, line.passages, doc);
    fragment.appendChild(p);
  }
  return fragment;
}
