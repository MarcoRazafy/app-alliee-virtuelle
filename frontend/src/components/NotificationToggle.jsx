import { useEffect, useState } from 'react';
import { isPushSupported, getPermission, isSubscribed, enablePush, disablePush } from '../services/push';
import { notifyError, notifySuccess } from '../utils/toast';
import '../styles/notification-toggle.css';

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// iPhone : le push ne marche qu'en PWA installée (ajoutée à l'écran d'accueil), iOS 16.4+.
function isIosSafariNotStandalone() {
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return isIos && !standalone;
}

// Panneau « Notifications » : active/désactive les notifications push sur CET appareil.
export default function NotificationToggle() {
  const supported = isPushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(supported ? getPermission() : 'unsupported');

  useEffect(() => {
    if (!supported) return;
    isSubscribed().then(setSubscribed).catch(() => {});
  }, [supported]);

  async function handleEnable() {
    setBusy(true);
    try {
      await enablePush();
      setSubscribed(true);
      setPermission(getPermission());
      notifySuccess('Notifications enabled on this device');
    } catch (err) {
      notifyError(err.message || 'Could not enable notifications');
      setPermission(getPermission());
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await disablePush();
      setSubscribed(false);
      notifySuccess('Notifications disabled on this device');
    } catch (err) {
      notifyError(err.message || 'Could not disable notifications');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="profile-panel">
      <header className="profile-panel-header">
        <span><BellIcon /></span>
        <div>
          <p>Notifications</p>
          <h2>Push notifications</h2>
        </div>
      </header>

      <div className="notif-toggle-body">
        {!supported ? (
          isIosSafariNotStandalone() ? (
            <p className="notif-toggle-hint">
              On iPhone, install the app first (Share ⬆️ → “Add to Home Screen”), then open it to
              enable notifications.
            </p>
          ) : (
            <p className="notif-toggle-hint">Notifications are not supported on this browser.</p>
          )
        ) : permission === 'denied' ? (
          <p className="notif-toggle-hint">
            Notifications are blocked in your browser settings. Allow them for this site, then reload.
          </p>
        ) : (
          <>
            <p className="notif-toggle-hint">
              Get notified of new messages, even when the app is closed. Applies to this device.
            </p>
            <div className="notif-toggle-row">
              <span className={`notif-toggle-status ${subscribed ? 'is-on' : ''}`}>
                {subscribed ? 'Enabled on this device' : 'Disabled'}
              </span>
              {subscribed ? (
                <button type="button" className="profile-outline-button" onClick={handleDisable} disabled={busy}>
                  {busy ? 'Working…' : 'Disable'}
                </button>
              ) : (
                <button type="button" className="profile-primary-button" onClick={handleEnable} disabled={busy}>
                  <BellIcon />
                  {busy ? 'Enabling…' : 'Enable notifications'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
