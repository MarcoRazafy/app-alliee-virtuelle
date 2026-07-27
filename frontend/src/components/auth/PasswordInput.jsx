import { useState } from 'react';

// Champ mot de passe avec bouton "afficher / masquer" (œil). Réutilisé sur login + inscription.
function EyeIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
}

function PasswordInput({ id, name, value, onChange, placeholder = '••••••••', required = false, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-password-wrap">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setShow((current) => !current)}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        tabIndex={-1}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}

export default PasswordInput;
