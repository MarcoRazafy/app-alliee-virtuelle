import { useEffect, useState, useCallback } from 'react';
import * as userService from '../../services/userService';
import { notifySuccess, notifyError, notifyInfo } from '../../utils/toast';

function EmployeesTab() {
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

  function handleEdit() {
    notifyInfo('Modification du profil bientôt disponible');
  }

  return (
    <div>
      <div>
        <input placeholder="Rechercher (nom ou email)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="ACTIF">Actif</option>
          <option value="SUSPENDU">Suspendu</option>
          <option value="REFUSÉ">Refusé</option>
        </select>
        <input placeholder="Filtrer par poste" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} />
      </div>

      <table border="1" cellPadding="6" style={{ marginTop: '10px' }}>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Statut</th>
            <th>Poste</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((user) => (
            <tr key={user.id}>
              <td>{user.full_name}</td>
              <td>{user.email}</td>
              <td>{user.status}</td>
              <td>{user.position}</td>
              <td>
                <button onClick={handleEdit}>Modifier</button>
                <button onClick={() => handleSuspend(user)} disabled={user.status !== 'ACTIF'}>
                  Suspendre
                </button>
                <button onClick={() => handleActivate(user)} disabled={user.status !== 'SUSPENDU'}>
                  Activer
                </button>
                <button onClick={() => handlePromote(user)} disabled={user.role !== 'EMPLOYEE'}>
                  Promouvoir admin
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  return (
    <div>
      {selectedIds.length > 0 && (
        <div style={{ border: '1px solid black', padding: '10px', marginBottom: '10px' }}>
          <p>{selectedIds.length} demande(s) sélectionnée(s)</p>
          <button onClick={handleBulkApprove}>Approuver la sélection ({selectedIds.length})</button>
          <input placeholder="Motif de refus (lot)" value={bulkMotif} onChange={(e) => setBulkMotif(e.target.value)} />
          <button onClick={handleBulkReject}>Refuser la sélection ({selectedIds.length})</button>
        </div>
      )}

      {pending.length === 0 && <p>Aucune demande en attente.</p>}
      {pending.length > 0 && (
        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th></th>
              <th>Nom</th>
              <th>Email</th>
              <th>Poste</th>
              <th>Demandé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((user) => (
              <tr key={user.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleSelect(user.id)} />
                </td>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>{user.position}</td>
                <td>{new Date(user.created_at).toLocaleDateString('fr-FR')}</td>
                <td>
                  <button onClick={() => handleApprove(user.id)}>Approuver</button>
                  <input
                    placeholder="Motif de refus"
                    value={motifs[user.id] || ''}
                    onChange={(e) => setMotifs({ ...motifs, [user.id]: e.target.value })}
                  />
                  <button onClick={() => handleReject(user.id)}>Refuser</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminUsers() {
  const [tab, setTab] = useState('employees');
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(() => {
    userService.getPendingUsers().then((data) => setPendingCount(data.length)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <div>
      <h1>Utilisateurs</h1>

      <div>
        <button onClick={() => setTab('employees')} disabled={tab === 'employees'}>
          Employés
        </button>
        <button onClick={() => setTab('pending')} disabled={tab === 'pending'}>
          Demandes d'accès
          {pendingCount > 0 && (
            <span
              style={{ backgroundColor: 'red', color: 'white', borderRadius: '10px', padding: '2px 6px', marginLeft: '6px' }}
            >
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        {tab === 'employees' && <EmployeesTab />}
        {tab === 'pending' && <PendingTab onCountChange={setPendingCount} />}
      </div>
    </div>
  );
}

export default AdminUsers;
