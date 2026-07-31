import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

function ProtectedRoute({ children, role }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const dayValidated = useAuthStore((state) => state.dayValidated);
  const checkDayValidated = useAuthStore((state) => state.checkDayValidated);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && dayValidated === null) {
      checkDayValidated();
    }
  }, [isAuthenticated, dayValidated, checkDayValidated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user?.role === 'EMPLOYEE' && dayValidated === null) {
    return <p className="route-access-loading" role="status">Vérification de votre espace…</p>;
  }

  // L'employé doit valider sa journée (au moins une tâche) avant d'accéder à toute autre page
  if (user?.role === 'EMPLOYEE' && dayValidated === false && location.pathname !== '/my-day') {
    return <Navigate to="/my-day" replace />;
  }

  return children;
}

export default ProtectedRoute;
