import { useState } from 'react';
import AdminPlanning from './AdminPlanning';
import AdminPresence from './AdminPresence';
import '../../styles/admin-presence.css';

function AdminPlanningPresence() {
  const [tab, setTab] = useState('planning');

  return (
    <div className="pp-page">
      <div className="pp-tabs">
        <button
          type="button"
          className={`pp-tab${tab === 'planning' ? ' pp-tab--active' : ''}`}
          onClick={() => setTab('planning')}
        >
          Planning
        </button>
        <button
          type="button"
          className={`pp-tab${tab === 'presence' ? ' pp-tab--active' : ''}`}
          onClick={() => setTab('presence')}
        >
          Présence
        </button>
      </div>

      {tab === 'planning' ? <AdminPlanning /> : <AdminPresence />}
    </div>
  );
}

export default AdminPlanningPresence;
