import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { notifySuccess, notifyError } from '../../utils/toast';

function AdminProfile() {
  const changePassword = useAuthStore((state) => state.changePassword);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useEffect(() => {
    api.get('/api/auth/me').then((res) => setProfile(res.data));
  }, []);

  function resetPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      notifyError('Les mots de passe ne correspondent pas');
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      notifySuccess('Mot de passe mis à jour');
      resetPasswordForm();
    } else {
      notifyError(result.message);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (!profile) {
    return <p>Chargement...</p>;
  }

  return (
    <div>
      <h1>Mon profil</h1>

      <p>Nom : {profile.full_name}</p>
      <p>Email : {profile.email}</p>
      <p>Rôle : Administrateur</p>
      <p>Poste : {profile.position}</p>

      <label>
        <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
        Notifications d'alerte (échéances manquées/dépassées)
      </label>

      <h2>Changer mon mot de passe</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="currentPassword">Ancien mot de passe</label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="newPassword">Nouveau mot de passe</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit">Enregistrer les modifications</button>
        <button type="button" onClick={resetPasswordForm}>
          Annuler
        </button>
      </form>

      <button onClick={handleLogout} style={{ backgroundColor: 'red', color: 'white' }}>
        Se déconnecter
      </button>
    </div>
  );
}

export default AdminProfile;
