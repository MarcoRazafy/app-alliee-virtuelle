import '../styles/splash.css';

function SplashScreen({ duration = 5000 }) {
  return (
    <div className="splash" role="status" aria-live="polite" aria-label="Chargement de votre espace">
      <div className="splash-inner">
        <div className="splash-logo-wrap">
          <span className="splash-halo" aria-hidden="true" />
          <img src="/logo.png" alt="L'Alliée Virtuelle" className="splash-logo" />
        </div>
        <p className="splash-brand">L'Alliée Virtuelle</p>
        <div className="splash-bar">
          <span className="splash-bar-fill" style={{ animationDuration: `${duration}ms` }} />
        </div>
        <p className="splash-hint">Préparation de votre espace…</p>
      </div>
    </div>
  );
}

export default SplashScreen;
