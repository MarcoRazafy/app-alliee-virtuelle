import useZoomStore from '../store/zoomStore';

function ZoomIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.2-3.2M8 11h6M11 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Réglage du zoom d'affichage, par appareil (clic = niveau suivant : 80/90/100/110 %).
function ZoomControl({ className = '' }) {
  const zoom = useZoomStore((state) => state.zoom);
  const cycleZoom = useZoomStore((state) => state.cycleZoom);

  return (
    <button
      type="button"
      className={`zoom-control ${className}`}
      onClick={cycleZoom}
      aria-label={`Zoom d'affichage : ${zoom}%. Cliquer pour changer.`}
      title="Zoom d'affichage (par appareil)"
    >
      <ZoomIcon />
      <span className="zoom-control-value">{zoom}%</span>
    </button>
  );
}

export default ZoomControl;
