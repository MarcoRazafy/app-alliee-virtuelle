import { IconLink, IconListUl, IconListOl } from './icons';
import '../styles/markdown-toolbar.css';

// Barre de mise en forme d'un <textarea> écrit en Markdown léger (rendu par <Markdown/>).
//
// Pourquoi un textarea et pas l'éditeur riche (RichTextEditor) utilisé ailleurs : ici le
// contenu doit rester du TEXTE BRUT. Les mentions y sont stockées sous la forme
// `@[Nom](uuid)` et leur autocomplétion repose sur selectionStart du textarea — un
// contentEditable n'a ni l'un ni l'autre, et les casserait toutes les deux.

const WRAPPERS = [
  { key: 'bold', label: 'B', title: 'Gras', marker: '**', sample: 'texte en gras', style: { fontWeight: 800 } },
  { key: 'italic', label: 'I', title: 'Italique', marker: '*', sample: 'texte en italique', style: { fontStyle: 'italic' } },
  { key: 'strike', label: 'S', title: 'Barré', marker: '~~', sample: 'texte barré', style: { textDecoration: 'line-through' } },
];

const LISTS = [
  { key: 'ul', title: 'Liste à puces', Icon: IconListUl, prefix: () => '- ', sample: 'élément' },
  { key: 'ol', title: 'Liste numérotée', Icon: IconListOl, prefix: (i) => `${i + 1}. `, sample: 'élément' },
];

export default function MarkdownToolbar({ targetRef, value, onChange, disabled = false }) {
  // Replace le curseur après le rendu de React : sans cela, il retomberait à la fin du
  // texte et enchaîner deux mises en forme deviendrait impossible.
  function restoreSelection(start, end) {
    requestAnimationFrame(() => {
      const el = targetRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  function applyWrap({ marker, sample }) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const inner = selected || sample;
    const next = `${value.slice(0, start)}${marker}${inner}${marker}${value.slice(end)}`;
    onChange(next);
    // Rien n'était sélectionné : on sélectionne l'exemple inséré, pour qu'il suffise de
    // taper par-dessus.
    restoreSelection(start + marker.length, start + marker.length + inner.length);
  }

  function applyList({ prefix, sample }) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    // On étend la sélection aux lignes entières : préfixer au milieu d'une ligne
    // produirait une puce en plein texte.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const lines = block ? block.split('\n') : [sample];
    const prefixed = lines.map((line, i) => `${prefix(i)}${line}`).join('\n');
    // Une ligne vide avant la liste : sans elle, le paragraphe qui précède l'absorberait.
    const needsBlank = lineStart > 0 && value[lineStart - 1] === '\n' && value[lineStart - 2] !== '\n';
    const separator = needsBlank ? '\n' : '';
    const next = `${value.slice(0, lineStart)}${separator}${prefixed}${value.slice(lineEnd)}`;
    onChange(next);
    const offset = lineStart + separator.length + prefixed.length;
    restoreSelection(offset, offset);
  }

  function applyLink() {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const url = window.prompt('Adresse du lien (https://…)');
    if (!url) return;
    const trimmed = url.trim();
    // Le rendu n'accepte que http(s) : on le dit tout de suite plutôt que d'insérer un
    // lien qui s'afficherait ensuite en texte brut.
    if (!/^https?:\/\//i.test(trimmed)) {
      window.alert('Le lien doit commencer par http:// ou https://');
      return;
    }
    const label = selected || 'texte du lien';
    const next = `${value.slice(0, start)}[${label}](${trimmed})${value.slice(end)}`;
    onChange(next);
    restoreSelection(start + 1, start + 1 + label.length);
  }

  return (
    <div className="md-toolbar" role="toolbar" aria-label="Mise en forme du texte">
      {WRAPPERS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          className="md-tool"
          title={tool.title}
          aria-label={tool.title}
          disabled={disabled}
          // mousedown plutôt que click : empêche le textarea de perdre le focus, donc
          // la sélection courante, avant que la commande ne s'applique.
          onMouseDown={(e) => {
            e.preventDefault();
            applyWrap(tool);
          }}
        >
          <span style={tool.style}>{tool.label}</span>
        </button>
      ))}

      <span className="md-tool-sep" aria-hidden="true" />

      {LISTS.map((tool) => (
        <button
          key={tool.key}
          type="button"
          className="md-tool"
          title={tool.title}
          aria-label={tool.title}
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            applyList(tool);
          }}
        >
          <tool.Icon />
        </button>
      ))}

      <button
        type="button"
        className="md-tool"
        title="Insérer un lien"
        aria-label="Insérer un lien"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          applyLink();
        }}
      >
        <IconLink />
      </button>
    </div>
  );
}
