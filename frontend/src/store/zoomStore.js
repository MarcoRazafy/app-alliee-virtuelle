import { create } from 'zustand';

// Zoom d'affichage global, réglé PAR APPAREIL (comme le thème) → mémorisé dans localStorage.
// Utile car l'échelle système diffère selon la machine (Windows ~120 %, Linux 100 %).
const STORAGE_KEY = 'ui-zoom';
export const ZOOM_LEVELS = [80, 90, 100, 110];

function readZoom() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return ZOOM_LEVELS.includes(stored) ? stored : 100;
}

// La propriété CSS `zoom` prend un ratio (1 = 100 %). On efface pour 100 % (état neutre).
// On expose aussi le ratio en variable CSS `--ui-zoom` : les hauteurs en `vh` (sidebar…)
// doivent le diviser, car `vh` ignore le zoom (sinon 100vh devient 100vh × zoom).
// index.html applique déjà ce calcul en inline avant le premier rendu (anti-flash).
function applyZoomToDom(zoom) {
  const ratio = zoom / 100;
  document.documentElement.style.zoom = zoom === 100 ? '' : String(ratio);
  document.documentElement.style.setProperty('--ui-zoom', String(ratio));
}

const initialZoom = readZoom();
applyZoomToDom(initialZoom);

const useZoomStore = create((set, get) => ({
  zoom: initialZoom,

  setZoom: (zoom) => {
    const value = ZOOM_LEVELS.includes(zoom) ? zoom : 100;
    localStorage.setItem(STORAGE_KEY, String(value));
    applyZoomToDom(value);
    set({ zoom: value });
  },

  // Passe au niveau suivant (80 → 90 → 100 → 110 → 80…).
  cycleZoom: () => {
    const next = ZOOM_LEVELS[(ZOOM_LEVELS.indexOf(get().zoom) + 1) % ZOOM_LEVELS.length];
    localStorage.setItem(STORAGE_KEY, String(next));
    applyZoomToDom(next);
    set({ zoom: next });
  },
}));

export default useZoomStore;
