import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

// Hook de chargement pour les tests de composants (node:test) :
//  - neutralise les imports d'assets (CSS, images) → module vide,
//  - transpile le JSX de nos fichiers via esbuild (déjà présent via Vite).
// Ainsi, pas besoin de Jest/Vitest : le runner reste `node --test`.
const ASSET_RE = /\.(css|png|jpe?g|gif|svg|webp|woff2?)(\?.*)?$/;

export async function load(url, context, nextLoad) {
  if (ASSET_RE.test(url)) {
    return { format: 'module', source: 'export default {};', shortCircuit: true };
  }
  if ((url.endsWith('.jsx') || url.endsWith('.js')) && url.startsWith('file:') && !url.includes('/node_modules/')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { code } = await transform(source, {
      loader: url.endsWith('.jsx') ? 'jsx' : 'js',
      jsx: 'automatic',
      format: 'esm',
      sourcemap: 'inline',
    });
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
