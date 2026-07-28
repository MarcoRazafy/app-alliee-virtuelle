import { register } from 'node:module';

// Enregistre le hook de transpilation JSX + stub CSS pour les tests de composants.
register('./hooks.mjs', import.meta.url);
