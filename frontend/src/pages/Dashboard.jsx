import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import * as taskService from '../services/taskService';

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [dayValidated, setDayValidated] = useState(false);
  const [urgentTasks, setUrgentTasks] = useState([]);

  const firstName = user?.full_name?.split(' ')[0] || '';

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      navigate('/admin', { replace: true });
      return;
    }
    if (user?.role !== 'EMPLOYEE') return;

    taskService.getMyDay().then((selection) => {
      setDayValidated(selection.length > 0 && selection.every((item) => item.validated_at));
    });

    taskService.getTasks({ priority: 'URGENT' }).then(setUrgentTasks);
  }, [user, navigate]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div>
      <h1>Bienvenue {firstName}</h1>
      <p>Statut du compte : {user?.status}</p>

      {user?.role === 'EMPLOYEE' && (
        <div>
          <p style={{ color: dayValidated ? 'green' : 'gray' }}>
            {dayValidated ? 'Votre journée est validée' : 'Journée non validée'}
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/workspace">Mon espace</Link>
            <Link to="/my-day">Ma journée</Link>
            <Link to="/tasks">Mes tâches</Link>
            <Link to="/messaging">Messagerie</Link>
            <Link to="/profile">Mon profil</Link>
            <Link to="/resources">Ressources</Link>
          </div>

          <h2>Tâches urgentes</h2>
          {urgentTasks.length === 0 && <p>Aucune tâche urgente.</p>}
          <ul>
            {urgentTasks.map((task) => (
              <li key={task.id}>
                <Link to={`/tasks/${task.id}`}>{task.title}</Link> — deadline {task.deadline}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleLogout}>Déconnexion</button>
    </div>
  );
}

export default Dashboard;
