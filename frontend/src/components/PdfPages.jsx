import { useEffect, useRef, useState } from 'react';
import '../styles/pdf-pages.css';

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

export function useNearViewport(ref) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { root: ref.current.closest('.pdf-pages'), rootMargin: '800px 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return near;
}

function PdfPage({ pdf, number, width, height, total }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const visible = useNearViewport(wrapRef);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    let renderTask = null;
    pdf
      .getPage(number)
      .then((page) => {
        if (cancelled || !wrapRef.current || !canvasRef.current) return null;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (wrapRef.current.clientWidth / width) * pixelRatio });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        return renderTask.promise;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [visible, pdf, number, width]);

  return (
    <div ref={wrapRef} className="pdf-page" style={{ aspectRatio: `${width} / ${height}` }}>
      <canvas ref={canvasRef} className="pdf-page-canvas" aria-label={`Page ${number} sur ${total}`} />
      <span className="pdf-page-number">
        {number} / {total}
      </span>
    </div>
  );
}

export default function PdfPages({ url, className = '' }) {
  const [pdf, setPdf] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    setPdf(null);
    setPages([]);
    setError(null);

    loadPdfjs()
      .then((pdfjs) => {
        loadingTask = pdfjs.getDocument({ url, isEvalSupported: false });
        return loadingTask.promise;
      })
      .then(async (doc) => {
        const sizes = [];
        for (let number = 1; number <= doc.numPages; number += 1) {
          const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
          sizes.push({ number, width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setPdf(doc);
        setPages(sizes);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible d'afficher ce PDF.");
      });

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [url]);

  return (
    <div className={`pdf-pages${className ? ` ${className}` : ''}`}>
      {error && <p className="pdf-pages-status">{error}</p>}
      {!error && !pdf && <p className="pdf-pages-status">Chargement du PDF…</p>}
      {pdf &&
        pages.map((page) => (
          <PdfPage key={page.number} pdf={pdf} total={pages.length} {...page} />
        ))}
    </div>
  );
}
