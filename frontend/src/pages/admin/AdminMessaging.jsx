import { useLocation } from 'react-router-dom';
import MessagingView from '../../components/messaging/MessagingView';

function AdminMessaging() {
  const location = useLocation();

  return <MessagingView enableBulk initialRecipientId={location.state?.employeeId || null} />;
}

export default AdminMessaging;
