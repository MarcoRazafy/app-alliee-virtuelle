import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const firstName = user?.full_name?.split(' ')[0] || '';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div>
      <h1>Bienvenue {firstName}</h1>
      <p>Statut du compte : {user?.status}</p>
      <button onClick={handleLogout}>Déconnexion</button>
    </div>
  );
}

export default Dashboard;
