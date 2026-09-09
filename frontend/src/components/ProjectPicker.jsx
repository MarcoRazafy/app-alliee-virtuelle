import { useEffect, useMemo, useRef, useState } from 'react';
import { filterProjects } from '../utils/projectSearch';
import { IconFolder, IconSearch, IconChevronDown, IconCheckCircle } from './icons';
import '../styles/project-picker.css';

// Choix d'un projet (« Espace › Dossier › Liste ») avec recherche.
//
// Remplace un <select> natif : au-delà d'une dizaine de projets, il fallait dérouler une
// liste sans pouvoir filtrer, et le chemin complet y était illisible sur une seule ligne.
// Ici le chemin est mis en forme — le parent en gris, le nom de la liste en évidence.

function pathParts(path) {
  const parts = String(path || '').split('›').map((p) => p.trim()).filter(Boolean);
  return { parents: parts.slice(0, -1), name: parts[parts.length - 1] || path || '' };
}

export default function ProjectPicker({ projects, value, onChange, required = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = useMemo(
    () => (projects || []).find((p) => p.id === value) || null,
    [projects, value]
  );
  const results = useMemo(() => filterProjects(projects, query), [projects, query]);

  // Le champ de recherche prend le focus à l'ouverture : on ouvre pour chercher.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery('');
  }, [open]);

  // Fermeture au clic extérieur et à Échap — un menu qui reste ouvert par-dessus le
  // formulaire empêche de remplir les champs suivants.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(project) {
    onChange(project.id);
    setOpen(false);
  }

  return (
    <div className="ppk" ref={rootRef}>
      <button
        type="button"
        className={`ppk-trigger${open ? ' ppk-trigger--open' : ''}${
          !selected && required ? ' ppk-trigger--empty' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <IconFolder />
        {selected ? (
          <span className="ppk-selected">
            {pathParts(selected.path).parents.length > 0 && (
              <span className="ppk-selected-parents">
                {pathParts(selected.path).parents.join(' › ')} ›{' '}
              </span>
            )}
            <span className="ppk-selected-name">{pathParts(selected.path).name}</span>
          </span>
        ) : (
          <span className="ppk-placeholder">Sélectionnez un projet…</span>
        )}
        <span className={`ppk-chevron${open ? ' ppk-chevron--open' : ''}`}>
          <IconChevronDown />
        </span>
      </button>

      {open && (
        <div className="ppk-panel">
          <label className="ppk-search">
            <IconSearch />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un projet…"
              aria-label="Rechercher un projet"
              onKeyDown={(e) => {
                // Entrée choisit le premier résultat : chercher puis valider sans quitter
                // le clavier. preventDefault, sinon le formulaire se soumettrait.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results.length > 0) choose(results[0]);
                }
              }}
            />
          </label>

          {results.length === 0 ? (
            <p className="ppk-empty">
              {(projects || []).length === 0
                ? 'Aucun projet disponible.'
                : 'Aucun projet ne correspond à cette recherche.'}
            </p>
          ) : (
            <ul className="ppk-list" role="listbox">
              {results.map((project) => {
                const { parents, name } = pathParts(project.path);
                const isSelected = project.id === value;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      className={`ppk-option${isSelected ? ' ppk-option--selected' : ''}`}
                      onClick={() => choose(project)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="ppk-option-text">
                        {parents.length > 0 && <span className="ppk-option-parents">{parents.join(' › ')}</span>}
                        <span className="ppk-option-name">{name}</span>
                      </span>
                      {isSelected && (
                        <span className="ppk-option-check">
                          <IconCheckCircle />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
