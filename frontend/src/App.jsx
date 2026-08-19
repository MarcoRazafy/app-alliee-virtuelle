import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { heartbeatSession, signalSessionDisconnect } from './services/sessionService';
import { getUser } from './services/auth';
import InstallPrompt from './components/InstallPrompt';
import AnnouncementPopup from './components/AnnouncementPopup';
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
// Même module, export nommé → ouvert en fenêtre modale par-dessus la liste.
const TaskDetailModal = lazy(() => import('./pages/TaskDetail').then((m) => ({ default: m.TaskDetailModal })));
const MyDay = lazy(() => import('./pages/MyDay'));
const MyStats = lazy(() => import('./pages/MyStats'));
const Planning = lazy(() => import('./pages/Planning'));
const Messaging = lazy(() => import('./pages/Messaging'));
const Profile = lazy(() => import('./pages/Profile'));
const Resources = lazy(() => import('./pages/Resources'));
const EmployeeAssistant = lazy(() => import('./pages/EmployeeAssistant'));
const Announcements = lazy(() => import('./pages/Announcements'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminCreateTask = lazy(() => import('./pages/admin/AdminCreateTask'));
const CreateTaskModal = lazy(() => import('./pages/admin/AdminCreateTask').then((m) => ({ default: m.CreateTaskModal })));
const AdminListView = lazy(() => import('./pages/admin/AdminListView'));
const AdminTasksToValidate = lazy(() => import('./pages/admin/AdminTasksToValidate'));
const AdminDaily = lazy(() => import('./pages/admin/AdminDaily'));
const AdminLateTasks = lazy(() => import('./pages/admin/AdminLateTasks'));
const AdminTaskRequests = lazy(() => import('./pages/admin/AdminTaskRequests'));
const AdminStatistics = lazy(() => import('./pages/admin/AdminStatistics'));
const AdminPlanningPresence = lazy(() => import('./pages/admin/AdminPlanningPresence'));
const AdminAssistant = lazy(() => import('./pages/admin/AdminAssistant'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserProfile = lazy(() => import('./pages/admin/AdminUserProfile'));
const AdminMessaging = lazy(() => import('./pages/admin/AdminMessaging'));
const AdminResources = lazy(() => import('./pages/admin/AdminResources'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminMailbox = lazy(() => import('./pages/admin/AdminMailbox'));

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
      // Auth par cookie httpOnly : on se base sur la présence de l'utilisateur en session
      // (le token n'est plus lisible en JS). Le heartbeat porte le cookie via withCredentials.
      if (!getUser()) return;
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
      <InstallPrompt />
      <AnnouncementPopup />
      <Suspense fallback={<RouteFallback />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  );
}

// Routes de l'app. Isolé dans un composant pour pouvoir lire useLocation (background location) :
// une tâche ouverte depuis une liste s'affiche en MODALE par-dessus la liste (state.backgroundLocation),
// tout en gardant l'URL /tasks/:id (le lien direct / le rafraîchissement ouvrent la page pleine).
function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  return (
    <>
      <Routes location={backgroundLocation || location}>
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
        <Route
          path="/announcements"
          element={
            <ProtectedRoute>
              <Announcements />
            </ProtectedRoute>
          }
        />

        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/create-task" element={<AdminRoute><AdminCreateTask /></AdminRoute>} />
        <Route path="/admin/lists" element={<AdminRoute><AdminListView /></AdminRoute>} />
        <Route path="/admin/validate" element={<AdminRoute><AdminTasksToValidate /></AdminRoute>} />
        <Route path="/admin/daily" element={<AdminRoute><AdminDaily /></AdminRoute>} />
        <Route path="/admin/late" element={<AdminRoute><AdminLateTasks /></AdminRoute>} />
        <Route path="/admin/task-requests" element={<AdminRoute><AdminTaskRequests /></AdminRoute>} />
        <Route path="/admin/stats" element={<AdminRoute><AdminStatistics /></AdminRoute>} />
        <Route path="/admin/planning" element={<AdminRoute><AdminPlanningPresence /></AdminRoute>} />
        <Route path="/admin/assistant" element={<AdminRoute><AdminAssistant /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/users/:id" element={<AdminRoute><AdminUserProfile /></AdminRoute>} />
        <Route path="/admin/messaging" element={<AdminRoute><AdminMessaging /></AdminRoute>} />
        <Route path="/admin/resources" element={<AdminRoute><AdminResources /></AdminRoute>} />
        <Route path="/admin/mailbox" element={<AdminRoute><AdminMailbox /></AdminRoute>} />
        <Route path="/admin/profile" element={<AdminRoute><AdminProfile /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      {/* Route modale : rendue EN PLUS de la liste de fond quand on vient d'une liste. */}
      {backgroundLocation && (
        <Routes>
          <Route
            path="/tasks/:id"
            element={
              <ProtectedRoute>
                <TaskDetailModal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-task"
            element={
              <ProtectedRoute role="ADMIN">
                <CreateTaskModal />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default App;
