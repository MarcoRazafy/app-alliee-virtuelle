const ICONS = {
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2" />
      <path d="M12 7.5v6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="#ef4444" />
    </svg>
  ),
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="2" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function AuthBanner({ type, children }) {
  return (
    <div className={`auth-banner auth-banner--${type}`}>
      {ICONS[type]}
      <span>{children}</span>
    </div>
  );
}

export default AuthBanner;
