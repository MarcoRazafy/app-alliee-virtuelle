import { create } from 'zustand';

const STORAGE_KEY = 'theme';

// index.html applique déjà ce même calcul en inline avant le premier rendu (anti-flash) ;
// on le refait ici pour que le state React reste synchronisé avec l'attribut posé sur <html>.
function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));

export default useThemeStore;
