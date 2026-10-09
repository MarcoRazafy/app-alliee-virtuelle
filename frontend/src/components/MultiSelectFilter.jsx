import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { matchesTerms } from '../utils/textSearch';

const SEARCH_THRESHOLD = 6;

const EDGE = 8;

export default function MultiSelectFilter({ allLabel, baseLabel, options, selected, onChange, searchable }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [query, setQuery] = useState('');
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

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

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
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
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
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
