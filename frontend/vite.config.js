import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
    plugins: [react()],
    server: {
      host: isLanMode ? '0.0.0.0' : undefined,
      port: 5173,
      strictPort: isLanMode,
      https: isLanMode
        ? {
            cert: certificatePath,
            key: privateKeyPath,
          }
        : undefined,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
      },
    },
  };
});
