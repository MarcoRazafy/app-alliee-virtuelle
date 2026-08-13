import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Filtre multi-sélection : pastille (façon .filter-select) + menu à cases à cocher.
// Le menu est rendu dans un portail (position: fixed) pour échapper à tout contexte de stacking.
// props :
//  - allLabel  : libellé quand rien n'est coché (ex. « Toutes priorités »)
//  - baseLabel : libellé court avec compteur quand ≥1 coché (ex. « Priorité » → « Priorité · 2 »)
//  - options   : [{ value, label }]
//  - selected  : valeurs cochées (array)
//  - onChange  : (nouvelleListe) => void
export default function MultiSelectFilter({ allLabel, baseLabel, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inBtn && !inMenu) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

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
            className="status-menu filter-multi-menu"
            role="listbox"
            aria-multiselectable="true"
            ref={menuRef}
            style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
          >
            {count > 0 && (
              <button type="button" className="filter-multi-clear" onClick={() => onChange([])}>
                Tout effacer
              </button>
            )}
            {options.length === 0 && <span className="filter-multi-empty">Aucune option</span>}
            {options.map((opt) => (
              <label key={opt.value} className="filter-multi-item">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
