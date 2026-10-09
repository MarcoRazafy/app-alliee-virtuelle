import { IconLink, IconListUl, IconListOl } from './icons';
import '../styles/markdown-toolbar.css';

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
    restoreSelection(start + marker.length, start + marker.length + inner.length);
  }

  function applyList({ prefix, sample }) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const lines = block ? block.split('\n') : [sample];
    const prefixed = lines.map((line, i) => `${prefix(i)}${line}`).join('\n');
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
