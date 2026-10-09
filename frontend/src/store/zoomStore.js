import { create } from 'zustand';

const STORAGE_KEY = 'ui-zoom';
export const ZOOM_LEVELS = [80, 90, 100, 110];

function readZoom() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return ZOOM_LEVELS.includes(stored) ? stored : 100;
}

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

  cycleZoom: () => {
    const next = ZOOM_LEVELS[(ZOOM_LEVELS.indexOf(get().zoom) + 1) % ZOOM_LEVELS.length];
    localStorage.setItem(STORAGE_KEY, String(next));
    applyZoomToDom(next);
    set({ zoom: next });
  },
}));

export default useZoomStore;
