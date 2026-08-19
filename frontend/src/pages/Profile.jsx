import { useEffect, useMemo, useRef, useState } from 'react';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import NotificationToggle from '../components/NotificationToggle';
import MyEvaluations from '../components/employee/MyEvaluations';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import * as statsService from '../services/statsService';
import { notifyError, notifySuccess } from '../utils/toast';
import { formatDurationShort } from '../utils/formatters';
import '../styles/profile-page.css';

function Icon({ type }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
  };

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
    clock: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function Profile() {
  const authUser = useAuthStore((state) => state.user);
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
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

  const [stats, setStats] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const fullName = useMemo(() => {
    if (!profile) return authUser?.full_name || 'Utilisateur';
    return profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Utilisateur';
  }, [profile, authUser]);

  const profileInitials = useMemo(
    () =>
      fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
    [fullName]
  );

  async function loadAvatar(hasAvatar) {
    if (!hasAvatar) {
      setAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    try {
      const response = await api.get('/api/auth/me/avatar', { responseType: 'blob' });
      const nextUrl = URL.createObjectURL(response.data);
      setAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch {
      setAvatarUrl(null);
    }
  }

  async function loadPage() {
    setLoading(true);
    try {
      const [profileResponse, statsResponse] = await Promise.allSettled([
        api.get('/api/auth/me'),
        statsService.getMyStats(
          new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10)
        ),
      ]);

      if (profileResponse.status !== 'fulfilled') {
        throw profileResponse.reason;
      }

      const currentProfile = profileResponse.value.data;
      setProfile(currentProfile);
      setForm({
        first_name: currentProfile.first_name || '',
        last_name: currentProfile.last_name || '',
        phone: currentProfile.phone || '',
        postal_address: currentProfile.postal_address || '',
        birth_date: currentProfile.birth_date ? String(currentProfile.birth_date).slice(0, 10) : '',
        email: currentProfile.email || '',
        position: currentProfile.position || '',
        description: currentProfile.description || '',
      });

      if (statsResponse.status === 'fulfilled') {
        setStats(statsResponse.value);
      }

      await loadAvatar(currentProfile.has_avatar);
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de charger le profil');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
    return () => {
      setAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, []);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);

    try {
      const response = await api.put('/api/auth/me', form);
      const updated = response.data;
      setProfile((current) => ({ ...current, ...updated }));

      useAuthStore.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              full_name: updated.full_name || state.user.full_name,
            }
          : state.user,
      }));

      notifySuccess('Profil mis à jour');
    } catch (error) {
      notifyError(error.response?.data?.errors?.join(', ') || error.response?.data?.error || 'Impossible de mettre à jour le profil');
    } finally {
      setSavingProfile(false);
    }
  }

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
      const payload = new FormData();
      payload.append('file', file);
      await api.post('/api/auth/me/avatar', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await loadAvatar(true);
      setProfile((current) => ({ ...current, has_avatar: true }));
      notifySuccess('Photo de profil mise à jour');
    } catch (error) {
      notifyError(error.response?.data?.error || "Impossible d'envoyer la photo");
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
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
      await api.put('/api/auth/me/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });

      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setShowPasswordForm(false);
      notifySuccess('Mot de passe mis à jour');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de modifier le mot de passe');
    } finally {
      setChangingPassword(false);
    }
  }

  const summary = stats?.summary || {};
  const joinedAt = profile?.created_at
    ? new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(profile.created_at))
    : '—';

  if (loading) {
    return <EmployeeLayout title='Profil' subtitle='Gérez vos informations personnelles et vos préférences' skeleton="form" />;
  }

  return (
    <EmployeeLayout
      title='Profil'
      breadcrumb={[{ label: 'Accueil', to: '/dashboard' }, { label: 'Profil' }]}
      subtitle='Gérez vos informations personnelles et vos préférences'
    >
      <section className="employee-profile-page">
        <div className="profile-top-grid">
          <article className="profile-hero-card">
            <div className="profile-avatar-wrap">
              <div className="profile-large-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={`Photo de ${fullName}`} />
                ) : (
                  <span aria-label={`Initiales de ${fullName}`}>{profileInitials || '?'}</span>
                )}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleAvatarChange}
                hidden
              />
            </div>

            <div className="profile-identity">
              <h1>{fullName}</h1>
              <div className="profile-badges">
                <span className="profile-role-badge"><Icon type="check" /> {profile?.role === 'ADMIN' ? 'Administrateur' : 'Employé'}</span>
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
                <button
                  type="submit"
                  form="employee-profile-form"
                  className="profile-primary-button"
                  disabled={savingProfile}
                >
                  <Icon type="save" />
                  {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </article>

          <div className="profile-metrics-grid">
            <MetricCard
              icon="check"
              label='Tâches confirmées'
              value={summary.tasks_confirmed ?? 0}
              helper='Sur les 30 derniers jours'
              variant="cyan"
            />
            <MetricCard
              icon="clock"
              label='Temps travaillé'
              value={formatDurationShort(summary.total_hours_worked_seconds || 0)}
              helper='Sessions terminées'
              variant="blue"
            />
            <MetricCard
              icon="calendar"
              label='Membre depuis'
              value={joinedAt}
              helper='Date de création du compte'
              variant="sky"
            />
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

              <form id="employee-profile-form" className="profile-form" onSubmit={handleProfileSubmit}>
                <div className="profile-form-grid">
                  <label>
                    <span>Prénom</span>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Nom</span>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Adresse courriel</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Téléphone</span>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Poste</span>
                    <input
                      type="text"
                      value={form.position}
                      onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                      placeholder='Votre poste / fonction'
                    />
                  </label>

                  <label>
                    <span>Date de naissance</span>
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))}
                    />
                  </label>

                  <label className="profile-form-full">
                    <span>Adresse</span>
                    <input
                      type="text"
                      value={form.postal_address}
                      onChange={(event) => setForm((current) => ({ ...current, postal_address: event.target.value }))}
                      placeholder='Votre adresse'
                    />
                  </label>

                  <label className="profile-form-full">
                    <span>Description / présentation</span>
                    <textarea
                      rows="3"
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
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
                  <span>Nom d’utilisateur</span>
                  <input type="text" value={profile?.username || ''} disabled />
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
                      onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Nouveau mot de passe</span>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={passwordForm.new_password}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                      minLength={8}
                      required
                    />
                  </label>

                  <label>
                    <span>Confirmer le mot de passe</span>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={passwordForm.confirm_password}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
                      minLength={8}
                      required
                    />
                  </label>

                  <label className="profile-show-passwords">
                    <input
                      type="checkbox"
                      checked={showPasswords}
                      onChange={(event) => setShowPasswords(event.target.checked)}
                    />
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

            <article className="profile-panel">
              <header className="profile-panel-header">
                <span><Icon type="calendar" /></span>
                <div>
                  <p>Compte</p>
                  <h2>Informations professionnelles</h2>
                </div>
              </header>

              <dl className="profile-professional-list">
                <div>
                  <dt>Rôle</dt>
                  <dd>{profile?.role === 'ADMIN' ? 'Administrateur' : 'Employé'}</dd>
                </div>
                <div>
                  <dt>Poste</dt>
                  <dd>{profile?.position || 'Non renseigné'}</dd>
                </div>
                <div>
                  <dt>Statut du compte</dt>
                  <dd className="profile-active-value">Actif</dd>
                </div>
                <div>
                  <dt>Adresse courriel</dt>
                  <dd>{profile?.email || '—'}</dd>
                </div>
              </dl>
            </article>

            <article className="profile-help-card">
              <span><Icon type="shield" /></span>
              <div>
                <strong>Protection des données</strong>
                <p>Vos informations personnelles sont accessibles uniquement depuis votre compte authentifié.</p>
              </div>
            </article>
          </div>
        </div>

        <div className="profile-evaluations">
          <MyEvaluations />
        </div>
      </section>
    </EmployeeLayout>
  );
}

export default Profile;
