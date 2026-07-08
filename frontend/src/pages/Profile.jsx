import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';

function Profile() {
  const changePassword = useAuthStore((state) => state.changePassword);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    api.get('/api/auth/me').then((res) => setProfile(res.data));
  }, []);

  function resetPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      setSuccessMessage('Mot de passe mis à jour');
      resetPasswordForm();
    } else {
      setError(result.message);
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
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Mon profil</h1>

      <p>Nom : {profile.full_name}</p>
      <p>Email : {profile.email}</p>
      <p>Téléphone : {profile.phone}</p>
      <p>Poste : {profile.position}</p>

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

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}

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

export default Profile;
