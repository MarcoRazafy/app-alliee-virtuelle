import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s<]+)/g;

export function linkifyText(text) {
  const source = String(text ?? '');
  const nodes = [];
  const re = new RegExp(URL_RE.source, 'g');
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(source)) !== null) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    const trailing = (match[0].match(/[.,;:!?)\]]+$/) || [''])[0];
    const url = trailing ? match[0].slice(0, -trailing.length) : match[0];
    nodes.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="auto-link">
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

export default function Linkify({ text }) {
  return (
    <>
      {linkifyText(text).map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}
