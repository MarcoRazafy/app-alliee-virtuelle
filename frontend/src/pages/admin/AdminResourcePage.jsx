import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as resourceService from '../../services/resourceService';
import PageEditor from '../../components/resources/page-editor/PageEditor';
import { PageSkeleton } from '../../components/Skeleton';
import { documentLabel, isDocumentFile, isPhotoFile, isVideoFile, serializeBlocks, withKeys } from '../../utils/pageBlocks';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconArrowLeft } from '../../components/icons';
import '../../styles/resources.css';
import '../../styles/resource-page.css';

function errorMessage(err, fallback) {
  if (!err.response) return `${fallback} : connexion au serveur impossible. Vérifiez votre connexion et réessayez.`;
  if (err.response.status >= 500) return `${fallback} : erreur du serveur. Réessayez dans un instant.`;
  return err.response.data?.error || `${fallback}.`;
}

function AdminResourcePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const newFolderId = searchParams.get('dossier');
  const newFolderTab = searchParams.get('onglet') || 'INTERNE';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(isNew && !newFolderId ? 'Choisissez d’abord un dossier dans Ressources.' : null);
  const [page, setPage] = useState(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const previews = useRef(new Set());

  const uploading = blocks.some((block) => block.progression != null);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    setLoading(true);
    resourceService
      .getFile(id)
      .then((file) => {
        if (cancelled) return;
        if (file.kind !== 'PAGE') {
          setLoadError('Cette ressource est un fichier : elle ne s’ouvre pas dans l’éditeur de pages.');
          return;
        }
        setPage(file);
        setTitle(file.file_name);
        setBlocks(withKeys(file.blocks));
        setDirty(false);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Impossible de charger la page'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!dirty && !uploading) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uploading]);

  const changeBlocks = useCallback((updater) => {
    setBlocks(updater);
    setDirty(true);
    setSaveError(null);
  }, []);

  const patchBlock = useCallback((cle, partial) => {
    setBlocks((current) => current.map((block) => (block.cle === cle ? { ...block, ...partial } : block)));
  }, []);

  const uploadFile = useCallback(
    (cle, file) => {
      const target = blocks.find((block) => block.cle === cle);
      const expected = target?.type;
      if (expected === 'photo' && !isPhotoFile(file)) {
        notifyError('Ce bloc attend une photo : JPEG, PNG, WebP ou GIF.');
        return;
      }
      if (expected === 'video' && !isVideoFile(file)) {
        notifyError('Ce bloc attend une vidéo : MP4, WebM ou MOV.');
        return;
      }
      if (expected === 'document' && !isDocumentFile(file)) {
        notifyError('Ce bloc attend un document PDF.');
        return;
      }
      const isDocument = expected ? expected === 'document' : isDocumentFile(file);
      if (target?.apercu) URL.revokeObjectURL(target.apercu);
      const apercu = isDocument ? null : URL.createObjectURL(file);
      if (apercu) previews.current.add(apercu);
      setDirty(true);
      setSaveError(null);
      patchBlock(cle, { fichier: '', apercu, progression: 0, erreur: null, ...(isDocument ? { nom: documentLabel(file.name) } : {}) });
      resourceService
        .uploadPageMedia(file, (loaded, total) => {
          if (total) patchBlock(cle, { progression: Math.min(99, Math.round((loaded / total) * 100)) });
        })
        .then(({ jeton }) => patchBlock(cle, { fichier: jeton, progression: null }))
        .catch((err) => {
          if (apercu) {
            URL.revokeObjectURL(apercu);
            previews.current.delete(apercu);
          }
          patchBlock(cle, {
            apercu: null,
            progression: null,
            erreur: errorMessage(err, "L'envoi du fichier a échoué"),
          });
        });
    },
    [blocks, patchBlock]
  );

  const folderId = isNew ? newFolderId : page?.folder_id;
  const folderTab = isNew ? newFolderTab : page?.folder_type || 'INTERNE';

  function goBack() {
    if ((dirty || uploading) && !window.confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')) return;
    navigate('/admin/resources', { state: folderId ? { reopen: { tab: folderTab, folderId } } : undefined });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (uploading || saving) return;
    if (!title.trim()) {
      setSaveError('Le titre de la page est obligatoire.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { file_name: title.trim(), blocks: JSON.stringify(serializeBlocks(blocks)) };
      const saved = isNew ? await resourceService.createPage(newFolderId, payload) : await resourceService.updatePage(id, payload);
      setDirty(false);
      notifySuccess('Page enregistrée');
      if (isNew) {
        navigate(`/admin/resources/pages/${saved.id}`, { replace: true });
        return;
      }
      setPage((current) => ({ ...current, ...saved }));
      setBlocks(withKeys(saved.blocks));
    } catch (err) {
      setSaveError(errorMessage(err, 'Impossible d’enregistrer la page'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton variant="list" />;

  if (loadError) {
    return (
      <div className="rpe-page">
        <Link to="/admin/resources" className="app-link">
          <IconArrowLeft /> Retour aux ressources
        </Link>
        <div className="empty-state">{loadError}</div>
      </div>
    );
  }

  return (
    <form
      className="rpe-page"
      onSubmit={handleSave}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
      }}
    >
      <div className="rpe-page-head">
        <button type="button" className="app-link rpe-back" onClick={goBack}>
          <IconArrowLeft /> Retour aux ressources
        </button>
        <div className="rpe-page-actions">
          {uploading && <span className="rpe-page-hint">Envoi en cours, patientez…</span>}
          {!uploading && dirty && <span className="rpe-page-hint">Modifications non enregistrées</span>}
          <button type="submit" className="btn-primary" disabled={saving || uploading}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <p className="rpe-eyebrow">{isNew ? 'Nouvelle page' : 'Modifier la page'}</p>
      <input
        className="rpe-page-title"
        value={title}
        maxLength={255}
        required
        placeholder="Titre de la page"
        aria-label="Titre de la page (obligatoire)"
        onChange={(event) => {
          setTitle(event.target.value);
          setDirty(true);
          setSaveError(null);
        }}
      />

      {saveError && (
        <p className="rpe-save-error" role="alert">
          {saveError}
        </p>
      )}

      <PageEditor blocks={blocks} onBlocksChange={changeBlocks} pageId={page?.id} onUploadFile={uploadFile} />
    </form>
  );
}

export default AdminResourcePage;
