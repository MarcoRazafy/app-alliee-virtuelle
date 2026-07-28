import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AuthLayout from '../components/auth/AuthLayout';
import AuthBanner from '../components/auth/AuthBanner';
import PasswordInput from '../components/auth/PasswordInput';
import SplashScreen from '../components/SplashScreen';

const SPLASH_DURATION = 5000; // écran de démarrage après connexion (façon Facebook)

function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await login(identifier, password);
    if (success) {
      // Connexion réussie : on affiche le splash puis on entre dans le dashboard.
      setShowSplash(true);
      timerRef.current = setTimeout(() => navigate('/dashboard'), SPLASH_DURATION);
    } else {
      setIsSubmitting(false);
    }
  }

  if (showSplash) {
    return <SplashScreen duration={SPLASH_DURATION} />;
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your L'Alliée Virtuelle space"
      footer={
        <>
          Don't have an account yet? <Link to="/register">Sign up</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="identifier">Email or username</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && <AuthBanner type="error">{error}</AuthBanner>}

        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" />}
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Login;
