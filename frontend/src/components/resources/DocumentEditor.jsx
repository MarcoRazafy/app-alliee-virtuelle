import { useEffect, useRef, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { uploadPercent, uploadSizeError } from '../../utils/resourceMedia';
import {
  DOCUMENT_MEDIA_ACCEPT,
  documentMediaKind,
  escapeHtml,
  extractMediaIds,
  mediaHtml,
  mediaIdsToDelete,
} from '../../utils/documentMedia';
import { IconPaperclip, IconX } from '../icons';
import { filesFromPaste } from '../../utils/clipboardFiles';

const TOOLBAR = [
  { cmd: 'bold', label: 'G', title: 'Gras', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italique', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'S', title: 'Souligné', style: { textDecoration: 'underline' } },
  { block: 'H1', label: 'H1', title: 'Titre 1' },
  { block: 'H2', label: 'H2', title: 'Titre 2' },
  { block: 'P', label: '¶', title: 'Paragraphe' },
  { cmd: 'insertUnorderedList', label: '• Liste', title: 'Liste à puces' },
  { cmd: 'insertOrderedList', label: '1. Liste', title: 'Liste numérotée' },
];

function isEditorEmpty(editor) {
  if (!editor) return true;
  return editor.textContent.trim() === '' && !editor.querySelector('figure, img, video');
}

function DocumentEditor({ folderId, document: existing, onClose, onSaved }) {
  const editorRef = useRef(null);
  const mediaInputRef = useRef(null);
  const [title, setTitle] = useState(existing?.file_name || '');
  const [saving, setSaving] = useState(false);
  const [empty, setEmpty] = useState(true);
  const needsContent = Boolean(existing?.id && existing.content === undefined);
  const [loadingContent, setLoadingContent] = useState(needsContent);

  const initialIdsRef = useRef([]);
  const sessionIdsRef = useRef([]);
  const uploadsRef = useRef(new Map());
  const [uploadCount, setUploadCount] = useState(0);
  const savedRangeRef = useRef(null);
  const mountedRef = useRef(true);
  const targetFolderId = existing?.folder_id || folderId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function fill(html) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.innerHTML = html || '';
      initialIdsRef.current = extractMediaIds(html);
      setEmpty(isEditorEmpty(editor));
    }

    if (needsContent) {
      setLoadingContent(true);
      resourceService
        .getFile(existing.id)
        .then((full) => {
          if (!cancelled) fill(full.content);
        })
        .catch((err) => {
          if (cancelled) return;
          notifyError(err.response?.data?.error || 'Impossible de charger le document');
          onClose?.();
        })
        .finally(() => {
          if (!cancelled) setLoadingContent(false);
        });
    } else {
      fill(existing?.content || '');
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, needsContent]);

  useEffect(() => {
    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
    window.document.addEventListener('selectionchange', onSelectionChange);
    return () => window.document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  useEffect(() => {
    if (uploadCount === 0) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploadCount]);

  function exec(action) {
    editorRef.current?.focus();
    window.document.execCommand('defaultParagraphSeparator', false, 'p');
    if (action.block) {
      window.document.execCommand('formatBlock', false, action.block);
    } else {
      window.document.execCommand(action.cmd, false, null);
    }
  }

  function insertAtCaret(html) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    selection.removeAllRanges();
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.addRange(range);
    } else {
      const end = window.document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      selection.addRange(end);
    }
    window.document.execCommand('insertHTML', false, html);
    if (selection.rangeCount > 0) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    setEmpty(false);
  }

  async function uploadOne(file) {
    const kind = documentMediaKind(file.type);
    if (!kind) {
      notifyError(`« ${file.name} » : seules les photos, vidéos et PDF peuvent être insérés`);
      return;
    }
    const sizeError = uploadSizeError(file);
    if (sizeError) {
      notifyError(`« ${file.name} » : ${sizeError}`);
      return;
    }

    const token = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    insertAtCaret(
      `<figure class="resource-doc-media resource-doc-media--uploading" contenteditable="false" data-upload-token="${token}">` +
        `<span class="resource-doc-upload-label">Import de ${escapeHtml(file.name)}…</span></figure><p><br></p>`
    );
    const placeholder = () => editorRef.current?.querySelector(`[data-upload-token="${token}"]`);
    const controller = new AbortController();
    uploadsRef.current.set(token, controller);
    setUploadCount(uploadsRef.current.size);

    try {
      const media = await resourceService.uploadDocumentMedia(targetFolderId, file, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const percent = uploadPercent(loaded, total);
          const label = placeholder()?.querySelector('.resource-doc-upload-label');
          if (label && percent !== null) label.textContent = `Import de ${file.name}… ${percent} %`;
        },
      });
      sessionIdsRef.current.push(media.id);
      const node = placeholder();
      if (node) {
        const template = window.document.createElement('template');
        template.innerHTML = mediaHtml({ id: media.id, kind: media.kind, fileName: file.name });
        node.replaceWith(template.content.firstElementChild);
      }
    } catch (err) {
      placeholder()?.remove();
      if (!controller.signal.aborted) {
        notifyError(err.response?.data?.error || `Impossible d'importer « ${file.name} »`);
      }
    } finally {
      uploadsRef.current.delete(token);
      if (mountedRef.current) {
        setUploadCount(uploadsRef.current.size);
        setEmpty(isEditorEmpty(editorRef.current));
      }
    }
  }

  function handleMediaFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    files.forEach((file) => uploadOne(file));
  }

  function discardMedia(ids) {
    ids.forEach((id) => resourceService.deleteDocumentMedia(id).catch(() => {}));
  }

  function handleClose() {
    if (
      uploadsRef.current.size > 0 &&
      !window.confirm("Un import est en cours. Fermer l'éditeur l'abandonne. Continuer ?")
    ) {
      return;
    }
    uploadsRef.current.forEach((controller) => controller.abort());
    discardMedia(
      mediaIdsToDelete({ initialIds: initialIdsRef.current, sessionIds: sessionIdsRef.current, saved: false })
    );
    onClose?.();
  }

  async function handleSave() {
    if (uploadsRef.current.size > 0) {
      notifyError("Attendez la fin de l'import avant d'enregistrer");
      return;
    }
    const name = title.trim();
    if (name.length < 2) {
      notifyError('Le titre doit contenir au moins 2 caractères');
      return;
    }
    const editor = editorRef.current;
    editor?.querySelectorAll('[data-upload-token]').forEach((node) => node.remove());
    const content = editor?.innerHTML || '';
    setSaving(true);
    try {
      const saved = existing?.id
        ? await resourceService.updateDocument(existing.id, { file_name: name, content })
        : await resourceService.createDocument(targetFolderId, { file_name: name, content });
      notifySuccess(existing?.id ? 'Document mis à jour' : 'Document créé');
      discardMedia(
        mediaIdsToDelete({
          initialIds: initialIdsRef.current,
          sessionIds: sessionIdsRef.current,
          finalIds: extractMediaIds(content),
          saved: true,
        })
      );
      onSaved?.(saved);
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'enregistrer le document");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const busy = saving || loadingContent;

  return (
    <div className="resources-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div
        className="resources-modal resources-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={existing ? 'Modifier le document' : 'Nouveau document'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="resources-modal-head">
          <div>
            <p className="resources-modal-eyebrow">{existing ? 'Édition' : 'Nouveau document'}</p>
            <input
              className="resources-doc-title-input"
              placeholder="Titre du document"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <button type="button" className="resources-modal-close" onClick={handleClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        <div className="resources-editor-toolbar">
          {TOOLBAR.map((action) => (
            <button
              key={action.label}
              type="button"
              className="resources-editor-tool"
              title={action.title}
              style={action.style}
              disabled={loadingContent}
              onMouseDown={(e) => {
                e.preventDefault();
                exec(action);
              }}
            >
              {action.label}
            </button>
          ))}

          <input
            ref={mediaInputRef}
            type="file"
            hidden
            multiple
            accept={DOCUMENT_MEDIA_ACCEPT}
            onChange={handleMediaFiles}
          />
          <button
            type="button"
            className="resources-editor-tool resources-editor-tool--media"
            title="Insérer une photo, une vidéo ou un PDF à l'endroit du curseur"
            disabled={loadingContent}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => mediaInputRef.current?.click()}
          >
            <IconPaperclip /> Photo, vidéo, PDF
          </button>
        </div>

        <div className="resources-editor-surface-wrap">
          <div
            ref={editorRef}
            className={`resources-editor-surface resource-doc-render${empty ? ' resources-editor-surface--empty' : ''}`}
            data-placeholder="Commencez à écrire votre document…"
            contentEditable={!loadingContent}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            onInput={() => setEmpty(isEditorEmpty(editorRef.current))}
            onFocus={() => window.document.execCommand('defaultParagraphSeparator', false, 'p')}
            onPaste={(event) => {
              const pasted = filesFromPaste(event);
              if (pasted.length === 0) return;
              event.preventDefault();
              pasted.forEach((file) => uploadOne(file));
            }}
            onClick={(e) => {
              if (e.target.closest('a')) e.preventDefault();
            }}
          />
          {loadingContent && <div className="resources-editor-loading">Chargement du document…</div>}
        </div>

        <div className="resources-modal-foot">
          {uploadCount > 0 && (
            <span className="resources-editor-uploading">
              {uploadCount > 1 ? `${uploadCount} imports en cours…` : 'Import en cours…'}
            </span>
          )}
          <button type="button" className="btn-outline" onClick={handleClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={busy || uploadCount > 0}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
