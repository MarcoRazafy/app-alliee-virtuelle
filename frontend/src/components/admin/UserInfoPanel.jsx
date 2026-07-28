import { useEffect, useState } from 'react';
import * as avatarService from '../../services/avatarService';
import { formatDate } from '../../utils/formatters';
import { IconX } from '../icons';

const STATUS_META = {
  ACTIF: { label: 'Active', cls: 'user-active' },
  SUSPENDU: { label: 'Suspended', cls: 'user-suspended' },
  REFUSÉ: { label: 'Rejected', cls: 'user-refused' },
  EN_ATTENTE: { label: 'Pending', cls: 'user-pending' },
};

function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Icônes neutres, sans fond (règle d'icônes)
function Ic({ type }) {
  const c = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (type === 'mail')
    return (
      <svg {...c}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (type === 'phone')
    return (
      <svg {...c}>
        <path d="M6 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5V22a1 1 0 0 1-1 1A17 17 0 0 1 5 6a1 1 0 0 1 1-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  if (type === 'briefcase')
    return (
      <svg {...c}>
        <rect x="3" y="7" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  if (type === 'at')
    return (
      <svg {...c}>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  if (type === 'calendar')
    return (
      <svg {...c}>
        <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  if (type === 'pin')
    return (
      <svg {...c}>
        <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  if (type === 'clock')
    return (
      <svg {...c}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return null;
}

function InfoRow({ icon, label, value }) {
  const empty = value == null || value === '';
  return (
    <div className="uinfo-row">
      <span className="uinfo-row-icon">
        <Ic type={icon} />
      </span>
      <span className="uinfo-row-body">
        <span className="uinfo-row-label">{label}</span>
        <span className={`uinfo-row-value${empty ? ' uinfo-row-value--empty' : ''}`}>
          {empty ? 'Not set' : value}
        </span>
      </span>
    </div>
  );
}

function UserInfoPanel({ user, onClose }) {
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let obj;
    if (user?.has_avatar) {
      avatarService
        .getUserAvatarBlob(user.id)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setAvatarUrl(obj);
        })
        .catch(() => setAvatarUrl(null));
    } else {
      setAvatarUrl(null);
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [user]);

  const status = STATUS_META[user.status] || { label: user.status, cls: 'user-refused' };
  const roleLabel = user.role === 'ADMIN' ? 'Administrator' : 'Employee';

  return (
    <>
      <div className="emp-drawer-overlay" onClick={onClose} />
      <aside className="emp-drawer" role="dialog" aria-label="Personal information">
        <button type="button" className="emp-drawer-close" onClick={onClose} aria-label="Close">
          <IconX />
        </button>

        <header className="emp-drawer-head">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.full_name} className="emp-drawer-avatar emp-drawer-avatar--img" />
          ) : (
            <span className="emp-drawer-avatar">{initialsOf(user.full_name) || '?'}</span>
          )}
          <div className="emp-drawer-identity">
            <h2>{user.full_name}</h2>
            <p>{roleLabel}</p>
          </div>
          <span className={`pill pill--${status.cls}`}>{status.label}</span>
        </header>

        <section className="emp-drawer-section">
          <h3 className="app-section-title">Personal information</h3>
          <div className="uinfo-list">
            <InfoRow icon="mail" label="Email" value={user.email} />
            <InfoRow icon="phone" label="Phone" value={user.phone_number} />
            <InfoRow icon="briefcase" label="Position" value={user.position} />
            <InfoRow icon="at" label="Username" value={user.username} />
            <InfoRow icon="calendar" label="Date of birth" value={user.birth_date ? formatDate(user.birth_date) : null} />
            <InfoRow icon="pin" label="Postal address" value={user.postal_address} />
            <InfoRow icon="clock" label="Member since" value={user.created_at ? formatDate(user.created_at) : null} />
          </div>
        </section>
      </aside>
    </>
  );
}

export default UserInfoPanel;
