import { useLayoutEffect, useRef, useState } from 'react';
import { domToLines, linesToDom } from '../../../utils/pageRichText';
import { isLinesEmpty, lienSur } from '../../../utils/pageBlocks';
import { notifyError } from '../../../utils/toast';
import { ToolButton, ColorPicker, SizePicker } from './EditorControls';
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconLink,
  IconListUl,
  IconListOl,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
} from '../../icons';

const FONT_SIZE_COMMAND = { petit: '2', '': '3', grand: '5', 'tres-grand': '6' };
const SHORTCUTS = { b: 'bold', i: 'italic', u: 'underline' };

export default function TextBlock({ block, onChange }) {
  const editableRef = useRef(null);
  const savedRange = useRef(null);
  const [empty, setEmpty] = useState(() => isLinesEmpty(block.lignes));
  const [formats, setFormats] = useState({});

  useLayoutEffect(() => {
    editableRef.current.replaceChildren(linesToDom(block.lignes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const lines = domToLines(editableRef.current);
    setEmpty(isLinesEmpty(lines));
    onChange({ lignes: lines });
    return lines;
  }

  function closestLink() {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const link = element?.closest('a');
    return link && editableRef.current.contains(link) ? link : null;
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editableRef.current.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
    setFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
      center: document.queryCommandState('justifyCenter'),
      right: document.queryCommandState('justifyRight'),
      link: Boolean(closestLink()),
    });
  }

  function restoreSelection() {
    if (!savedRange.current) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange.current);
  }

  function exec(command, value = null) {
    editableRef.current.focus();
    restoreSelection();
    document.execCommand('styleWithCSS', false, command === 'foreColor' || command === 'fontSize');
    document.execCommand(command, false, value);
    sync();
    rememberSelection();
  }

  function toggleLink() {
    if (closestLink()) {
      exec('unlink');
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !editableRef.current.contains(selection.anchorNode)) {
      notifyError("Sélectionnez d'abord le texte à transformer en lien.");
      return;
    }
    rememberSelection();
    const typed = window.prompt('Adresse du lien (https://…, mailto:…, tel:… ou /page)');
    if (typed === null) return;
    const href = lienSur(typed);
    if (!href) {
      notifyError('Adresse de lien invalide : utilisez https://…, mailto:…, tel:… ou un chemin commençant par /.');
      return;
    }
    exec('createLink', href);
  }

  function pickColor(color) {
    exec('foreColor', color || window.getComputedStyle(editableRef.current).color);
  }

  function handleKeyDown(event) {
    const command = SHORTCUTS[event.key.toLowerCase()];
    if ((event.ctrlKey || event.metaKey) && !event.altKey && command) {
      event.preventDefault();
      exec(command);
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    document.execCommand('styleWithCSS', false, false);
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .forEach((line, index) => {
        if (index > 0) document.execCommand('insertParagraph');
        if (line) document.execCommand('insertText', false, line);
      });
    sync();
  }

  function handleDrop(event) {
    if ([...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    const text = event.dataTransfer.getData('text/plain');
    if (!text) return;
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
    sync();
  }

  function handleBlur() {
    const lines = sync();
    editableRef.current.replaceChildren(linesToDom(lines));
  }

  return (
    <div className="rpe-text-block">
      <div className="rpe-toolbar" role="toolbar" aria-label="Mise en forme du texte">
        <ToolButton label="Gras (Ctrl+B)" active={formats.bold} onClick={() => exec('bold')}>
          <IconBold />
        </ToolButton>
        <ToolButton label="Italique (Ctrl+I)" active={formats.italic} onClick={() => exec('italic')}>
          <IconItalic />
        </ToolButton>
        <ToolButton label="Souligné (Ctrl+U)" active={formats.underline} onClick={() => exec('underline')}>
          <IconUnderline />
        </ToolButton>
        <ToolButton label={formats.link ? 'Retirer le lien' : 'Ajouter un lien'} active={formats.link} onClick={toggleLink}>
          <IconLink />
        </ToolButton>
        <span className="rpe-toolbar-sep" aria-hidden="true" />
        <ToolButton label="Liste à puces" active={formats.ul} onClick={() => exec('insertUnorderedList')}>
          <IconListUl />
        </ToolButton>
        <ToolButton label="Liste numérotée" active={formats.ol} onClick={() => exec('insertOrderedList')}>
          <IconListOl />
        </ToolButton>
        <span className="rpe-toolbar-sep" aria-hidden="true" />
        <ToolButton label="Aligner à gauche" active={!formats.center && !formats.right} onClick={() => exec('justifyLeft')}>
          <IconAlignLeft />
        </ToolButton>
        <ToolButton label="Centrer" active={formats.center} onClick={() => exec('justifyCenter')}>
          <IconAlignCenter />
        </ToolButton>
        <ToolButton label="Aligner à droite" active={formats.right} onClick={() => exec('justifyRight')}>
          <IconAlignRight />
        </ToolButton>
        <span className="rpe-toolbar-sep" aria-hidden="true" />
        <ColorPicker label="Couleur du texte" onPick={pickColor} />
        <SizePicker onPick={(size) => exec('fontSize', FONT_SIZE_COMMAND[size])} />
      </div>
      <div
        ref={editableRef}
        className={`rpe-text-editable rp-text${empty ? ' is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Texte du bloc"
        data-placeholder="Écrivez votre texte…"
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        onInput={sync}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragStart={(event) => event.preventDefault()}
      />
    </div>
  );
}
