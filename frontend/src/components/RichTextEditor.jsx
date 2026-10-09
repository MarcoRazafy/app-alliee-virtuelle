import { useEffect, useRef } from 'react';
import { IconLink, IconListUl, IconListOl } from './icons';
import '../styles/rich-text-editor.css';
import { filesFromPaste } from '../utils/clipboardFiles';

const TEXT_TOOLS = [
  { cmd: 'bold', label: 'B', title: 'Gras', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italique', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Souligné', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', label: 'S', title: 'Barré', style: { textDecoration: 'line-through' } },
];

const ICON_TOOLS = [
  { cmd: 'link', title: 'Insérer un lien', Icon: IconLink },
  { cmd: 'insertUnorderedList', title: 'Liste à puces', Icon: IconListUl },
  { cmd: 'insertOrderedList', title: 'Liste numérotée', Icon: IconListOl },
];

export default function RichTextEditor({ value, onChange, placeholder = '', ariaLabel, onPasteFiles }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  function exec(cmd) {
    ref.current?.focus();
    try {
      window.document.execCommand('styleWithCSS', false, false);
    } catch {
    }
    if (cmd === 'link') {
      const url = window.prompt('Adresse du lien (https://…)');
      if (url) window.document.execCommand('createLink', false, url.trim());
    } else {
      window.document.execCommand(cmd, false, null);
    }
    onChange(ref.current?.innerHTML || '');
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Mise en forme du texte">
        {TEXT_TOOLS.map((tool) => (
          <button
            key={tool.cmd}
            type="button"
            className="rte-tool"
            title={tool.title}
            aria-label={tool.title}
            style={tool.style}
            onMouseDown={(e) => {
              e.preventDefault();
              exec(tool.cmd);
            }}
          >
            {tool.label}
          </button>
        ))}
        <span className="rte-sep" aria-hidden="true" />
        {ICON_TOOLS.map((tool) => (
          <button
            key={tool.cmd}
            type="button"
            className="rte-tool"
            title={tool.title}
            aria-label={tool.title}
            onMouseDown={(e) => {
              e.preventDefault();
              exec(tool.cmd);
            }}
          >
            <tool.Icon />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rte-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML || '')}
        onPaste={(event) => {
          if (!onPasteFiles) return;
          const files = filesFromPaste(event);
          if (files.length === 0) return;
          event.preventDefault();
          onPasteFiles(files);
        }}
      />
    </div>
  );
}
