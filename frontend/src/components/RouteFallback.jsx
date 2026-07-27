import '../styles/route-fallback.css';

// Affiché brièvement pendant le chargement à la demande d'une page (code-splitting).
function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Chargement">
      <span className="route-fallback-spinner" />
    </div>
  );
}

export default RouteFallback;
