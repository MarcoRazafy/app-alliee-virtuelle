import { Fragment } from 'react';

/* Rendu Markdown léger (l'assistant renvoie du markdown : **gras**, *italique*,
   `code`, listes à puces / numérotées). Partagé par les assistants IA admin et employé. */

function parseInline(text) {
  const nodes = [];
  const re = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|\*([^*]+?)\*|_([^_]+?)_)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4] != null) nodes.push(<code key={k++}>{m[4]}</code>);
    else if (m[5] != null) nodes.push(<em key={k++}>{m[5]}</em>);
    else if (m[6] != null) nodes.push(<em key={k++}>{m[6]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text, className = 'ai-md' }) {
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
                  {parseInline(l)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (blk.t === 'ul') {
          return (
            <ul key={i} className="ai-md-list">
              {blk.items.map((it, j) => (
                <li key={j}>{parseInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="ai-md-list">
            {blk.items.map((it, j) => (
              <li key={j}>{parseInline(it)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

export default Markdown;
