import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDragLayer, useDrop } from 'react-dnd';
import { HTML5Backend, NativeTypes } from 'react-dnd-html5-backend';
import {
  MAX_BLOCKS,
  MAX_TEXT_CHARS,
  isDocumentFile,
  isLinesEmpty,
  isPhotoFile,
  isVideoFile,
  newBlock,
  textLength,
} from '../../../utils/pageBlocks';
import { notifyError } from '../../../utils/toast';
import TextBlock from './TextBlock';
import { TitleBlock, PhotoBlock, VideoBlock, DocumentBlock } from './BlockEditors';
import { IconGrip, IconArrowUp, IconArrowDown, IconTrash, IconImage, IconVideo, IconFileText, IconPaperclip, IconPlus } from '../../icons';
import '../../../styles/resource-page.css';

const ITEM_BLOCK = 'page-bloc';
const ITEM_PALETTE = 'page-palette';
const LABELS = { titre: 'Titre', texte: 'Texte', photo: 'Photo', video: 'Vidéo', document: 'Document' };

function TitleGlyph() {
  return (
    <span className="rpe-glyph" aria-hidden="true">
      T
    </span>
  );
}

const BLOCK_TYPES = [
  { type: 'titre', Icon: TitleGlyph },
  { type: 'texte', Icon: IconFileText },
  { type: 'photo', Icon: IconImage },
  { type: 'video', Icon: IconVideo },
  { type: 'document', Icon: IconPaperclip },
];

function blockTypeFor(file) {
  if (isPhotoFile(file)) return 'photo';
  if (isVideoFile(file)) return 'video';
  if (isDocumentFile(file)) return 'document';
  return null;
}

function hasContent(block) {
  if (block.type === 'titre') return Boolean(block.texte.trim());
  if (block.type === 'texte') return !isLinesEmpty(block.lignes);
  if (block.type === 'photo') return Boolean(block.fichier || block.apercu || (block.legende || '').trim());
  if (block.type === 'document') return Boolean(block.fichier || (block.nom || '').trim());
  return Boolean(block.fichier || block.apercu || (block.url || '').trim());
}

function PaletteItem({ type, Icon, onAdd }) {
  const label = LABELS[type];
  const [{ isDragging }, drag] = useDrag({
    type: ITEM_PALETTE,
    item: { blockType: type },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  return (
    <button
      ref={drag}
      type="button"
      className={`rpe-palette-item${isDragging ? ' is-dragging' : ''}`}
      onClick={() => onAdd(type)}
      aria-label={`Ajouter un bloc ${label} à la fin, ou le glisser à l'endroit voulu`}
      title="Cliquez pour ajouter à la fin, ou glissez à l'endroit voulu"
    >
      <Icon />
      {label}
    </button>
  );
}

function BlockFrame({ block, index, total, onMove, onRemove, handleRef, children }) {
  const label = LABELS[block.type];
  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_BLOCK,
    item: { cle: block.cle },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  const { cle } = block;
  const setHandle = useCallback(
    (node) => {
      drag(node);
      handleRef(cle, node);
    },
    [drag, handleRef, cle]
  );
  return (
    <section
      ref={preview}
      data-block-key={block.cle}
      className={`rpe-block${isDragging ? ' rpe-block--dragging' : ''}`}
      aria-label={`Bloc ${label}, ${index + 1} sur ${total}`}
    >
      <div className="rpe-block-bar">
        <button
          ref={setHandle}
          type="button"
          className="rpe-handle"
          aria-label={`Déplacer le bloc ${label} : glisser, ou flèches haut et bas`}
          title="Glissez pour déplacer, ou utilisez les flèches ↑ ↓"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            onMove(index, event.key === 'ArrowUp' ? -1 : 1, true);
          }}
        >
          <IconGrip />
        </button>
        <span className="rpe-block-label">{label}</span>
        <span className="rpe-block-actions">
          <button type="button" className="rpe-icon-btn" aria-label="Monter le bloc" title="Monter" disabled={index === 0} onClick={() => onMove(index, -1)}>
            <IconArrowUp />
          </button>
          <button
            type="button"
            className="rpe-icon-btn"
            aria-label="Descendre le bloc"
            title="Descendre"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            <IconArrowDown />
          </button>
          <button type="button" className="rpe-icon-btn rpe-icon-btn--danger" aria-label="Retirer le bloc" title="Retirer" onClick={() => onRemove(index)}>
            <IconTrash />
          </button>
        </span>
      </div>
      <div className="rpe-block-body">{children}</div>
    </section>
  );
}

function EditorBody({ blocks, onBlocksChange, pageId, onUploadFile }) {
  const listRef = useRef(null);
  const handles = useRef(new Map());
  const [insertAt, setInsertAt] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const dragging = useDragLayer((monitor) => monitor.isDragging());

  useEffect(() => {
    if (!focusKey) return;
    handles.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey, blocks]);

  const handleRef = useCallback((cle, node) => {
    if (node) handles.current.set(cle, node);
    else handles.current.delete(cle);
  }, []);

  const patch = (cle, partial) => onBlocksChange((current) => current.map((block) => (block.cle === cle ? { ...block, ...partial } : block)));

  function indexAt(y) {
    const nodes = listRef.current ? [...listRef.current.querySelectorAll(':scope > [data-block-key]')] : [];
    const found = nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    return found === -1 ? nodes.length : found;
  }

  function insertBlocks(index, created) {
    if (blocks.length + created.length > MAX_BLOCKS) {
      notifyError(`Une page compte au plus ${MAX_BLOCKS} blocs.`);
      return false;
    }
    onBlocksChange((current) => [...current.slice(0, index), ...created, ...current.slice(index)]);
    return true;
  }

  function move(index, delta, fromKeyboard = false) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const moved = blocks[index];
    onBlocksChange((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setAnnouncement(`Bloc ${LABELS[moved.type]} déplacé en position ${target + 1} sur ${blocks.length}.`);
    if (fromKeyboard) setFocusKey(moved.cle);
  }

  function moveTo(cle, index) {
    const from = blocks.findIndex((block) => block.cle === cle);
    if (from === -1) return;
    const target = from < index ? index - 1 : index;
    if (target === from) return;
    onBlocksChange((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      return next;
    });
    setAnnouncement(`Bloc ${LABELS[blocks[from].type]} déplacé en position ${target + 1} sur ${blocks.length}.`);
  }

  function remove(index) {
    const block = blocks[index];
    if (hasContent(block) && !window.confirm(`Retirer ce bloc ${LABELS[block.type]} ?`)) return;
    if (block.apercu) URL.revokeObjectURL(block.apercu);
    onBlocksChange((current) => current.filter((item) => item.cle !== block.cle));
    setAnnouncement(`Bloc ${LABELS[block.type]} retiré.`);
  }

  function dropFiles(files, index, offset) {
    const supported = files.filter((file) => blockTypeFor(file));
    if (supported.length < files.length) {
      notifyError('Seuls les photos (JPEG, PNG, WebP, GIF), les vidéos (MP4, WebM, MOV) et les documents PDF peuvent être déposés.');
    }
    if (!supported.length) return;
    const element = offset ? document.elementFromPoint(offset.x, offset.y)?.closest('[data-block-key]') : null;
    const target = element ? blocks.find((block) => block.cle === element.dataset.blockKey) : null;
    if (target && supported.length === 1 && !target.fichier && !target.apercu) {
      const [file] = supported;
      const type = blockTypeFor(file);
      const fits = target.type === type && !(type === 'video' && target.source === 'lien');
      if (fits) {
        onUploadFile(target.cle, file);
        return;
      }
    }
    const created = supported.map((file) => ({ block: newBlock(blockTypeFor(file)), file }));
    if (!insertBlocks(index, created.map((item) => item.block))) return;
    created.forEach(({ block, file }) => onUploadFile(block.cle, file));
  }

  const [{ isOver }, drop] = useDrop(
    {
      accept: [ITEM_BLOCK, ITEM_PALETTE, NativeTypes.FILE],
      hover: (item, monitor) => {
        const offset = monitor.getClientOffset();
        if (offset) setInsertAt(indexAt(offset.y));
      },
      drop: (item, monitor) => {
        const offset = monitor.getClientOffset();
        const index = offset ? indexAt(offset.y) : blocks.length;
        const type = monitor.getItemType();
        if (type === ITEM_BLOCK) moveTo(item.cle, index);
        else if (type === ITEM_PALETTE) insertBlocks(index, [newBlock(item.blockType)]);
        else dropFiles([...(item.files || [])], index, offset);
        setInsertAt(null);
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    },
    [blocks]
  );

  function renderBlock(block) {
    const onChange = (partial) => patch(block.cle, partial);
    const onPickFile = (file) => onUploadFile(block.cle, file);
    if (block.type === 'titre') return <TitleBlock block={block} onChange={onChange} />;
    if (block.type === 'texte') return <TextBlock block={block} onChange={onChange} />;
    if (block.type === 'photo') return <PhotoBlock block={block} pageId={pageId} onChange={onChange} onPickFile={onPickFile} />;
    if (block.type === 'document') return <DocumentBlock block={block} onChange={onChange} onPickFile={onPickFile} />;
    return <VideoBlock block={block} pageId={pageId} onChange={onChange} onPickFile={onPickFile} />;
  }

  const chars = textLength(blocks);
  const addAtEnd = (type) => insertBlocks(blocks.length, [newBlock(type)]);

  return (
    <div className={`rpe-editor${dragging ? ' rpe-editor--dragging' : ''}`}>
      <div className="rpe-palette" role="toolbar" aria-label="Palette de blocs">
        <span className="rpe-palette-title">Blocs</span>
        {BLOCK_TYPES.map(({ type, Icon }) => (
          <PaletteItem key={type} type={type} Icon={Icon} onAdd={addAtEnd} />
        ))}
        <span className={`rpe-counter${blocks.length > MAX_BLOCKS || chars > MAX_TEXT_CHARS ? ' rpe-counter--over' : ''}`}>
          {blocks.length}/{MAX_BLOCKS} blocs · {chars.toLocaleString('fr-FR')}/{MAX_TEXT_CHARS.toLocaleString('fr-FR')} caractères
        </span>
      </div>

      <div ref={drop} className={`rpe-canvas${isOver ? ' rpe-canvas--over' : ''}`}>
        <div ref={listRef} className="rpe-blocks">
          {blocks.map((block, index) => (
            <Fragment key={block.cle}>
              {isOver && insertAt === index && <div className="rpe-drop-indicator" aria-hidden="true" />}
              <BlockFrame block={block} index={index} total={blocks.length} onMove={move} onRemove={remove} handleRef={handleRef}>
                {renderBlock(block)}
              </BlockFrame>
            </Fragment>
          ))}
          {isOver && insertAt === blocks.length && <div className="rpe-drop-indicator" aria-hidden="true" />}
        </div>
        {!blocks.length && (
          <p className="rpe-canvas-empty">
            Votre page est vide. Ajoutez un premier bloc avec les boutons ci-dessous, glissez-en un depuis la palette, ou déposez ici
            des photos, des vidéos et des documents PDF.
          </p>
        )}
      </div>

      <div className="rpe-add-bar" role="group" aria-label="Ajouter un bloc à la fin">
        {BLOCK_TYPES.map(({ type }) => (
          <button key={type} type="button" className="btn-outline btn-sm" onClick={() => addAtEnd(type)}>
            <IconPlus /> {LABELS[type]}
          </button>
        ))}
      </div>

      <p className="rpe-sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export default function PageEditor(props) {
  return (
    <DndProvider backend={HTML5Backend}>
      <EditorBody {...props} />
    </DndProvider>
  );
}
