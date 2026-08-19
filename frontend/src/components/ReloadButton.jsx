import { useState } from 'react';

function ReloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

// Bouton d'en-tête : recharge la page courante (window.location.reload).
// Une brève rotation donne un retour visuel avant le rechargement.
function ReloadButton({ className = '' }) {
  const [spinning, setSpinning] = useState(false);

  const handleReload = () => {
    setSpinning(true);
    setTimeout(() => window.location.reload(), 150);
  };

  return (
    <button
      type="button"
      className={`icon-btn reload-btn${spinning ? ' reload-btn--spinning' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleReload}
      aria-label="Actualiser la page"
      title="Actualiser la page"
    >
      <ReloadIcon />
    </button>
  );
}

export default ReloadButton;
