import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import PageBlocks from '../components/resources/page/PageBlocks';
import { PageSkeleton } from '../components/Skeleton';
import * as resourceService from '../services/resourceService';
import { formatBytes } from '../utils/formatters';
import { IconArrowLeft, IconLock, IconPencil } from '../components/icons';
import '../styles/resources.css';
import '../styles/resource-page.css';

function siblingMeta(file) {
  if (file.kind === 'PAGE') return 'Page';
  if (file.kind === 'DOCUMENT') return 'Document';
  return [file.file_type, file.file_size ? formatBytes(file.file_size) : null].filter(Boolean).join(' · ');
}

function ResourcePageView({ admin = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const base = admin ? '/admin/resources' : '/resources';
  const [page, setPage] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError(null);
    resourceService
      .getFile(id)
      .then(async (file) => {
        if (cancelled) return;
        if (file.kind !== 'PAGE') {
          setError('Cette ressource n’est pas une page.');
          return;
        }
        setPage(file);
        const list = await resourceService.getFolderFiles(file.folder_id).catch(() => []);
        if (!cancelled) setSiblings(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.status === 404 ? 'Cette page est introuvable ou ne vous est pas accessible.' : 'Impossible de charger la page.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reopen = page ? { tab: page.folder_type, folderId: page.folder_id } : null;

  function openSibling(file) {
    if (file.kind === 'PAGE') navigate(`${base}/${file.id}`);
    else navigate(base, { state: { reopen: { ...reopen, fileId: file.id } } });
  }

  let content;
  if (error) {
    content = (
      <div className="rpv-main">
        <Link to={base} className="app-link rpv-back">
          <IconArrowLeft /> Retour aux ressources
        </Link>
        <div className="empty-state">{error}</div>
      </div>
    );
  } else if (!page) {
    content = <PageSkeleton variant="list" />;
  } else {
    content = (
      <div className="rpv-layout">
        <article className="rpv-main">
          <div className="rpv-head">
            <Link to={base} state={{ reopen }} className="app-link rpv-back">
              <IconArrowLeft /> Retour au dossier
            </Link>
            {admin && (
              <Link to={`/admin/resources/pages/${page.id}`} className="btn-outline btn-sm">
                <IconPencil /> Éditer
              </Link>
            )}
          </div>
          <p className="rpv-eyebrow">Page</p>
          <h1 className="rpv-title">{page.file_name}</h1>
          <p className="rpv-note">
            <IconLock /> Consultation réservée à l’équipe. Contenu protégé.
          </p>
          <div className="rpv-paper rp-paper">
            <PageBlocks blocks={page.blocks} pageId={page.id} canDownload={admin} />
          </div>
        </article>

        <aside className="rpv-side" aria-label="Ressources du dossier">
          <p className="rpv-side-eyebrow">Dossier</p>
          <p className="rpv-side-title">{page.folder_name}</p>
          <p className="rpv-side-count">
            {siblings.length} ressource{siblings.length > 1 ? 's' : ''}
          </p>
          <ol className="rpv-side-list">
            {siblings.map((file, index) => {
              const current = file.id === page.id;
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    className={`rpv-side-item${current ? ' rpv-side-item--active' : ''}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => openSibling(file)}
                  >
                    <span className="rpv-side-num">{index + 1}</span>
                    <span className="rpv-side-text">
                      <span className="rpv-side-name">{file.file_name}</span>
                      <span className="rpv-side-meta">{siblingMeta(file)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    );
  }

  if (admin) return content;
  return (
    <EmployeeLayout
      title="Ressources"
      breadcrumb={[
        { label: 'Accueil', to: '/dashboard' },
        { label: 'Ressources', to: '/resources' },
        { label: page?.file_name || 'Page' },
      ]}
    >
      {content}
    </EmployeeLayout>
  );
}

export default ResourcePageView;
