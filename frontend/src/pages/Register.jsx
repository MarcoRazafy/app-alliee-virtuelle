import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AuthLayout from '../components/auth/AuthLayout';
import AuthBanner from '../components/auth/AuthBanner';

function Register() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    username: '',
    phone: '',
    position: '',
    postal_address: '',
    birth_date: '',
  });
  const [localError, setLocalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();

  function handleChange(e) {
    let { value } = e.target;
    if (e.target.name === 'username') {
      value = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    }
    setForm({ ...form, [e.target.name]: value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError('');
    setSuccessMessage('');

    if (form.password !== form.confirmPassword) {
      setLocalError('Les mots de passe ne correspondent pas');
      return;
    }
    if (form.password.length < 8) {
      setLocalError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (form.username.length < 3) {
      setLocalError("Le nom d'utilisateur doit contenir au moins 3 caractères");
      return;
    }

    setIsSubmitting(true);
    const { confirmPassword, ...payload } = form;
    const result = await register(payload);
    setIsSubmitting(false);

    if (result.success) {
      setSuccessMessage(result.message);
      setTimeout(() => navigate('/login'), 2000);
    } else {
      setLocalError(result.message);
    }
  }

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoignez L'Alliée Virtuelle en quelques instants"
      wide
      footer={
        <>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form-grid">
          <span className="auth-section-label">Identité</span>
          <div className="auth-field">
            <label htmlFor="first_name">Prénom</label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              value={form.first_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="last_name">Nom</label>
            <input id="last_name" name="last_name" type="text" value={form.last_name} onChange={handleChange} required />
          </div>
          <div className="auth-field auth-field--full">
            <label htmlFor="username">Nom d'utilisateur</label>
            <input id="username" name="username" type="text" value={form.username} onChange={handleChange} required />
            <span className="auth-username-hint">3 à 50 caractères : lettres, chiffres et underscore uniquement</span>
          </div>

          <span className="auth-section-label">Compte</span>
          <div className="auth-field auth-field--full">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="8 caractères minimum"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <span className="auth-section-label">Contact & poste</span>
          <div className="auth-field">
            <label htmlFor="phone">Téléphone</label>
            <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="position">Poste</label>
            <input id="position" name="position" type="text" value={form.position} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="postal_address">Adresse postale</label>
            <input
              id="postal_address"
              name="postal_address"
              type="text"
              value={form.postal_address}
              onChange={handleChange}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="birth_date">Date de naissance</label>
            <input id="birth_date" name="birth_date" type="date" value={form.birth_date} onChange={handleChange} />
          </div>
        </div>

        {localError && <AuthBanner type="error">{localError}</AuthBanner>}
        {successMessage && <AuthBanner type="success">{successMessage}</AuthBanner>}

        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" />}
          {isSubmitting ? 'Création...' : 'Créer mon compte'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Register;
