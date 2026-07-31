import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import * as avatarService from '../../services/avatarService';
import useAuthStore from '../../store/authStore';
import { notifySuccess, notifyError } from '../../utils/toast';
import { PageSkeleton } from '../../components/Skeleton';
import NotificationToggle from '../../components/NotificationToggle';
import '../../styles/profile-page.css';

function Icon({ type }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };

  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    camera: (
      <>
        <path d="M4 8.5h3l1.3-2h7.4l1.3 2h3v10H4v-10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="13.5" r="3" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    save: (
      <>
        <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 3v5M17 3v5M3.5 10h17" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 19 6v5c0 4.4-2.5 7.5-7 10-4.5-2.5-7-5.6-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </>
    ),
  };

  return <svg {...common}>{paths[type] || paths.user}</svg>;
}

function MetricCard({ icon, label, value, helper, variant = 'blue' }) {
  return (
    <article className={`profile-metric profile-metric--${variant}`}>
      <span className="profile-metric-icon"><Icon type={icon} /></span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

function AdminProfile() {
  const changePassword = useAuthStore((state) => state.changePassword);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    postal_address: '',
    birth_date: '',
    email: '',
    position: '',
    description: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const fullName = useMemo(() => {
    if (!profile) return 'Administrateur';
    return profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Administrateur';
  }, [profile]);

  useEffect(() => {
    let objectUrl;
    api
      .get('/api/auth/me')
      .then((res) => {
        setProfile(res.data);
        setForm({
          first_name: res.data.first_name || '',
          last_name: res.data.last_name || '',
          phone: res.data.phone || '',
          postal_address: res.data.postal_address || '',
          birth_date: res.data.birth_date ? String(res.data.birth_date).slice(0, 10) : '',
          email: res.data.email || '',
          position: res.data.position || '',
          description: res.data.description || '',
        });
        if (res.data.has_avatar) {
          return avatarService.getMyAvatarBlob();
        }
        return null;
      })
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger le profil'))
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      notifyError('La photo doit être au format PNG ou JPEG');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notifyError('La photo ne doit pas dépasser 5 Mo');
      event.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    try {
      await avatarService.uploadAvatar(file);
      const blob = await avatarService.getMyAvatarBlob();
      setAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setProfile((current) => ({ ...current, has_avatar: true }));
      notifySuccess('Photo de profil mise à jour');
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer la photo");
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const result = await updateProfile(form);
      if (result.success) {
        setProfile((prev) => ({ ...prev, ...result.user }));
        notifySuccess('Profil mis à jour');
      } else {
        notifyError(result.message);
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    if (passwordForm.new_password.length < 8) {
      notifyError('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      notifyError('La confirmation du mot de passe ne correspond pas');
      return;
    }

    setChangingPassword(true);
    try {
      const result = await changePassword(passwordForm.current_password, passwordForm.new_password);
      if (result.success) {
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
        setShowPasswordForm(false);
        notifySuccess('Mot de passe mis à jour');
      } else {
        notifyError(result.message);
      }
    } finally {
      setChangingPassword(false);
    }
  }

  const joinedAt = profile?.created_at
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(profile.created_at)
      )
    : '—';

  if (loading) {
    return <PageSkeleton variant="form" />;
  }

  return (
    <section className="employee-profile-page">
      <div className="profile-top-grid">
        <article className="profile-hero-card">
          <div className="profile-avatar-wrap">
            <div className="profile-large-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={`Photo de ${fullName}`} /> : <Icon type="user" />}
            </div>
            <button
              type="button"
              className="profile-camera-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label='Modifier la photo de profil'
            >
              <Icon type="camera" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleAvatarChange} hidden />
          </div>

          <div className="profile-identity">
            <h1>{fullName}</h1>
            <div className="profile-badges">
              <span className="profile-role-badge"><Icon type="check" /> Administrator</span>
              <span className="profile-status-badge"><Icon type="check" /> Active account</span>
            </div>
            <p><Icon type="mail" /> {profile?.email || 'Adresse courriel non disponible'}</p>
            <p><Icon type="user" /> {profile?.position || 'Poste non renseigné'}</p>

            <div className="profile-hero-actions">
              <button
                type="button"
                className="profile-secondary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <Icon type="camera" />
                {uploadingAvatar ? 'Envoi…' : 'Changer la photo'}
              </button>
              <button type="submit" form="admin-profile-form" className="profile-primary-button" disabled={savingProfile}>
                <Icon type="save" />
                {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </article>

        <div className="profile-metrics-grid">
          <MetricCard
            icon="calendar"
            label='Membre depuis'
            value={joinedAt}
            helper='Date de création du compte'
            variant="sky"
          />
          <MetricCard icon="shield" label='Rôle' value='Administrateur' helper='Accès complet' variant="blue" />
          <MetricCard icon="check" label='Statut' value='Actif' helper='Compte vérifié' variant="cyan" />
        </div>
      </div>

      <div className="profile-content-grid">
        <div className="profile-column">
          <article className="profile-panel">
            <header className="profile-panel-header">
              <span><Icon type="user" /></span>
              <div>
                <p>Informations</p>
                <h2>Informations personnelles</h2>
              </div>
            </header>

            <form id="admin-profile-form" className="profile-form" onSubmit={handleProfileSubmit}>
              <div className="profile-form-grid">
                <label>
                  <span>Prénom</span>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm((c) => ({ ...c, first_name: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Nom</span>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm((c) => ({ ...c, last_name: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Adresse courriel</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Téléphone</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Poste</span>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => setForm((c) => ({ ...c, position: e.target.value }))}
                    placeholder='Votre poste / fonction'
                  />
                </label>

                <label>
                  <span>Nom d’utilisateur</span>
                  <input type="text" value={profile?.username || ''} disabled />
                </label>

                <label>
                  <span>Date de naissance</span>
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setForm((c) => ({ ...c, birth_date: e.target.value }))}
                  />
                </label>

                <label className="profile-form-full">
                  <span>Adresse postale</span>
                  <input
                    type="text"
                    value={form.postal_address}
                    onChange={(e) => setForm((c) => ({ ...c, postal_address: e.target.value }))}
                    placeholder='Votre adresse'
                  />
                </label>

                <label className="profile-form-full">
                  <span>Description / présentation</span>
                  <textarea
                    rows="3"
                    value={form.description}
                    onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                    placeholder='Quelques mots pour vous présenter : parcours, formation, missions…'
                  />
                </label>
              </div>
            </form>
          </article>
        </div>

        <div className="profile-column">
          <article className="profile-panel">
            <header className="profile-panel-header">
              <span><Icon type="shield" /></span>
              <div>
                <p>Sécurité</p>
                <h2>Sécurité du compte</h2>
              </div>
            </header>

            <div className="profile-security-summary">
              <label>
                <span>Poste</span>
                <input type="text" value={profile?.position || 'Non renseigné'} disabled />
              </label>

              <button
                type="button"
                className="profile-outline-button"
                onClick={() => setShowPasswordForm((current) => !current)}
              >
                <Icon type="lock" />
                {showPasswordForm ? 'Fermer le formulaire' : 'Changer le mot de passe'}
              </button>
            </div>

            {showPasswordForm && (
              <form className="profile-password-form" onSubmit={handlePasswordSubmit}>
                <label>
                  <span>Mot de passe actuel</span>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, current_password: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  <span>Nouveau mot de passe</span>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, new_password: e.target.value }))}
                    minLength={8}
                    required
                  />
                </label>

                <label>
                  <span>Confirmer le mot de passe</span>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, confirm_password: e.target.value }))}
                    minLength={8}
                    required
                  />
                </label>

                <label className="profile-show-passwords">
                  <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
                  Show passwords
                </label>

                <button type="submit" className="profile-primary-button" disabled={changingPassword}>
                  <Icon type="shield" />
                  {changingPassword ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            )}
          </article>

          <NotificationToggle />

          <article className="profile-help-card">
            <span><Icon type="shield" /></span>
            <div>
              <strong>Protection des données</strong>
              <p>Vos informations personnelles sont accessibles uniquement depuis votre compte authentifié.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export default AdminProfile;
