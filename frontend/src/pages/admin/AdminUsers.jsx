import { useEffect, useState, useCallback } from 'react';
import * as userService from '../../services/userService';
import * as avatarService from '../../services/avatarService';
import UserInfoPanel from '../../components/admin/UserInfoPanel';
import { notifySuccess, notifyError, notifyInfo } from '../../utils/toast';
import { IconSearch, IconCheckCircle, IconArrowRight } from '../../components/icons';
import { PageSkeleton } from '../../components/Skeleton';
import '../../styles/admin.css';
import '../../styles/admin-users.css';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIF', label: 'Active' },
  { value: 'SUSPENDU', label: 'Suspended' },
  { value: 'REFUSÉ', label: 'Rejected' },
];

const USER_STATUS_META = {
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

function UserAvatar({ user, size }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    if (user.has_avatar) {
      avatarService
        .getUserAvatarBlob(user.id)
        .then((blob) => {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        })
        .catch(() => setUrl(null));
    } else {
      setUrl(null);
    }
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [user.id, user.has_avatar]);

  const cls = `user-avatar${size === 'sm' ? ' user-avatar--sm' : ''}`;
  return url ? (
    <img src={url} alt={user.full_name} className={`${cls} user-avatar--img`} />
  ) : (
    <span className={cls}>{initialsOf(user.full_name) || '?'}</span>
  );
}

function EmployeesTab({ onSelect }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');

  function load() {
    userService
      .getAllUsers({ role: 'EMPLOYEE', search, status: statusFilter || undefined })
      .then(setUsers)
      .catch((err) => notifyError(err.response?.data?.error || 'Unable to load users'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const filteredUsers = users.filter(
    (user) => !positionFilter || (user.position || '').toLowerCase().includes(positionFilter.toLowerCase())
  );

  async function handleSuspend(user) {
    if (!window.confirm(`Suspend ${user.full_name}'s account?`)) return;
    try {
      await userService.suspendUser(user.id);
      notifySuccess('Account suspended');
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to suspend this account');
    }
  }

  async function handleActivate(user) {
    try {
      await userService.activateUser(user.id);
      notifySuccess('Account reactivated');
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to reactivate this account');
    }
  }

  async function handlePromote(user) {
    if (!window.confirm(`Promote ${user.full_name} to administrator? This action is irreversible from this interface.`)) {
      return;
    }
    try {
      await userService.promoteUser(user.id);
      notifySuccess(`${user.full_name} is now an administrator`);
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to promote this user');
    }
  }

  const stop = (e) => e.stopPropagation();

  if (loading && users.length === 0) return <PageSkeleton variant="table" />;

  return (
    <div>
      <div className="admin-filter-bar ausers-filters">
        <div className="filter-search ausers-search">
          <IconSearch />
          <input placeholder="Search a name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
          {STATUS_FILTERS.map((o) => (
            <button
              key={o.value || 'all'}
              type="button"
              className={`filter-chip${statusFilter === o.value ? ' filter-chip--active' : ''}`}
              onClick={() => setStatusFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <input
            className="filter-select"
            placeholder="Filter by position"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="empty-state">No user matches these filters.</div>
      ) : (
        <div className="task-table-wrap ausers-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const meta = USER_STATUS_META[user.status] || { label: user.status, cls: 'user-refused' };
                return (
                  <tr key={user.id} className="ausers-row" onClick={() => onSelect(user)}>
                    <td>
                      <span className="ausers-user-cell">
                        <UserAvatar user={user} />
                        <span className="ausers-user-text">
                          <span className="ausers-user-name">{user.full_name}</span>
                          <span className="ausers-user-email">{user.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>{user.position || '—'}</td>
                    <td>
                      <span className={`pill pill--${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td onClick={stop}>
                      <div className="ausers-actions">
                        <button
                          type="button"
                          className="ausers-action-btn"
                          onClick={() => notifyInfo('Profile editing coming soon')}
                        >
                          Edit
                        </button>
                        {user.status === 'ACTIF' && (
                          <button type="button" className="ausers-action-btn ausers-action-btn--warn" onClick={() => handleSuspend(user)}>
                            Suspend
                          </button>
                        )}
                        {user.status === 'SUSPENDU' && (
                          <button type="button" className="ausers-action-btn ausers-action-btn--ok" onClick={() => handleActivate(user)}>
                            Activate
                          </button>
                        )}
                        {user.role === 'EMPLOYEE' && (
                          <button type="button" className="ausers-action-btn" onClick={() => handlePromote(user)}>
                            Promote
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PendingTab({ onCountChange }) {
  const [pending, setPending] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMotif, setBulkMotif] = useState('');
  const [motifs, setMotifs] = useState({});

  function load() {
    userService
      .getPendingUsers()
      .then((data) => {
        setPending(data);
        onCountChange(data.length);
      })
      .catch((err) => notifyError(err.response?.data?.error || 'Unable to load requests'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleApprove(id) {
    try {
      await userService.approveUser(id);
      notifySuccess('Account approved');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to approve this account');
    }
  }

  async function handleReject(id) {
    const motif = motifs[id];
    try {
      await userService.rejectUser(id, motif);
      notifySuccess('Account rejected');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Unable to reject this account');
    }
  }

  async function handleBulkApprove() {
    if (!window.confirm(`Approve ${selectedIds.length} request(s)?`)) return;
    await Promise.all(selectedIds.map((id) => userService.approveUser(id)));
    notifySuccess(`${selectedIds.length} account(s) approved`);
    setSelectedIds([]);
    load();
  }

  async function handleBulkReject() {
    if (!window.confirm(`Reject ${selectedIds.length} request(s)? The reason "${bulkMotif}" will be applied to all.`)) return;
    await Promise.all(selectedIds.map((id) => userService.rejectUser(id, bulkMotif)));
    notifySuccess(`${selectedIds.length} account(s) rejected`);
    setSelectedIds([]);
    setBulkMotif('');
    load();
  }

  if (pending.length === 0) {
    return <div className="empty-state">No pending access requests. 🎉</div>;
  }

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="validate-bulk ausers-bulk">
          <span className="validate-bulk-count">{selectedIds.length} selected</span>
          <button type="button" className="btn-primary validate-bulk-confirm" onClick={handleBulkApprove}>
            <IconCheckCircle />
            Approve ({selectedIds.length})
          </button>
          <div className="validate-bulk-reject">
            <input className="form-input" placeholder="Rejection reason (bulk)" value={bulkMotif} onChange={(e) => setBulkMotif(e.target.value)} />
            <button type="button" className="btn-danger" onClick={handleBulkReject}>
              Reject ({selectedIds.length})
            </button>
          </div>
        </div>
      )}

      <div className="ausers-pending-list">
        {pending.map((user) => (
          <div key={user.id} className="ausers-pending-card">
            <label className="ausers-pending-check">
              <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleSelect(user.id)} />
            </label>
            <UserAvatar user={user} />
            <div className="ausers-pending-info">
              <span className="ausers-user-name">{user.full_name}</span>
              <span className="ausers-user-email">{user.email}</span>
              <span className="ausers-pending-meta">
                {user.position || '—'} · requested on {new Date(user.created_at).toLocaleDateString('en-US')}
              </span>
            </div>
            <div className="ausers-pending-actions">
              <button type="button" className="ausers-action-btn ausers-action-btn--ok" onClick={() => handleApprove(user.id)}>
                Approve
              </button>
              <div className="ausers-reject-row">
                <input
                  className="form-input"
                  placeholder="Rejection reason"
                  value={motifs[user.id] || ''}
                  onChange={(e) => setMotifs({ ...motifs, [user.id]: e.target.value })}
                />
                <button type="button" className="ausers-action-btn ausers-action-btn--warn" onClick={() => handleReject(user.id)}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminUsers() {
  const [tab, setTab] = useState('employees');
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);

  const refreshPendingCount = useCallback(() => {
    userService.getPendingUsers().then((data) => setPendingCount(data.length)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <div className="ausers-page">
      <div className="ausers-tabs">
        <button
          type="button"
          className={`ausers-tab${tab === 'employees' ? ' ausers-tab--active' : ''}`}
          onClick={() => setTab('employees')}
        >
          Employees
        </button>
        <button
          type="button"
          className={`ausers-tab${tab === 'pending' ? ' ausers-tab--active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Access requests
          {pendingCount > 0 && <span className="ausers-tab-badge">{pendingCount}</span>}
        </button>
      </div>

      {tab === 'employees' && <EmployeesTab onSelect={setSelectedUser} />}
      {tab === 'pending' && <PendingTab onCountChange={setPendingCount} />}

      {selectedUser && <UserInfoPanel user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

export default AdminUsers;
