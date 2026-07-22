import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import * as avatarService from '../../services/avatarService';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import ThemeToggle from '../ThemeToggle';
import {
  IconWorkspace,
  IconChecklist,
  IconCheckCircle,
  IconAlert,
  IconBell,
  IconBarChart,
  IconCalendarWeek,
  IconSparkle,
  IconUser,
  IconUsers,
  IconChat,
  IconFolder,
  IconLogout,
  IconChevronDown,
  IconSearch,
  IconMenu,
  IconX,
} from '../icons';
import '../../styles/app.css';
import '../../styles/layout.css';

// Navigation groupée par intention (cf. maquette) : Piloter / Collaborer / Administrer.
const NAV_GROUPS = [
  {
    label: 'Piloter',
    items: [
      { to: '/admin', label: "Vue d'ensemble", subtitle: "Activité de l'équipe en direct", icon: IconWorkspace, end: true },
      { to: '/admin/lists', label: 'Projets', subtitle: 'Toutes les tâches', icon: IconChecklist },
      { to: '/admin/validate', label: 'Tâches', subtitle: 'Déclarations et livraisons à contrôler', icon: IconCheckCircle, badgeKey: 'toValidate' },
      { to: '/admin/late', label: 'En retard', subtitle: 'Échéances dépassées', icon: IconAlert, badgeKey: 'late' },
      { to: '/admin/task-requests', label: 'Demandes de tâche', subtitle: 'Tâches supplémentaires à approuver', icon: IconBell, badgeKey: 'taskRequests' },
      { to: '/admin/users', label: 'Équipe', subtitle: "Membres de l'équipe", icon: IconUsers },
      { to: '/admin/planning', label: 'Présence et planning', subtitle: 'Disponibilités et présence des employés', icon: IconCalendarWeek },
      { to: '/admin/stats', label: 'Statistiques', subtitle: "Performance de l'équipe", icon: IconBarChart },
    ],
  },
  {
    label: 'Collaborer',
    items: [
      {
        to: '/admin/messaging',
        label: 'Messagerie',
        subtitle: 'Échanges avec les employés',
        icon: IconChat,
        children: [
          { label: 'Global', canal: 'global', to: '/admin/messaging?canal=global' },
          { label: 'Équipe', canal: 'equipe', to: '/admin/messaging?canal=equipe' },
          { label: 'Groupes', canal: 'groupes', to: '/admin/messaging?canal=groupes' },
        ],
      },
      { to: '/admin/resources', label: 'Ressources', subtitle: 'Documents partagés', icon: IconFolder },
    ],
  },
  {
    label: 'Administrer',
    items: [
      { to: '/admin/assistant', label: 'Assistant IA', subtitle: 'Analyse et recommandations', icon: IconSparkle },
      { to: '/admin/profile', label: 'Profil', subtitle: 'Vos informations', icon: IconUser },
    ],
  },
];

// Liste aplatie pour la résolution du titre d'en-tête et la recherche.
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

// Pages accessibles sans entrée de menu dédiée : on leur donne quand même un
// titre/sous-titre d'en-tête cohérent (sinon le header retomberait sur le 1er item).
const EXTRA_TITLES = {
  '/admin/create-task': { label: 'Créer une tâche', subtitle: 'Nouvelle tâche à assigner' },
};

function AdminLayout({ children }) {
  const [badges, setBadges] = useState({ toValidate: 0, late: 0, taskRequests: 0 });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messagingOpen, setMessagingOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Déplie automatiquement le sous-menu Messagerie quand on est sur la page.
  useEffect(() => {
    if (location.pathname.startsWith('/admin/messaging')) setMessagingOpen(true);
  }, [location.pathname]);

  const currentCanal = new URLSearchParams(location.search).get('canal');

  useEffect(() => {
    function loadBadges() {
      // "À valider" regroupe les tâches Déclarée (à valider par l'admin) et Terminée (à confirmer)
      Promise.all([taskService.getTasks({ status: 'DECLAREE' }), taskService.getTasks({ status: 'TERMINEE' })]).then(
        ([declared, done]) => {
          setBadges((prev) => ({ ...prev, toValidate: declared.length + done.length }));
        }
      );
      taskService.getLateTasks().then((tasks) => {
        setBadges((prev) => ({ ...prev, late: tasks.length }));
      });
      taskService.getExtraTaskRequests('PENDING').then((reqs) => {
        setBadges((prev) => ({ ...prev, taskRequests: reqs.length }));
      });
    }
    loadBadges();
    const poll = setInterval(loadBadges, 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    let objectUrl;
    api
      .get('/api/auth/me')
      .then((res) => {
        if (!res.data.has_avatar) return null;
        return avatarService.getMyAvatarBlob();
      })
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch(() => setAvatarUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchFocused(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        searchInputRef.current?.blur();
        setSearchFocused(false);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const firstName = user?.full_name?.split(' ')[0] || '';

  const activeItem =
    NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ||
    EXTRA_TITLES[location.pathname] ||
    NAV_ITEMS[0];

  const searchMatches = searchQuery.trim()
    ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (searchMatches.length > 0) {
      navigate(searchMatches[0].to);
      setSearchQuery('');
      setSearchFocused(false);
      searchInputRef.current?.blur();
    }
  }

  return (
    <div className="shell">
      {mobileNavOpen && <div className="sidebar-overlay" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar sidebar--rail${mobileNavOpen ? ' sidebar--mobile-open' : ''}`}>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Fermer le menu"
        >
          <IconX />
        </button>
        <div className="sidebar-brand">
          <img src="/logo.png" alt="L'Alliée Virtuelle" className="sidebar-logo" />
        </div>

        <span className="sidebar-role-tag">Espace administrateur</span>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="sidebar-group">
              <p className="sidebar-group-label">{group.label}</p>
              {group.items.map((item) => {
                const { to, label, icon: Icon, badgeKey, children } = item;
                const isActive = item === activeItem;
                const badgeValue = badgeKey ? badges[badgeKey] : 0;

                if (children) {
                  return (
                    <div key={label} className="sidebar-subnav">
                      <div
                        className={`sidebar-parent${isActive && !currentCanal ? ' sidebar-parent--active' : ''}`}
                      >
                        <Link to={to} className="sidebar-link-main">
                          <Icon />
                          <span>{label}</span>
                        </Link>
                        <button
                          type="button"
                          className={`sidebar-expand-btn${messagingOpen ? ' sidebar-expand-btn--open' : ''}`}
                          onClick={() => setMessagingOpen((v) => !v)}
                          aria-label={messagingOpen ? 'Replier Messagerie' : 'Déplier Messagerie'}
                          aria-expanded={messagingOpen}
                        >
                          <IconChevronDown />
                        </button>
                      </div>
                      {messagingOpen && (
                        <div className="sidebar-sublinks">
                          {children.map((child) => {
                            const childActive = isActive && currentCanal === child.canal;
                            return (
                              <Link
                                key={child.label}
                                to={child.to}
                                className={`sidebar-sublink${childActive ? ' sidebar-sublink--active' : ''}`}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={label}
                    to={to}
                    className={`sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
                  >
                    <Icon />
                    <span>{label}</span>
                    {badgeValue > 0 && <span className="sidebar-badge">{badgeValue}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <button type="button" className="sidebar-logout" onClick={handleLogout}>
          <IconLogout />
          <span>Déconnexion</span>
        </button>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div className="shell-header-titlebar">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <IconMenu />
            </button>
            <div>
              <h1 className="shell-header-title">{activeItem.label}</h1>
              {activeItem.subtitle && <p className="shell-header-subtitle">{activeItem.subtitle}</p>}
            </div>
          </div>

          <div className="shell-header-actions">
            <form className="search-input" ref={searchRef} onSubmit={handleSearchSubmit}>
              <IconSearch />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher (Ctrl + K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
              />
              {searchFocused && searchMatches.length > 0 && (
                <div className="search-dropdown">
                  {searchMatches.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="search-dropdown-item"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchFocused(false);
                      }}
                    >
                      <item.icon /> {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </form>

            <ThemeToggle />

            <div className="user-menu" ref={menuRef}>
              <button type="button" className="user-menu-trigger" onClick={() => setMenuOpen((v) => !v)}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user?.full_name} className="user-menu-avatar" />
                ) : (
                  <span className="user-menu-avatar user-menu-avatar--placeholder">{firstName[0] || '?'}</span>
                )}
                <span className="user-menu-info">
                  <span className="user-menu-name">{user?.full_name}</span>
                  <span className="user-menu-role">Administrateur</span>
                </span>
                <IconChevronDown />
              </button>
              {menuOpen && (
                <div className="user-menu-dropdown">
                  <Link to="/admin/profile" onClick={() => setMenuOpen(false)}>
                    <IconUser /> Mon profil
                  </Link>
                  <button type="button" onClick={handleLogout}>
                    <IconLogout /> Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="shell-content shell-content--wide">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
