import { useEffect, useState, useCallback } from 'react';
import * as userService from '../../services/userService';
import * as avatarService from '../../services/avatarService';
import UserInfoPanel from '../../components/admin/UserInfoPanel';
import { notifySuccess, notifyError, notifyInfo } from '../../utils/toast';
import { IconSearch, IconCheckCircle, IconArrowRight } from '../../components/icons';
import '../../styles/admin.css';
import '../../styles/admin-users.css';

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'ACTIF', label: 'Actifs' },
  { value: 'SUSPENDU', label: 'Suspendus' },
  { value: 'REFUSÉ', label: 'Refusés' },
];

const USER_STATUS_META = {
  ACTIF: { label: 'Actif', cls: 'user-active' },
  SUSPENDU: { label: 'Suspendu', cls: 'user-suspended' },
  REFUSÉ: { label: 'Refusé', cls: 'user-refused' },
  EN_ATTENTE: { label: 'En attente', cls: 'user-pending' },
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');

  function load() {
    userService
      .getAllUsers({ role: 'EMPLOYEE', search, status: statusFilter || undefined })
      .then(setUsers)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les utilisateurs'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const filteredUsers = users.filter(
    (user) => !positionFilter || (user.position || '').toLowerCase().includes(positionFilter.toLowerCase())
  );

  async function handleSuspend(user) {
    if (!window.confirm(`Suspendre le compte de ${user.full_name} ?`)) return;
    try {
      await userService.suspendUser(user.id);
      notifySuccess('Compte suspendu');
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de suspendre ce compte');
    }
  }

  async function handleActivate(user) {
    try {
      await userService.activateUser(user.id);
      notifySuccess('Compte réactivé');
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de réactiver ce compte');
    }
  }

  async function handlePromote(user) {
    if (!window.confirm(`Promouvoir ${user.full_name} administrateur ? Cette action est irréversible depuis cette interface.`)) {
      return;
    }
    try {
      await userService.promoteUser(user.id);
      notifySuccess(`${user.full_name} est maintenant administrateur`);
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de promouvoir cet utilisateur');
    }
  }

  const stop = (e) => e.stopPropagation();

  return (
    <div>
      <div className="admin-filter-bar ausers-filters">
        <div className="filter-search ausers-search">
          <IconSearch />
          <input placeholder="Rechercher un nom ou un email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Statut</span>
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
            placeholder="Filtrer par poste"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="empty-state">Aucun utilisateur ne correspond à ces filtres.</div>
      ) : (
        <div className="task-table-wrap ausers-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>Employé</th>
                <th>Poste</th>
                <th>Statut</th>
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
                          onClick={() => notifyInfo('Modification du profil bientôt disponible')}
                        >
                          Modifier
                        </button>
                        {user.status === 'ACTIF' && (
                          <button type="button" className="ausers-action-btn ausers-action-btn--warn" onClick={() => handleSuspend(user)}>
                            Suspendre
                          </button>
                        )}
                        {user.status === 'SUSPENDU' && (
                          <button type="button" className="ausers-action-btn ausers-action-btn--ok" onClick={() => handleActivate(user)}>
                            Activer
                          </button>
                        )}
                        {user.role === 'EMPLOYEE' && (
                          <button type="button" className="ausers-action-btn" onClick={() => handlePromote(user)}>
                            Promouvoir
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
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger les demandes'));
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
      notifySuccess('Compte approuvé');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'approuver ce compte");
    }
  }

  async function handleReject(id) {
    const motif = motifs[id];
    try {
      await userService.rejectUser(id, motif);
      notifySuccess('Compte refusé');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de refuser ce compte');
    }
  }

  async function handleBulkApprove() {
    if (!window.confirm(`Approuver ${selectedIds.length} demande(s) ?`)) return;
    await Promise.all(selectedIds.map((id) => userService.approveUser(id)));
    notifySuccess(`${selectedIds.length} compte(s) approuvé(s)`);
    setSelectedIds([]);
    load();
  }

  async function handleBulkReject() {
    if (!window.confirm(`Refuser ${selectedIds.length} demande(s) ? Le motif "${bulkMotif}" sera appliqué à toutes.`)) return;
    await Promise.all(selectedIds.map((id) => userService.rejectUser(id, bulkMotif)));
    notifySuccess(`${selectedIds.length} compte(s) refusé(s)`);
    setSelectedIds([]);
    setBulkMotif('');
    load();
  }

  if (pending.length === 0) {
    return <div className="empty-state">Aucune demande d'accès en attente. 🎉</div>;
  }

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="validate-bulk ausers-bulk">
          <span className="validate-bulk-count">{selectedIds.length} sélectionnée(s)</span>
          <button type="button" className="btn-primary validate-bulk-confirm" onClick={handleBulkApprove}>
            <IconCheckCircle />
            Approuver ({selectedIds.length})
          </button>
          <div className="validate-bulk-reject">
            <input className="form-input" placeholder="Motif de refus (lot)" value={bulkMotif} onChange={(e) => setBulkMotif(e.target.value)} />
            <button type="button" className="btn-danger" onClick={handleBulkReject}>
              Refuser ({selectedIds.length})
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
                {user.position || '—'} · demandé le {new Date(user.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div className="ausers-pending-actions">
              <button type="button" className="ausers-action-btn ausers-action-btn--ok" onClick={() => handleApprove(user.id)}>
                Approuver
              </button>
              <div className="ausers-reject-row">
                <input
                  className="form-input"
                  placeholder="Motif de refus"
                  value={motifs[user.id] || ''}
                  onChange={(e) => setMotifs({ ...motifs, [user.id]: e.target.value })}
                />
                <button type="button" className="ausers-action-btn ausers-action-btn--warn" onClick={() => handleReject(user.id)}>
                  Refuser
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
          Employés
        </button>
        <button
          type="button"
          className={`ausers-tab${tab === 'pending' ? ' ausers-tab--active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Demandes d'accès
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
