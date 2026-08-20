import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import * as emailService from '../../services/emailService';
import { getSocket } from '../../services/socket';
import * as avatarService from '../../services/avatarService';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import ThemeToggle from '../ThemeToggle';
import ZoomControl from '../ZoomControl';
import ReloadButton from '../ReloadButton';
import ActiveTaskWidget from '../employee/ActiveTaskWidget';
import TopbarTools from '../TopbarTools';
import {
  IconWorkspace,
  IconLayers,
  IconChecklist,
  IconListUl,
  IconCheckCircle,
  IconBell,
  IconMegaphone,
  IconBarChart,
  IconCalendarWeek,
  IconUser,
  IconUsers,
  IconFolder,
  IconMail,
  IconLogout,
  IconChevronDown,
  IconSearch,
  IconMenu,
  IconX,
} from '../icons';
import useAnnouncementUnread from '../../hooks/useAnnouncementUnread';
import ConnectionChrono from '../employee/ConnectionChrono';
import '../../styles/app.css';
import '../../styles/layout.css';

// Navigation : liens simples + deux liens "parents" repliables (accordéon).
// Un parent (children) ne mène à aucune page : cliquer déplie/replie ses sous-éléments.
const NAV_ITEMS = [
  { to: '/admin', label: "Vue d'ensemble", subtitle: "Activité de l'équipe en direct", icon: IconWorkspace, end: true },
  {
    label: 'Gestionnaire de tâche',
    icon: IconChecklist,
    children: [
      { to: '/admin/lists', label: 'Projets', subtitle: 'Toutes les tâches par projet', icon: IconLayers },
      { to: '/admin/validate', label: 'Liste des tâches', subtitle: 'Déclarations et livraisons à contrôler', icon: IconCheckCircle, badgeKey: 'toValidate' },
      { to: '/admin/task-requests', label: 'Demande des tâches', subtitle: 'Tâches supplémentaires à approuver', icon: IconBell, badgeKey: 'taskRequests' },
    ],
  },
  {
    label: 'Gestionnaire des employés',
    icon: IconUsers,
    children: [
      { to: '/admin/planning', label: 'Planning & Présence', subtitle: 'Disponibilités et présence des employés', icon: IconCalendarWeek },
      { to: '/admin/daily', label: 'Daily & To Do', subtitle: 'Rapports quotidiens des employés', icon: IconListUl },
      { to: '/admin/users', label: 'Équipe', subtitle: "Membres de l'équipe", icon: IconUser },
    ],
  },
  { to: '/admin/stats', label: 'Statistique', subtitle: "Performance de l'équipe", icon: IconBarChart },
  { to: '/announcements', label: 'Annonce', subtitle: "Communications à l'équipe", icon: IconMegaphone, badgeKey: 'announcements' },
  { to: '/planning', label: 'Mon planning', subtitle: 'Vos disponibilités de la semaine', icon: IconCalendarWeek },
  { to: '/admin/mailbox', label: 'Boîte mail', subtitle: 'Emails reçus', icon: IconMail, badgeKey: 'mailbox' },
  { to: '/admin/resources', label: 'Ressources', subtitle: 'Documents partagés', icon: IconFolder },
  { to: '/admin/profile', label: 'Admin Profil', subtitle: 'Vos informations', icon: IconUser },
];

// Feuilles navigables aplaties : sert à résoudre le titre d'en-tête et la recherche.
const FLAT_ITEMS = NAV_ITEMS.flatMap((item) => (item.children ? item.children : [item]));

// Pages accessibles sans entrée de menu dédiée : on leur donne quand même un
// titre/sous-titre d'en-tête cohérent (sinon le header retomberait sur le 1er item).
const EXTRA_TITLES = {
  '/admin/create-task': { label: 'Créer une tâche', subtitle: 'Nouvelle tâche à assigner' },
  '/admin/late': { label: 'Tâches en retard', subtitle: 'Tâches dont l’échéance est dépassée' },
  '/admin/messaging': { label: 'Messagerie', subtitle: 'Échanges avec les employés' },
  '/admin/assistant': { label: 'Assistant IA', subtitle: 'Analyse et recommandations' },
};

// Groupes à déplier automatiquement selon la page active.
function activeGroups(pathname) {
  const open = {};
  NAV_ITEMS.forEach((item) => {
    if (item.children && item.children.some((c) => pathname.startsWith(c.to))) open[item.label] = true;
  });
  return open;
}

function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { unread: announcementUnread } = useAnnouncementUnread();

  const [badges, setBadges] = useState({ toValidate: 0, taskRequests: 0, mailbox: 0 });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [openMenus, setOpenMenus] = useState(() => activeGroups(location.pathname));

  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Déplie automatiquement le groupe dont une page enfant devient active,
  // sans refermer ceux que l'utilisateur a déjà ouverts manuellement.
  useEffect(() => {
    setOpenMenus((prev) => ({ ...prev, ...activeGroups(location.pathname) }));
  }, [location.pathname]);

  useEffect(() => {
    function loadBadges() {
      // "À valider" regroupe les tâches Déclarée (à valider par l'admin) et Terminée (à confirmer)
      Promise.all([taskService.getTasks({ status: 'DECLAREE' }), taskService.getTasks({ status: 'TERMINEE' })]).then(
        ([declared, done]) => {
          setBadges((prev) => ({ ...prev, toValidate: declared.length + done.length }));
        }
      );
      taskService.getExtraTaskRequests('PENDING').then((reqs) => {
        setBadges((prev) => ({ ...prev, taskRequests: reqs.length }));
      });
      emailService.getUnreadCount().then((d) => {
        setBadges((prev) => ({ ...prev, mailbox: d.unread || 0 }));
      }).catch(() => {});
    }
    loadBadges();
    const poll = setInterval(loadBadges, 15000);
    // Nouvel email en temps réel → rafraîchit le compteur non-lus tout de suite.
    const socket = getSocket();
    const onMail = () => loadBadges();
    socket.on('mail:new', onMail);
    return () => {
      clearInterval(poll);
      socket.off('mail:new', onMail);
    };
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

  function toggleMenu(label) {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // Valeur du badge pour une entrée : les annonces viennent du hook temps réel,
  // le reste (à valider / demandes) de l'API.
  function badgeValueFor(badgeKey) {
    if (!badgeKey) return 0;
    if (badgeKey === 'announcements') return announcementUnread;
    return badges[badgeKey] || 0;
  }

  const firstName = user?.full_name?.split(' ')[0] || '';

  const activeItem =
    FLAT_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ||
    EXTRA_TITLES[location.pathname] ||
    FLAT_ITEMS[0];

  const searchMatches = searchQuery.trim()
    ? FLAT_ITEMS.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
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

        <span className="sidebar-role-tag">Espace administrateur</span>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            // Lien simple
            if (!item.children) {
              const { to, label, icon: Icon, end, badgeKey } = item;
              const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
              const badgeValue = badgeValueFor(badgeKey);
              return (
                <Link key={label} to={to} className={`sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                  <Icon />
                  <span>{label}</span>
                  {badgeValue > 0 && <span className="sidebar-badge">{badgeValue}</span>}
                </Link>
              );
            }

            // Lien parent repliable (accordéon)
            const { label, icon: Icon, children } = item;
            const isOpen = !!openMenus[label];
            // Quand le groupe est replié, on agrège les badges des enfants pour ne
            // pas masquer une notification en attente.
            const collapsedBadge = children.reduce((sum, c) => sum + badgeValueFor(c.badgeKey), 0);

            return (
              <div key={label} className="sidebar-subnav">
                <button
                  type="button"
                  className="sidebar-parent"
                  onClick={() => toggleMenu(label)}
                  aria-expanded={isOpen}
                >
                  <span className="sidebar-link-main">
                    <Icon />
                    <span>{label}</span>
                  </span>
                  {!isOpen && collapsedBadge > 0 && <span className="sidebar-badge">{collapsedBadge}</span>}
                  <span className={`sidebar-expand-btn${isOpen ? ' sidebar-expand-btn--open' : ''}`}>
                    <IconChevronDown />
                  </span>
                </button>
                {isOpen && (
                  <div className="sidebar-sublinks">
                    {children.map((c) => {
                      const isActive = location.pathname.startsWith(c.to);
                      const badgeValue = badgeValueFor(c.badgeKey);
                      return (
                        <Link
                          key={c.label}
                          to={c.to}
                          className={`sidebar-sublink${isActive ? ' sidebar-sublink--active' : ''}`}
                        >
                          <span>{c.label}</span>
                          {badgeValue > 0 && <span className="sidebar-badge">{badgeValue}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
            <ActiveTaskWidget />
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

            <TopbarTools messagingPath="/admin/messaging" assistantPath="/admin/assistant" />

            <ReloadButton />
            <ZoomControl />
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

        <main key={location.pathname} className="shell-content shell-content--wide app-route-stage">
          {children}
        </main>
      </div>
      <ConnectionChrono className="connection-chrono--admin" />
    </div>
  );
}

export default AdminLayout;
