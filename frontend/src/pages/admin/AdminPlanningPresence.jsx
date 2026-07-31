import { useState } from 'react';
import AdminPlanning from './AdminPlanning';
import AdminPresence from './AdminPresence';
import '../../styles/admin-presence.css';

function AdminPlanningPresence() {
  const [tab, setTab] = useState('planning');

  return (
    <div className="pp-page">
      <div className="pp-tabs" role="tablist" aria-label="Présence et planning">
        <button
          id="planning-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'planning'}
          aria-controls="planning-panel"
          className={`pp-tab${tab === 'planning' ? ' pp-tab--active' : ''}`}
          onClick={() => setTab('planning')}
        >
          Planning
        </button>
        <button
          id="presence-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'presence'}
          aria-controls="presence-panel"
          className={`pp-tab${tab === 'presence' ? ' pp-tab--active' : ''}`}
          onClick={() => setTab('presence')}
        >
          Présence
        </button>
      </div>

      <div
        id={tab === 'planning' ? 'planning-panel' : 'presence-panel'}
        role="tabpanel"
        aria-labelledby={tab === 'planning' ? 'planning-tab' : 'presence-tab'}
      >
        {tab === 'planning' ? <AdminPlanning /> : <AdminPresence />}
      </div>
    </div>
  );
}

export default AdminPlanningPresence;
