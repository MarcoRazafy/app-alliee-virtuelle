import { Fragment, useState } from 'react';
import * as resourceService from '../../../services/resourceService';
import { PALETTE_VALUES, isExternalLink, isSafeEmbedUrl, lienSur } from '../../../utils/pageBlocks';
import { saveBlob } from '../../../utils/saveBlob';
import { notifyError } from '../../../utils/toast';
import PdfPageImages from '../PdfPageImages';
import { IconDownload, IconFileText } from '../../icons';
import '../../../styles/resource-page.css';

const ALIGN_CLASS = { centre: ' rp-align-centre', droite: ' rp-align-droite' };
const SIZE_CLASS = { petit: 'rp-taille-petit', grand: 'rp-taille-grand', 'tres-grand': 'rp-taille-tres-grand' };

const paletteStyle = (couleur) => (PALETTE_VALUES.includes(couleur) ? { color: couleur } : undefined);
const preventContextMenu = (event) => event.preventDefault();

function TextWithBreaks({ text }) {
  return text.split('\n').map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {part}
    </Fragment>
  ));
}

function Passage({ passage }) {
  let node = <TextWithBreaks text={passage.t} />;
  if (passage.couleur || passage.taille) {
    node = (
      <span className={SIZE_CLASS[passage.taille]} style={paletteStyle(passage.couleur)}>
        {node}
      </span>
    );
  }
  if (passage.s) node = <u>{node}</u>;
  if (passage.i) node = <em>{node}</em>;
  if (passage.g) node = <strong>{node}</strong>;
  const lien = passage.lien ? lienSur(passage.lien) : null;
  if (lien) {
    node = isExternalLink(lien) ? (
      <a href={lien} target="_blank" rel="noopener noreferrer">
        {node}
      </a>
    ) : (
      <a href={lien}>{node}</a>
    );
  }
  return node;
}

function Passages({ passages }) {
  return passages.map((passage, index) => <Passage key={index} passage={passage} />);
}

function TextBlockView({ block }) {
  return block.lignes.map((line, index) => {
    if (line.genre === 'ul' || line.genre === 'ol') {
      const List = line.genre;
      return (
        <List key={index} className="rp-list">
          {line.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <Passages passages={item} />
            </li>
          ))}
        </List>
      );
    }
    return (
      <p key={index} className={`rp-paragraph${ALIGN_CLASS[line.alignement] || ''}`}>
        {line.passages.length ? <Passages passages={line.passages} /> : <br />}
      </p>
    );
  });
}

function DocumentBlockView({ block, pageId, canDownload }) {
  const [downloading, setDownloading] = useState(false);
  const name = block.nom || 'Document PDF';

  async function download() {
    setDownloading(true);
    try {
      const blob = await resourceService.getPageMediaBlob(pageId, block.fichier);
      saveBlob(blob, /\.pdf$/i.test(name) ? name : `${name}.pdf`);
    } catch {
      notifyError('Téléchargement impossible');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="rp-document" aria-label={`Document : ${name}`}>
      <div className="rp-document-head">
        <span className="rp-document-icon" aria-hidden="true">
          <IconFileText />
        </span>
        <span className="rp-document-name">{name}</span>
        {canDownload && (
          <button type="button" className="btn-outline btn-sm" onClick={download} disabled={downloading}>
            <IconDownload /> {downloading ? 'Téléchargement…' : 'Télécharger'}
          </button>
        )}
      </div>
      <PdfPageImages fileId={pageId} pageMedia={block.fichier} className="rp-document-pages" />
    </section>
  );
}

function PageBlock({ block, pageId, canDownload }) {
  if (block.type === 'titre') {
    const Heading = block.niveau === 3 ? 'h3' : 'h2';
    return (
      <Heading className={`rp-titre rp-titre--h${block.niveau === 3 ? 3 : 2}${ALIGN_CLASS[block.alignement] || ''}`} style={paletteStyle(block.couleur)}>
        {block.texte}
      </Heading>
    );
  }
  if (block.type === 'texte') {
    return (
      <div className="rp-text">
        <TextBlockView block={block} />
      </div>
    );
  }
  if (block.type === 'photo') {
    return (
      <figure className="rp-photo">
        <img
          src={resourceService.pageMediaUrl(pageId, block.fichier)}
          alt={block.legende || ''}
          loading="lazy"
          draggable={false}
          onContextMenu={preventContextMenu}
        />
        {block.legende && <figcaption>{block.legende}</figcaption>}
      </figure>
    );
  }
  if (block.type === 'video' && block.source === 'fichier') {
    return (
      <div className="rp-video">
        <video
          src={resourceService.pageMediaUrl(pageId, block.fichier)}
          controls
          controlsList="nodownload noremoteplayback"
          disableRemotePlayback
          playsInline
          preload="metadata"
          onContextMenu={preventContextMenu}
        >
          Votre navigateur ne sait pas lire cette vidéo.
        </video>
      </div>
    );
  }
  if (block.type === 'document') return <DocumentBlockView block={block} pageId={pageId} canDownload={canDownload} />;
  if (block.type === 'video' && block.source === 'lien' && isSafeEmbedUrl(block.url)) {
    return (
      <div className="rp-embed">
        <iframe
          src={block.url}
          title="Vidéo intégrée"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  return null;
}

export default function PageBlocks({ blocks, pageId, canDownload = false }) {
  if (!blocks?.length) return <p className="rp-empty">Cette page est vide.</p>;
  return (
    <div className="rp-page">
      {blocks.map((block, index) => (
        <PageBlock key={index} block={block} pageId={pageId} canDownload={canDownload} />
      ))}
    </div>
  );
}
