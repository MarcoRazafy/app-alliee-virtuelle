import { Fragment } from 'react';

/* Rendu Markdown léger (l'assistant renvoie du markdown : **gras**, *italique*,
   `code`, listes à puces / numérotées). Partagé par les assistants IA admin et employé. */

// L'ORDRE des alternatives compte : une mention `@[Nom](uuid)` ressemble à s'y méprendre à
// un lien `[texte](url)`. Elle est donc reconnue en premier, et un lien exige un http(s)://
// — sans quoi un identifiant serait pris pour une adresse (et un `javascript:` pourrait
// passer, puisque l'URL finit dans un href).
const INLINE_RE =
  /(@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|`([^`]+?)`|\*([^*]+?)\*|_([^_]+?)_)/g;

// `renderMention(name, userId, key)` : fourni par les commentaires de tâche, où une mention
// est un bouton cliquable. Sans lui (assistants IA), une mention retombe sur « @Nom ».
function parseInline(text, renderMention) {
  const nodes = [];
  const re = new RegExp(INLINE_RE.source, 'g');
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) {
      nodes.push(renderMention ? renderMention(m[2], m[3], k++) : `@${m[2]}`);
    } else if (m[4] != null) {
      nodes.push(
        <a key={k++} href={m[5]} target="_blank" rel="noopener noreferrer">
          {m[4]}
        </a>
      );
    } else if (m[6] != null) nodes.push(<strong key={k++}>{m[6]}</strong>);
    else if (m[7] != null) nodes.push(<strong key={k++}>{m[7]}</strong>);
    else if (m[8] != null) nodes.push(<s key={k++}>{m[8]}</s>);
    else if (m[9] != null) nodes.push(<code key={k++}>{m[9]}</code>);
    else if (m[10] != null) nodes.push(<em key={k++}>{m[10]}</em>);
    else if (m[11] != null) nodes.push(<em key={k++}>{m[11]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text, className = 'ai-md', renderMention }) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', lines: para });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.t !== 'ul') {
        flushList();
        list = { t: 'ul', items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (!list || list.t !== 'ol') {
        flushList();
        list = { t: 'ol', items: [] };
      }
      list.items.push(numbered[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  });
  flushPara();
  flushList();

  return (
    <div className={className}>
      {blocks.map((blk, i) => {
        if (blk.t === 'p') {
          return (
            <p key={i} className="ai-md-p">
              {blk.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {parseInline(l, renderMention)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (blk.t === 'ul') {
          return (
            <ul key={i} className="ai-md-list">
              {blk.items.map((it, j) => (
                <li key={j}>{parseInline(it, renderMention)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="ai-md-list">
            {blk.items.map((it, j) => (
              <li key={j}>{parseInline(it, renderMention)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

export default Markdown;
