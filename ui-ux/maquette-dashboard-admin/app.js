const root = document.documentElement;
const body = document.body;
const menuButton = document.querySelector('[data-open-menu]');
const closeMenuButtons = document.querySelectorAll('[data-close-menu]');
const themeButton = document.querySelector('[data-theme-toggle]');
const teamSearch = document.querySelector('[data-team-search]');
const globalSearch = document.querySelector('[data-global-search]');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const employeeCards = [...document.querySelectorAll('[data-employee]')];
const visibleCount = document.querySelector('[data-visible-count]');
const emptyState = document.querySelector('[data-team-empty]');
const restHeading = document.querySelector('[data-rest-heading]');
const toast = document.querySelector('[data-toast]');
const toastMessage = document.querySelector('[data-toast-message]');

let activeFilter = 'all';
let toastTimeout;

function openMenu() {
  body.classList.add('menu-open');
  menuButton?.setAttribute('aria-expanded', 'true');
  document.querySelector('.sidebar-close')?.focus();
}

function closeMenu({ restoreFocus = true } = {}) {
  const wasOpen = body.classList.contains('menu-open');
  body.classList.remove('menu-open');
  menuButton?.setAttribute('aria-expanded', 'false');
  if (wasOpen && restoreFocus) menuButton?.focus();
}

menuButton?.addEventListener('click', openMenu);
closeMenuButtons.forEach((button) => button.addEventListener('click', () => closeMenu()));

themeButton?.addEventListener('click', () => {
  const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = nextTheme;
  const isLight = nextTheme === 'light';
  themeButton.setAttribute('aria-pressed', String(isLight));
  themeButton.setAttribute('aria-label', isLight ? 'Activer le thème sombre' : 'Activer le thème clair');
  showToast(`Thème ${isLight ? 'clair' : 'sombre'} activé`);
});

function applyTeamFilters() {
  const query = teamSearch?.value.trim().toLocaleLowerCase('fr') || '';
  let count = 0;
  let visibleRestCount = 0;

  employeeCards.forEach((card) => {
    const matchesQuery = card.dataset.name.toLocaleLowerCase('fr').includes(query);
    const matchesStatus = activeFilter === 'all' || card.dataset.status === activeFilter;
    const isVisible = matchesQuery && matchesStatus;
    card.hidden = !isVisible;
    if (isVisible) {
      count += 1;
      if (card.dataset.status === 'rest') visibleRestCount += 1;
    }
  });

  if (visibleCount) visibleCount.textContent = String(count);
  if (emptyState) emptyState.hidden = count !== 0;
  if (restHeading) restHeading.hidden = visibleRestCount === 0;
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
    applyTeamFilters();
  });
});

teamSearch?.addEventListener('input', applyTeamFilters);

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.hidden = false;
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

document.querySelectorAll('[data-demo-action]').forEach((element) => {
  element.addEventListener('click', (event) => {
    event.preventDefault();
    showToast(`${element.dataset.demoAction} — interaction simulée`);
    if (window.innerWidth <= 960 && element.closest('.sidebar')) closeMenu({ restoreFocus: false });
  });
});

function formatTimer(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':');
}

document.querySelectorAll('[data-live-timer]').forEach((timer) => {
  let seconds = Number(timer.dataset.seconds || 0);
  window.setInterval(() => {
    seconds += 1;
    timer.textContent = formatTimer(seconds);
  }, 1000);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('fr') === 'k') {
    event.preventDefault();
    globalSearch?.focus();
  }
  if (event.key === 'Escape') {
    if (body.classList.contains('menu-open')) closeMenu();
    else if (document.activeElement === globalSearch) globalSearch.blur();
  }
});

globalSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && globalSearch.value.trim()) {
    event.preventDefault();
    showToast(`Recherche « ${globalSearch.value.trim()} » — interaction simulée`);
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 960) closeMenu({ restoreFocus: false });
});
