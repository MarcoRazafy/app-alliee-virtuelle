import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AuthLayout from '../components/auth/AuthLayout';
import AuthBanner from '../components/auth/AuthBanner';

function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await login(identifier, password);
    setIsSubmitting(false);
    if (success) {
      navigate('/dashboard');
    }
  }

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Accédez à votre espace L'Alliée Virtuelle"
      footer={
        <>
          Pas encore de compte ? <Link to="/register">S'inscrire</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="identifier">Email ou nom d'utilisateur</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="vous@exemple.com"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <AuthBanner type="error">{error}</AuthBanner>}

        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" />}
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Login;
