import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const certificateDir = path.join(frontendDir, '.cert');
const certificatePath = path.join(certificateDir, 'lan-cert.pem');
const privateKeyPath = path.join(certificateDir, 'lan-key.pem');

export default defineConfig(({ mode }) => {
  const isLanMode = mode === 'lan';

  if (isLanMode && (!fs.existsSync(certificatePath) || !fs.existsSync(privateKeyPath))) {
    throw new Error(
      'Certificat LAN absent. Exécutez d’abord : npm run cert:lan -- <adresse-ip-locale>',
    );
  }

  return {
    plugins: [
      react(),
      // PWA : rend l'app installable (mobile + desktop) via un service worker + un manifest.
      VitePWA({
        registerType: 'autoUpdate', // met à jour l'app automatiquement à chaque nouveau déploiement
        // Active le service worker en `npm run dev` pour pouvoir tester les notifications push
        // en local (sinon le SW n'existe qu'en build de production).
        devOptions: { enabled: true, type: 'module' },
        includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
        manifest: {
          name: "L'Alliée Virtuelle",
          short_name: 'Alliée',
          description: "Suivi des tâches et gestion d'équipe — L'Alliée Virtuelle",
          lang: 'fr',
          start_url: '/',
          scope: '/',
          display: 'standalone', // plein écran, sans barre de navigateur
          orientation: 'any',
          theme_color: '#256bff',
          background_color: '#07162d',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          // Ajoute nos handlers de notifications push (push + notificationclick) au SW généré.
          importScripts: ['push-sw.js'],
          // On ne pré-cache pas les gros visuels (images > 2 Mo du dossier employer, photo de
          // login) : ils restent servis normalement mais n'alourdissent pas le service worker.
          globIgnores: ['**/employer/**', '**/themeImagelogin.jpeg', '**/agentIAImage-*'],
          // Le shell de l'app (index.html) est renvoyé pour les routes du SPA…
          navigateFallback: '/index.html',
          // …SAUF pour l'API et le temps réel : jamais interceptés → toujours au réseau,
          // donc AUCUNE donnée périmée (l'API n'est pas mise en cache).
          navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              // Google Fonts (Montserrat) : mises en cache pour l'usage hors-ligne.
              urlPattern: ({ url }) =>
                url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    build: {
      // html2pdf (~660 kB) est chargé à la demande (import dynamique dans ResourceViewer),
      // il n'affecte pas le bundle initial. On relève le seuil pour ne pas alerter dessus.
      chunkSizeWarningLimit: 700,
    },
    server: {
      host: isLanMode ? '0.0.0.0' : undefined,
      port: 5173,
      strictPort: isLanMode,
      // Autorise l'hôte des tunnels HTTPS (cloudflared) pour partager l'app en test.
      // Les adresses IP (accès LAN) et localhost restent autorisées d'office par Vite.
      allowedHosts: ['.trycloudflare.com'],
      https: isLanMode
        ? {
            cert: certificatePath,
            key: privateKeyPath,
          }
        : undefined,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        // WebSocket temps réel (Socket.IO) : relais avec upgrade WebSocket activé.
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          ws: true,
        },
      },
    },
  };
});
