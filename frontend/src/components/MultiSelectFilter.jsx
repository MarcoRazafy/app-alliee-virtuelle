import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { matchesTerms } from '../utils/textSearch';

// Au-delà de ce nombre d'options, une recherche apparaît en tête du menu : parcourir quinze
// employés à la molette est pénible, en taper trois lettres ne l'est pas. En dessous (les
// quatre priorités, les quatre échéances), elle ne ferait qu'encombrer.
const SEARCH_THRESHOLD = 6;

// Marge gardée entre le menu et les bords de l'écran.
const EDGE = 8;

// Filtre multi-sélection : pastille (façon .filter-select) + menu à cases à cocher.
// Le menu est rendu dans un portail (position: fixed) pour échapper à tout contexte de stacking.
// props :
//  - allLabel   : libellé quand rien n'est coché (ex. « Toutes priorités »)
//  - baseLabel  : libellé court avec compteur quand ≥1 coché (ex. « Priorité » → « Priorité · 2 »)
//  - options    : [{ value, label }]
//  - selected   : valeurs cochées (array)
//  - onChange   : (nouvelleListe) => void
//  - searchable : force la recherche (par défaut : au-delà de SEARCH_THRESHOLD options)
export default function MultiSelectFilter({ allLabel, baseLabel, options, selected, onChange, searchable }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState('');
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  // Place le menu sous son bouton, sans le laisser déborder à droite de l'écran.
  function place() {
    const button = btnRef.current?.getBoundingClientRect();
    if (!button) return;
    const width = menuRef.current?.offsetWidth || 0;
    const maxLeft = window.innerWidth - width - EDGE;
    setPos({ top: button.bottom + 6, left: Math.max(EDGE, Math.min(button.left, maxLeft)) });
  }

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  }

  // Deuxième placement une fois le menu affiché : sa largeur n'est connue qu'à ce moment.
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    // Pas de focus automatique sur écran tactile : le clavier surgirait par-dessus la liste
    // alors qu'on voulait peut-être juste cocher une case.
    if (showSearch && window.matchMedia?.('(hover: hover)').matches) {
      searchRef.current?.focus();
    }

    function onDown(e) {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inBtn && !inMenu) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // L'écoute en phase de capture reçoit TOUS les défilements, y compris celui de la liste
    // elle-même : c'est ce qui fermait le menu dès qu'on faisait défiler les employés. On
    // ignore donc ce qui défile à l'intérieur du menu.
    //
    // Quand c'est la page qui défile, le menu suit son bouton au lieu de se fermer ; il ne se
    // ferme que si le bouton sort de l'écran — il flotterait alors, rattaché à rien.
    function onScrollOrResize(e) {
      if (e?.target instanceof Node && menuRef.current?.contains(e.target)) return;
      const button = btnRef.current?.getBoundingClientRect();
      if (!button || button.bottom < 0 || button.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      place();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    // Redimensionner ne ferme plus le menu : sur téléphone, l'apparition du clavier (pour
    // taper dans la recherche) déclenche un resize, qui le refermait aussitôt.
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // place() ne lit que des refs : l'ajouter relancerait l'effet à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showSearch]);

  const visibleOptions = useMemo(
    () => (showSearch && query.trim() ? options.filter((opt) => matchesTerms(opt.label, query)) : options),
    [options, query, showSearch]
  );

  function toggleValue(value) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const count = selected.length;
  const buttonLabel = count === 0 ? allLabel : `${baseLabel} · ${count}`;

  return (
    <div className="filter-multi">
      <button
        ref={btnRef}
        type="button"
        className={`filter-select filter-multi-btn${count ? ' filter-multi-btn--active' : ''}`}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {buttonLabel}
      </button>
      {open &&
        createPortal(
          <div
            className={`status-menu filter-multi-menu${showSearch ? ' filter-multi-menu--searchable' : ''}`}
            ref={menuRef}
            style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
          >
            {showSearch && (
              <input
                ref={searchRef}
                type="search"
                className="filter-multi-search"
                placeholder="Rechercher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Entrée coche (ou décoche) le premier résultat : on tape « hugo », Entrée.
                  if (e.key === 'Enter' && visibleOptions.length > 0) {
                    e.preventDefault();
                    toggleValue(visibleOptions[0].value);
                  }
                }}
                aria-label={`Rechercher dans ${baseLabel.toLowerCase()}`}
              />
            )}
            {count > 0 && (
              <button type="button" className="filter-multi-clear" onClick={() => onChange([])}>
                Tout effacer
              </button>
            )}
            {/* La liste défile seule : la recherche et « Tout effacer » restent visibles en tête. */}
            <div className="filter-multi-list" role="listbox" aria-multiselectable="true">
              {options.length === 0 && <span className="filter-multi-empty">Aucune option</span>}
              {options.length > 0 && visibleOptions.length === 0 && (
                <span className="filter-multi-empty">Aucun résultat pour « {query.trim()} »</span>
              )}
              {visibleOptions.map((opt) => (
                <label key={opt.value} className="filter-multi-item">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggleValue(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
