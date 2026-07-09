import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

function Register() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone: '',
    position: '',
  });
  const [localError, setLocalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
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

    const { confirmPassword, ...payload } = form;
    const result = await register(payload);

    if (result.success) {
      setSuccessMessage(result.message);
      setTimeout(() => navigate('/login'), 2000);
    } else {
      setLocalError(result.message);
    }
  }

  return (
    <div>
      <h1>Créer un compte</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
          <input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="full_name">Nom complet</label>
          <input id="full_name" name="full_name" type="text" value={form.full_name} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required />
        </div>
        <div>
          <label htmlFor="position">Poste</label>
          <input id="position" name="position" type="text" value={form.position} onChange={handleChange} required />
        </div>
        {localError && <p>{localError}</p>}
        {successMessage && <p>{successMessage}</p>}
        <button type="submit">Créer compte</button>
      </form>
      <p>
        Déjà un compte ? <Link to="/login">Se connecter</Link>
      </p>
    </div>
  );
}

export default Register;
