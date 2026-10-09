import '../styles/route-fallback.css';

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Chargement">
      <span className="route-fallback-spinner" />
    </div>
  );
}

export default RouteFallback;
