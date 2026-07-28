import EmployeeLayout from '../components/employee/EmployeeLayout';
import MessagingView from '../components/messaging/MessagingView';

function Messaging() {
  return (
    <EmployeeLayout
      title="Messaging"
      breadcrumb={[{ label: 'Home', to: '/dashboard' }, { label: 'Messaging' }]}
      subtitle="Chat with your team in real time"
    >
      <MessagingView />
    </EmployeeLayout>
  );
}

export default Messaging;
