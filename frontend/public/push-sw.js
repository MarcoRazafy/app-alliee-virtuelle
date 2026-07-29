/* global self, clients */
// Handlers de notifications push, importés dans le service worker généré par Workbox
// (vite-plugin-pwa → workbox.importScripts). Séparé pour ne pas toucher au SW généré.

// Réception d'une notification push (fonctionne même l'app fermée).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || "L'Alliée Virtuelle";
  const options = {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || undefined, // regroupe les notifs d'une même conversation
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notification : on ramène/ouvre l'app sur la bonne page (messagerie).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si une fenêtre de l'app est déjà ouverte, on la focus et on y navigue.
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // Sinon on ouvre une nouvelle fenêtre.
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
