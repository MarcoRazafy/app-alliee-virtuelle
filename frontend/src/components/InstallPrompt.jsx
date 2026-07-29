import { useEffect, useState } from 'react';
import '../styles/install-prompt.css';

const DISMISS_KEY = 'pwa-install-dismissed';

// Déjà installée (ouverte en mode « application », pas dans un onglet de navigateur) ?
function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

// Bandeau « Installer l'application » : bouton d'installation natif (Android/Desktop Chrome, Edge)
// ou instructions manuelles sur iPhone (Safari ne propose pas d'installation automatique).
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return undefined;

    function onBeforeInstall(event) {
      event.preventDefault(); // on garde la main pour déclencher l'install depuis notre bouton
      setDeferred(event);
      setVisible(true);
    }
    function onInstalled() {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS : aucun événement d'installation → on affiche quand même le bandeau (instructions).
    if (isIos()) setVisible(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  async function handleInstall() {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
      if (outcome === 'accepted') localStorage.setItem(DISMISS_KEY, '1');
    } else if (isIos()) {
      setIosHelp((value) => !value);
    }
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  const iosMode = !deferred && isIos();

  return (
    <div className="pwa-install" role="dialog" aria-label="Installer l'application">
      <img src="/pwa-192.png" alt="" className="pwa-install-icon" />
      <div className="pwa-install-text">
        <strong>Install the app</strong>
        {iosHelp ? (
          <span>
            On iPhone: tap <b>Share</b> ⬆️, then <b>“Add to Home Screen”</b>.
          </span>
        ) : (
          <span>Open L'Alliée Virtuelle in one tap, full screen.</span>
        )}
      </div>
      <button type="button" className="pwa-install-btn" onClick={handleInstall}>
        {iosMode ? (iosHelp ? 'Got it' : 'How?') : 'Install'}
      </button>
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Close">
        ×
      </button>
    </div>
  );
}
