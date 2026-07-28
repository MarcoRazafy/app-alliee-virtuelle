import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { heartbeatSession, signalSessionDisconnect } from './services/sessionService';
import { getToken } from './services/auth';
// Gardés en chargement immédiat : la 1re page (Login), le garde de route et le shell admin
// (partagé par toutes les pages admin, donc mieux vaut le charger une seule fois).
import Login from './pages/Login';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';

// Toutes les autres pages sont chargées à la demande (code-splitting) : chacune devient
// un fichier séparé, téléchargé seulement quand on visite sa route. Le bundle initial fond.
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workspace = lazy(() => import('./pages/Workspace'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const MyDay = lazy(() => import('./pages/MyDay'));
const MyStats = lazy(() => import('./pages/MyStats'));
const Planning = lazy(() => import('./pages/Planning'));
const Messaging = lazy(() => import('./pages/Messaging'));
const Profile = lazy(() => import('./pages/Profile'));
const Resources = lazy(() => import('./pages/Resources'));
const EmployeeAssistant = lazy(() => import('./pages/EmployeeAssistant'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminCreateTask = lazy(() => import('./pages/admin/AdminCreateTask'));
const AdminListView = lazy(() => import('./pages/admin/AdminListView'));
const AdminTasksToValidate = lazy(() => import('./pages/admin/AdminTasksToValidate'));
const AdminLateTasks = lazy(() => import('./pages/admin/AdminLateTasks'));
const AdminTaskRequests = lazy(() => import('./pages/admin/AdminTaskRequests'));
const AdminStatistics = lazy(() => import('./pages/admin/AdminStatistics'));
const AdminPlanningPresence = lazy(() => import('./pages/admin/AdminPlanningPresence'));
const AdminAssistant = lazy(() => import('./pages/admin/AdminAssistant'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminMessaging = lazy(() => import('./pages/admin/AdminMessaging'));
const AdminResources = lazy(() => import('./pages/admin/AdminResources'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));

function AdminRoute({ children }) {
  return (
    <ProtectedRoute role="ADMIN">
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}

function App() {
  // Une actualisation ne doit jamais interrompre la présence. Tant qu'un token existe,
  // l'application rafraîchit la session ; le backend borne automatiquement une session
  // abandonnée après l'arrêt des heartbeats.
  useEffect(() => {
    function heartbeat() {
      if (!getToken()) return;
      heartbeatSession().catch(() => {});
    }
    heartbeat();
    const interval = window.setInterval(heartbeat, 20000);
    window.addEventListener('pagehide', signalSessionDisconnect);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', signalSessionDisconnect);
    };
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <MyTasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedRoute>
              <TaskDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-day"
          element={
            <ProtectedRoute>
              <MyDay />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messaging"
          element={
            <ProtectedRoute>
              <Messaging />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resources"
          element={
            <ProtectedRoute>
              <Resources />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <MyStats />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planning"
          element={
            <ProtectedRoute>
              <Planning />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistant"
          element={
            <ProtectedRoute>
              <EmployeeAssistant />
            </ProtectedRoute>
          }
        />

        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/create-task" element={<AdminRoute><AdminCreateTask /></AdminRoute>} />
        <Route path="/admin/lists" element={<AdminRoute><AdminListView /></AdminRoute>} />
        <Route path="/admin/validate" element={<AdminRoute><AdminTasksToValidate /></AdminRoute>} />
        <Route path="/admin/late" element={<AdminRoute><AdminLateTasks /></AdminRoute>} />
        <Route path="/admin/task-requests" element={<AdminRoute><AdminTaskRequests /></AdminRoute>} />
        <Route path="/admin/stats" element={<AdminRoute><AdminStatistics /></AdminRoute>} />
        <Route path="/admin/planning" element={<AdminRoute><AdminPlanningPresence /></AdminRoute>} />
        <Route path="/admin/assistant" element={<AdminRoute><AdminAssistant /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/messaging" element={<AdminRoute><AdminMessaging /></AdminRoute>} />
        <Route path="/admin/resources" element={<AdminRoute><AdminResources /></AdminRoute>} />
        <Route path="/admin/profile" element={<AdminRoute><AdminProfile /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
