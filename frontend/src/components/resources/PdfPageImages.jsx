import { useEffect, useRef, useState } from 'react';
import * as resourceService from '../../services/resourceService';
import { useNearViewport } from '../PdfPages';
import '../../styles/pdf-pages.css';

function PageImage({ fileId, media, number, width, height, total }) {
  const wrapRef = useRef(null);
  const near = useNearViewport(wrapRef);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!near) return undefined;
    let cancelled = false;
    let objectUrl = null;
    resourceService
      .getPdfPageBlob(fileId, number, { media })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [near, fileId, media, number]);

  return (
    <div ref={wrapRef} className="pdf-page" style={{ aspectRatio: `${width} / ${height}` }}>
      {src && <img className="pdf-page-image" src={src} alt={`Page ${number} sur ${total}`} draggable={false} />}
      {failed && <span className="pdf-page-failed">Page indisponible</span>}
      <span className="pdf-page-number">
        {number} / {total}
      </span>
    </div>
  );
}

export default function PdfPageImages({ fileId, media = false, className = '' }) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPages(null);
    setError(null);
    resourceService
      .getPdfPagesInfo(fileId, { media })
      .then((data) => {
        if (!cancelled) setPages(data.pages || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Impossible d'afficher ce PDF.");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, media]);

  return (
    <div
      className={`pdf-pages pdf-pages--protected${className ? ` ${className}` : ''}`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {error && <p className="pdf-pages-status">{error}</p>}
      {!error && !pages && <p className="pdf-pages-status">Chargement du document…</p>}
      {pages &&
        pages.map((page, index) => (
          <PageImage
            key={index + 1}
            fileId={fileId}
            media={media}
            number={index + 1}
            total={pages.length}
            width={page.width}
            height={page.height}
          />
        ))}
    </div>
  );
}
