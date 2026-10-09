import { useLocation } from 'react-router-dom';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import MessagingView from '../components/messaging/MessagingView';

function Messaging() {
  const location = useLocation();

  return (
    <EmployeeLayout
      title="Messagerie"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Messagerie' }]}
      subtitle="Échangez avec votre équipe en temps réel"
    >
      <MessagingView
        initialRecipientId={location.state?.employeeId || null}
        channelNonce={location.key}
      />
    </EmployeeLayout>
  );
}

export default Messaging;
