import { Fragment } from 'react';

// Rend un texte BRUT tel qu'il a été écrit, en rendant seulement cliquables les adresses
// qu'il contient.
//
// À utiliser là où le rendu Markdown n'a pas lieu d'être : une remarque d'évaluation n'est
// pas un document, et y interpréter `**` ou `-` modifierait les mots de son auteur. Le texte
// passe par des nœuds React, jamais par du HTML injecté.

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
    // La ponctuation finale appartient à la phrase, pas à l'adresse.
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
