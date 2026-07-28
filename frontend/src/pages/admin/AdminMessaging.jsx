import { useLocation, useSearchParams } from 'react-router-dom';
import MessagingView from '../../components/messaging/MessagingView';

function AdminMessaging() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const canal = searchParams.get('canal');

  return (
    <MessagingView
      enableBulk
      initialRecipientId={location.state?.employeeId || null}
      initialChannel={canal}
      channelNonce={location.key}
    />
  );
}

export default AdminMessaging;
