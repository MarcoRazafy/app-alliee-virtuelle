import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as taskService from '../../services/taskService';
import useAuthStore from '../../store/authStore';

const NAV_ITEMS = [
  { to: '/admin', label: 'Suivi en temps réel' },
  { to: '/admin/validate', label: 'Tâches à valider', badgeKey: 'toValidate' },
  { to: '/admin/late', label: 'Tâches en retard', badgeKey: 'late' },
  { to: '/admin/stats', label: 'Statistiques' },
  { to: '/admin/users', label: 'Utilisateurs' },
  { to: '/admin/messaging', label: 'Messagerie' },
  { to: '/admin/resources', label: 'Ressources' },
  { to: '/admin/profile', label: 'Mon profil' },
];

function AdminLayout({ children }) {
  const [badges, setBadges] = useState({ toValidate: 0, late: 0 });
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    function loadBadges() {
      taskService.getTasks({ status: 'TERMINEE' }).then((tasks) => {
        setBadges((prev) => ({ ...prev, toValidate: tasks.length }));
      });
      taskService.getLateTasks().then((tasks) => {
        setBadges((prev) => ({ ...prev, late: tasks.length }));
      });
    }
    loadBadges();
    const poll = setInterval(loadBadges, 15000);
    return () => clearInterval(poll);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: '220px', borderRight: '1px solid black', padding: '10px' }}>
        <h2>Administration</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.to} style={{ marginBottom: '8px' }}>
              <Link to={item.to}>
                {item.label}
                {item.badgeKey && badges[item.badgeKey] > 0 && (
                  <span
                    style={{
                      backgroundColor: 'red',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 6px',
                      marginLeft: '6px',
                    }}
                  >
                    {badges[item.badgeKey]}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <button onClick={handleLogout}>Déconnexion</button>
      </nav>
      <main style={{ flex: 1, padding: '20px' }}>{children}</main>
    </div>
  );
}

export default AdminLayout;
