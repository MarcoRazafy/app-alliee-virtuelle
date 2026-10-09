import { useEffect, useState } from 'react';
import '../styles/install-prompt.css';

const DISMISS_KEY = 'pwa-install-dismissed';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return undefined;

    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferred(event);
      setVisible(true);
    }
    function onInstalled() {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

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
        <strong>Installer l'application</strong>
        {iosHelp ? (
          <span>
            Sur iPhone : appuie sur <b>Partager</b> ⬆️, puis <b>« Sur l'écran d'accueil »</b>.
          </span>
        ) : (
          <span>Ouvre L'Alliée Virtuelle en un clic, en plein écran.</span>
        )}
      </div>
      <button type="button" className="pwa-install-btn" onClick={handleInstall}>
        {iosMode ? (iosHelp ? 'Compris' : 'Comment ?') : 'Installer'}
      </button>
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label='Fermer'>
        ×
      </button>
    </div>
  );
}
