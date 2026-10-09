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
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: true, type: 'module' },
        includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
        manifest: {
          name: "L'Alliée Virtuelle",
          short_name: 'Alliée',
          description: "Suivi des tâches et gestion d'équipe — L'Alliée Virtuelle",
          lang: 'fr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
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
          importScripts: ['push-sw.js'],
          globIgnores: ['**/employer/**', '**/themeImagelogin.jpeg', '**/agentIAImage-*'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/health/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            {
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
      chunkSizeWarningLimit: 700,
    },
    server: {
      host: isLanMode ? '0.0.0.0' : undefined,
      port: 5173,
      strictPort: isLanMode,
      allowedHosts: ['.trycloudflare.com'],
      https: isLanMode
        ? {
            cert: certificatePath,
            key: privateKeyPath,
          }
        : undefined,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          ws: true,
        },
      },
    },
  };
});
