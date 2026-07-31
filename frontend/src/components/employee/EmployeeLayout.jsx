import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import ThemeToggle from '../ThemeToggle';
import ConnectionChrono from './ConnectionChrono';
import api from '../../services/api';
import * as avatarService from '../../services/avatarService';
import { PageSkeleton } from '../Skeleton';
import TopbarTools from '../TopbarTools';
import {
  IconWorkspace,
  IconDashboard,
  IconCalendarCheck,
  IconChecklist,
  IconBarChart,
  IconCalendarWeek,
  IconFolder,
  IconUser,
  IconLogout,
  IconChevronDown,
  IconTrendingUp,
  IconSearch,
  IconLock,
  IconMenu,
  IconX,
} from '../icons';
import '../../styles/app.css';
import '../../styles/layout.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/workspace', label: 'Mon espace', icon: IconWorkspace },
  { to: '/my-day', label: 'Ma journée', icon: IconCalendarCheck },
  { to: '/tasks', label: 'Mes tâches', icon: IconChecklist },
  { to: '/stats', label: 'Stats', icon: IconBarChart },
  { to: '/planning', label: 'Planning', icon: IconCalendarWeek },
  { to: '/resources', label: 'Ressources', icon: IconFolder },
  { to: '/profile', label: 'Profil', icon: IconUser },
];

function EmployeeLayout({ title, breadcrumb, subtitle, locked, skeleton = null, children }) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  // La navigation mobile se referme automatiquement dès qu'on change de page
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let objectUrl;
    // Ne tente le téléchargement que si un avatar existe réellement, pour éviter
    // un 404 systématique pour tous les comptes qui n'en ont pas encore défini
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

  // Raccourci Ctrl+K / Cmd+K pour aller directement à la recherche de page
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
          <img src="/logo-mark.png" alt="" aria-hidden="true" className="sidebar-logo-mark" />
          <img src="/logo.png" alt="L'Alliée Virtuelle" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
            const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
            // Tant que la journée n'est pas validée, seule la page en cours reste accessible
            // (cf. règle métier : au moins une tâche sélectionnée + validation avant le reste de l'app)
            if (locked && !isActive) {
              return (
                <span key={to} className="sidebar-link sidebar-link--locked" title="Validez votre journée pour continuer">
                  <Icon />
                  <span>{label}</span>
                  <IconLock className="sidebar-lock-icon" />
                </span>
              );
            }
            return (
              <Link key={to} to={to} className={`sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {locked ? (
          <span className="sidebar-cta sidebar-cta--locked">
            <span className="sidebar-cta-icon">
              <IconLock />
            </span>
            <p className="sidebar-cta-title">Validez votre journée</p>
            <p className="sidebar-cta-link">pour débloquer le reste de l'application</p>
          </span>
        ) : (
          <Link to="/stats" className="sidebar-cta">
            <span className="sidebar-cta-icon">
              <IconTrendingUp />
            </span>
            <p className="sidebar-cta-title">Boostez votre productivité</p>
            <p className="sidebar-cta-link">
              Voir mes statistiques <IconChevronDown style={{ transform: 'rotate(-90deg)' }} />
            </p>
          </Link>
        )}
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
              {title && <h1 className="shell-header-title">{title}</h1>}
              {breadcrumb && (
                <p className="breadcrumb">
                  {breadcrumb.map((crumb, index) => (
                    <span key={crumb.label}>
                      {index > 0 && <span className="breadcrumb-sep">›</span>}
                      {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                    </span>
                  ))}
                </p>
              )}
              {subtitle && <p className="shell-header-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="shell-header-actions">
            <form className="search-input" ref={searchRef} onSubmit={handleSearchSubmit}>
              <IconSearch />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={locked ? 'Validez votre journée pour continuer' : "Rechercher (Ctrl + K)"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                disabled={locked}
              />
              {!locked && searchFocused && searchMatches.length > 0 && (
                <div className="search-dropdown">
                  {searchMatches.map((item) => (
                    <Link
                      key={item.to}
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

            <TopbarTools messagingPath="/messaging" assistantPath="/assistant" locked={locked} />

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
                  <span className="user-menu-role">Employé</span>
                </span>
                <IconChevronDown />
              </button>
              {menuOpen && (
                <div className="user-menu-dropdown">
                  {locked ? (
                    <span className="user-menu-dropdown-disabled">
                      <IconUser /> Mon profil
                    </span>
                  ) : (
                    <Link to="/profile" onClick={() => setMenuOpen(false)}>
                      <IconUser /> Mon profil
                    </Link>
                  )}
                  <button type="button" onClick={handleLogout}>
                    <IconLogout /> Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main key={location.pathname} className="shell-content app-route-stage">
          {skeleton ? <PageSkeleton variant={skeleton} /> : children}
        </main>
      </div>

      <ConnectionChrono />
    </div>
  );
}

export default EmployeeLayout;
