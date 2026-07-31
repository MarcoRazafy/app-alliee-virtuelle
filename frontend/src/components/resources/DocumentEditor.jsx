import { useEffect, useRef, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconX } from '../icons';

// Éditeur de texte riche léger (contentEditable + document.execCommand), sans dépendance.
// Sert à créer ou modifier un document HTML stocké dans resources_files.content.
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

function DocumentEditor({ folderId, document: existing, onClose, onSaved }) {
  const editorRef = useRef(null);
  const [title, setTitle] = useState(existing?.file_name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = existing?.content || '<p>Commencez à écrire votre document…</p>';
    }
  }, [existing]);

  function exec(action) {
    editorRef.current?.focus();
    if (action.block) {
      window.document.execCommand('formatBlock', false, action.block);
    } else {
      window.document.execCommand(action.cmd, false, null);
    }
  }

  async function handleSave() {
    const name = title.trim();
    if (name.length < 2) {
      notifyError('Le titre doit contenir au moins 2 caractères');
      return;
    }
    const content = editorRef.current?.innerHTML || '';
    setSaving(true);
    try {
      if (existing?.id) {
        const updated = await resourceService.updateDocument(existing.id, { file_name: name, content });
        notifySuccess('Document mis à jour');
        onSaved?.(updated);
      } else {
        const created = await resourceService.createDocument(folderId, { file_name: name, content });
        notifySuccess('Document créé');
        onSaved?.(created);
      }
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'enregistrer le document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="resources-modal-backdrop" role="presentation" onMouseDown={onClose}>
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
          <button type="button" className="resources-modal-close" onClick={onClose} aria-label="Fermer">
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
              onMouseDown={(e) => {
                e.preventDefault();
                exec(action);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div
          ref={editorRef}
          className="resources-editor-surface resource-doc-render"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
        />

        <div className="resources-modal-foot">
          <button type="button" className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentEditor;
