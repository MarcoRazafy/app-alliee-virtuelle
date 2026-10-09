import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { heartbeatSession, signalSessionDisconnect } from './services/sessionService';
import { getUser } from './services/auth';
import useAuthStore, { FORCED_LOGOUT_KEY, SESSION_ENDED_MESSAGE, SESSION_LOST_EVENT } from './store/authStore';
import { notifyWarning } from './utils/toast';
import { limitCheckDelayMs, limitWarningMessage } from './utils/connectionLimit';
import InstallPrompt from './components/InstallPrompt';
import AnnouncementPopup from './components/AnnouncementPopup';
import Login from './pages/Login';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';

const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workspace = lazy(() => import('./pages/Workspace'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
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
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== FORCED_LOGOUT_KEY || !event.newValue) return;
      let message = null;
      try {
        message = JSON.parse(event.newValue).message;
      } catch {
      }
      const store = useAuthStore.getState();
      if (store.isAuthenticated) store.forceLogout(message, { broadcast: false });
      else if (message && message !== SESSION_ENDED_MESSAGE && (!store.error || store.error === SESSION_ENDED_MESSAGE)) {
        useAuthStore.setState({ error: message });
      }
    }
    function onSessionLost() {
      const store = useAuthStore.getState();
      if (store.isAuthenticated) store.forceLogout(SESSION_ENDED_MESSAGE);
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_LOST_EVENT, onSessionLost);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_LOST_EVENT, onSessionLost);
    };
  }, []);

  useEffect(() => {
    let limitTimer = null;
    let warned = false;

    function applyHeartbeat(data) {
      clearTimeout(limitTimer);
      if (data?.forced_logout) {
        useAuthStore.getState().forceLogout(data.message);
        return;
      }
      const limit = data?.connection_limit;
      if (!limit) return;
      if (limit.warn && !warned) {
        warned = true;
        notifyWarning(limitWarningMessage(limit));
      } else if (!limit.warn) {
        warned = false;
      }
      const delay = limitCheckDelayMs(limit);
      if (delay !== null) limitTimer = setTimeout(heartbeat, delay);
    }

    function heartbeat() {
      if (!getUser()) return;
      heartbeatSession().then(applyHeartbeat).catch(() => {});
    }
    heartbeat();
    const interval = window.setInterval(heartbeat, 20000);
    function onVisible() {
      if (document.visibilityState === 'visible') heartbeat();
    }
    function onPageHide(event) {
      if (event.persisted) return;
      signalSessionDisconnect();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearTimeout(limitTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pagehide', onPageHide);
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
