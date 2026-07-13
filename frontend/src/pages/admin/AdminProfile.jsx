import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import * as avatarService from '../../services/avatarService';
import useAuthStore from '../../store/authStore';
import { notifySuccess, notifyError } from '../../utils/toast';

function AdminProfile() {
  const changePassword = useAuthStore((state) => state.changePassword);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    postal_address: '',
    birth_date: '',
  });
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    api.get('/api/auth/me').then((res) => {
      setProfile(res.data);
      setProfileForm({
        first_name: res.data.first_name || '',
        last_name: res.data.last_name || '',
        phone: res.data.phone || '',
        postal_address: res.data.postal_address || '',
        birth_date: res.data.birth_date ? res.data.birth_date.slice(0, 10) : '',
      });
      if (res.data.has_avatar) {
        avatarService.getMyAvatarBlob().then((blob) => setAvatarUrl(URL.createObjectURL(blob)));
      }
    });
  }, []);

  // Libère l'URL objet précédente à chaque remplacement (et au démontage) pour éviter une fuite mémoire
  useEffect(() => {
    return () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await avatarService.uploadAvatar(file);
      const blob = await avatarService.getMyAvatarBlob();
      setAvatarUrl(URL.createObjectURL(blob));
      notifySuccess('Photo de profil mise à jour');
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'importer la photo");
    }
  }

  function resetPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  function handleProfileChange(e) {
    setProfileForm({ ...profileForm, [e.target.name]: e.target.value });
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    const result = await updateProfile(profileForm);
    if (result.success) {
      setProfile((prev) => ({ ...prev, ...result.user }));
      notifySuccess('Profil mis à jour');
    } else {
      notifyError(result.message);
    }
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

      <h2>Photo de profil</h2>
      <div>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Photo de profil"
            style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              backgroundColor: '#ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
            }}
          >
            {profile.full_name?.[0] || '?'}
          </div>
        )}
        <input type="file" accept="image/png,image/jpeg" onChange={handleAvatarChange} />
      </div>

      <p>Nom complet : {profile.full_name}</p>
      <p>Email : {profile.email}</p>
      <p>Nom d'utilisateur : {profile.username}</p>
      <p>Téléphone : {profile.phone}</p>
      <p>Rôle : Administrateur</p>
      <p>Poste : {profile.position}</p>
      {profile.postal_address && <p>Adresse postale : {profile.postal_address}</p>}
      {profile.birth_date && <p>Date de naissance : {profile.birth_date.slice(0, 10)}</p>}

      <label>
        <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
        Notifications d'alerte (échéances manquées/dépassées)
      </label>

      <h2>Modifier mes informations</h2>
      <form onSubmit={handleProfileSubmit}>
        <div>
          <label htmlFor="first_name">Prénom</label>
          <input
            id="first_name"
            name="first_name"
            value={profileForm.first_name}
            onChange={handleProfileChange}
            required
          />
        </div>
        <div>
          <label htmlFor="last_name">Nom</label>
          <input id="last_name" name="last_name" value={profileForm.last_name} onChange={handleProfileChange} required />
        </div>
        <div>
          <label htmlFor="phone">Téléphone</label>
          <input id="phone" name="phone" value={profileForm.phone} onChange={handleProfileChange} required />
        </div>
        <div>
          <label htmlFor="postal_address">Adresse postale</label>
          <input
            id="postal_address"
            name="postal_address"
            value={profileForm.postal_address}
            onChange={handleProfileChange}
          />
        </div>
        <div>
          <label htmlFor="birth_date">Date de naissance</label>
          <input
            id="birth_date"
            name="birth_date"
            type="date"
            value={profileForm.birth_date}
            onChange={handleProfileChange}
          />
        </div>
        <button type="submit">Enregistrer mes informations</button>
      </form>

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
