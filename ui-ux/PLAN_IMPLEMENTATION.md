# Plan d'intégration proposé

La maquette est volontairement séparée du frontend actuel. L'intégration peut se faire par lots courts et réversibles.

## Lot 1 — Accessibilité transversale

Fichiers principaux :

- `frontend/src/styles/tokens.css`
- `frontend/src/styles/layout.css`
- `frontend/src/styles/app.css`
- `frontend/src/components/employee/EmployeeLayout.jsx`
- `frontend/src/components/admin/AdminLayout.jsx`

Actions :

- ajouter un style `:focus-visible` global ;
- ajouter un lien « Aller au contenu » et un identifiant sur `<main>` ;
- porter les cibles interactives à 44 px ;
- corriger les tokens de contraste clair et la teinte des CTA ;
- ajouter une règle globale `prefers-reduced-motion` ;
- vérifier les libellés accessibles des boutons icône.

Charge indicative : 1 à 2 jours, validation clavier et responsive incluse.

## Lot 2 — « Ma journée » accessible

Fichiers principaux :

- `frontend/src/pages/MyDay.jsx`
- `frontend/src/components/DragDropTasks.jsx`
- `frontend/src/styles/app.css`

Actions :

- ajouter les boutons « Ajouter » et « Retirer » ;
- conserver le drag-and-drop en amélioration progressive ;
- ajouter une recherche et un filtre de priorité ;
- afficher le nombre de tâches sélectionnées près du CTA ;
- rendre le CTA visible en bas de fenêtre sur les longues listes ;
- annoncer les déplacements dans une région `aria-live`.

Charge indicative : 2 à 3 jours avec tests clavier/tactile.

## Lot 3 — Dashboard admin orienté action

Fichiers principaux :

- `frontend/src/pages/admin/AdminDashboard.jsx`
- `frontend/src/styles/admin.css`
- `frontend/src/services/dashboardService.js`

Actions :

- transformer les KPI en accès directs filtrés ;
- ajouter le panneau « À traiter maintenant » ;
- séparer les collaborateurs actifs et au repos ;
- garder la recherche et les filtres dans une barre cohérente ;
- mettre le titre complet à disposition malgré l'ellipse ;
- utiliser des skeletons pendant l'actualisation initiale.

Le panneau d'actions peut d'abord réutiliser les endpoints existants pour les tâches en retard et à valider. Une agrégation backend dédiée pourra être ajoutée ensuite si les temps de chargement l'exigent.

Charge indicative : 3 à 5 jours selon les données disponibles.

## Lot 4 — Performance et finition

Fichiers principaux :

- `frontend/src/App.jsx`
- pages contenant de longues listes

Actions :

- mesurer le bundle puis découper les routes avec `React.lazy` ;
- utiliser `useDeferredValue` ou un debounce pour les recherches distantes ;
- paginer/virtualiser les listes longues ;
- tester 375, 768, 1024 et 1440 px ;
- tester thèmes clair/sombre, zoom 200 % et réduction des animations.

Charge indicative : 2 à 4 jours selon les mesures.

## Ordre recommandé

1. Lot 1, car il sécurise toute l'application.
2. Lot 2, car « Ma journée » bloque l'accès au reste du parcours employé.
3. Lot 3, pour le gain métier côté supervision.
4. Lot 4, après mesure des performances réelles.

