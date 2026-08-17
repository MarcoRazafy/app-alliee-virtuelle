import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

function ProtectedRoute({ children, role }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const dayValidated = useAuthStore((state) => state.dayValidated);
  const checkDayValidated = useAuthStore((state) => state.checkDayValidated);
  const location = useLocation();

  // Récupère l'état de validation du jour (côté serveur) pour les employés, une fois par session.
  useEffect(() => {
    if (isAuthenticated && user?.role === 'EMPLOYEE' && dayValidated === null) {
      checkDayValidated();
    }
  }, [isAuthenticated, user, dayValidated, checkDayValidated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirection d'ENTRÉE : à l'arrivée sur l'espace (le dashboard), un employé qui n'a pas
  // encore validé sa journée est dirigé vers « Ma journée ». Le reste de l'application reste
  // librement accessible ensuite (ce n'est PAS un blocage global).
  if (user?.role === 'EMPLOYEE' && location.pathname === '/dashboard') {
    if (dayValidated === null) {
      return (
        <p className="route-access-loading" role="status">
          Vérification de votre espace…
        </p>
      );
    }
    if (dayValidated === false) {
      return <Navigate to="/my-day" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
