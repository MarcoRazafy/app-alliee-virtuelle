import '../styles/splash.css';

// Écran de démarrage plein écran (façon Facebook) affiché brièvement après la
// connexion : logo animé + barre de progression, avant l'accès au dashboard.
function SplashScreen({ duration = 5000 }) {
  return (
    <div className="splash" role="status" aria-live="polite" aria-label="Loading your space">
      <div className="splash-inner">
        <div className="splash-logo-wrap">
          <span className="splash-halo" aria-hidden="true" />
          <img src="/logo.png" alt="L'Alliée Virtuelle" className="splash-logo" />
        </div>
        <p className="splash-brand">L'Alliée Virtuelle</p>
        <div className="splash-bar">
          <span className="splash-bar-fill" style={{ animationDuration: `${duration}ms` }} />
        </div>
        <p className="splash-hint">Preparing your space…</p>
      </div>
    </div>
  );
}

export default SplashScreen;
