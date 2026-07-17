import EmployeeLayout from '../components/employee/EmployeeLayout';
import MessagingView from '../components/messaging/MessagingView';

function Messaging() {
  return (
    <EmployeeLayout
      title="Messagerie"
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Messagerie' }]}
      subtitle="Échangez avec votre équipe en temps réel"
    >
      <MessagingView />
    </EmployeeLayout>
  );
}

export default Messaging;
