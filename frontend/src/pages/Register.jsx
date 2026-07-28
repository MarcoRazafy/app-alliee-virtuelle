import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AuthLayout from '../components/auth/AuthLayout';
import AuthBanner from '../components/auth/AuthBanner';
import PasswordInput from '../components/auth/PasswordInput';

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
      setLocalError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setLocalError('Password must be at least 8 characters long');
      return;
    }
    if (form.username.length < 3) {
      setLocalError('Username must be at least 3 characters long');
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
      title="Create an account"
      subtitle="Join L'Alliée Virtuelle in just a moment"
      wide
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form-grid">
          <span className="auth-section-label">Identity</span>
          <div className="auth-field">
            <label htmlFor="first_name">First name</label>
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
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" type="text" value={form.last_name} onChange={handleChange} required />
          </div>
          <div className="auth-field auth-field--full">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" value={form.username} onChange={handleChange} required />
            <span className="auth-username-hint">3 to 50 characters: letters, digits and underscore only</span>
          </div>

          <span className="auth-section-label">Account</span>
          <div className="auth-field auth-field--full">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="8 characters minimum"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
          </div>

          <span className="auth-section-label">Contact & role</span>
          <div className="auth-field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="position">Position</label>
            <input id="position" name="position" type="text" value={form.position} onChange={handleChange} required />
          </div>
          <div className="auth-field">
            <label htmlFor="postal_address">Postal address</label>
            <input
              id="postal_address"
              name="postal_address"
              type="text"
              value={form.postal_address}
              onChange={handleChange}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="birth_date">Date of birth</label>
            <input id="birth_date" name="birth_date" type="date" value={form.birth_date} onChange={handleChange} />
          </div>
        </div>

        {localError && <AuthBanner type="error">{localError}</AuthBanner>}
        {successMessage && <AuthBanner type="success">{successMessage}</AuthBanner>}

        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" />}
          {isSubmitting ? 'Creating...' : 'Create my account'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Register;
