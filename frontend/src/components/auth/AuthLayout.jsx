import ThemeToggle from '../ThemeToggle';
import '../../styles/auth.css';

function AuthLayout({ title, subtitle, wide, children, footer }) {
  return (
    <div className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <div className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
        <div className="auth-logo-wrap">
          <img src="/logo.png" alt="L'Alliée Virtuelle" className="auth-logo" />
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default AuthLayout;
