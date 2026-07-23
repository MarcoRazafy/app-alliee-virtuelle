import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { heartbeatSession, signalSessionDisconnect } from './services/sessionService';
import { getToken } from './services/auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import MyTasks from './pages/MyTasks';
import TaskDetail from './pages/TaskDetail';
import MyDay from './pages/MyDay';
import MyStats from './pages/MyStats';
import Planning from './pages/Planning';
import Messaging from './pages/Messaging';
import Profile from './pages/Profile';
import Resources from './pages/Resources';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCreateTask from './pages/admin/AdminCreateTask';
import AdminListView from './pages/admin/AdminListView';
import AdminTasksToValidate from './pages/admin/AdminTasksToValidate';
import AdminLateTasks from './pages/admin/AdminLateTasks';
import AdminTaskRequests from './pages/admin/AdminTaskRequests';
import AdminStatistics from './pages/admin/AdminStatistics';
import AdminPlanningPresence from './pages/admin/AdminPlanningPresence';
import AdminAssistant from './pages/admin/AdminAssistant';
import AdminUsers from './pages/admin/AdminUsers';
import AdminMessaging from './pages/admin/AdminMessaging';
import AdminResources from './pages/admin/AdminResources';
import AdminProfile from './pages/admin/AdminProfile';
import ProtectedRoute from './components/ProtectedRoute';

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
    </BrowserRouter>
  );
}

export default App;
