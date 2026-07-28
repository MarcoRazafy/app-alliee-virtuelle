# Dossier UI/UX — L'Alliée Virtuelle

Ce dossier transforme l'audit de l'interface actuelle en une proposition concrète, sans modifier l'application de production.

## Livrables

- [`AUDIT_UI_UX.md`](./AUDIT_UI_UX.md) : constats, priorités et recommandations.
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) : règles visuelles adaptées à l'identité existante.
- [`PLAN_IMPLEMENTATION.md`](./PLAN_IMPLEMENTATION.md) : découpage technique proposé par lot.
- [`maquette-dashboard-admin/index.html`](./maquette-dashboard-admin/index.html) : maquette responsive et interactive.
- [`captures/existant-dashboard-admin.png`](./captures/existant-dashboard-admin.png) : état actuel du dashboard admin.
- [`captures/existant-login.png`](./captures/existant-login.png) : état actuel de la connexion.
- [`captures/maquette-dashboard-admin.png`](./captures/maquette-dashboard-admin.png) : aperçu desktop de la proposition.
- [`captures/maquette-dashboard-admin-mobile.png`](./captures/maquette-dashboard-admin-mobile.png) : aperçu mobile de la proposition.

Le fichier généré par UI/UX Pro Max reste disponible dans [`../design-system/alliee-virtuelle/MASTER.md`](../design-system/alliee-virtuelle/MASTER.md). Le présent dossier l'adapte à la marque et aux usages observés dans l'application.

## Ouvrir la maquette

La maquette est autonome. Ouvrir directement `maquette-dashboard-admin/index.html` dans un navigateur suffit.

Pour la servir localement depuis la racine du projet :

```bash
python3 -m http.server 4173 -d ui-ux/maquette-dashboard-admin
```

Puis ouvrir `http://localhost:4173`.

## Interactions disponibles

- ouverture/fermeture du menu mobile ;
- bascule thème sombre/clair ;
- recherche d'un collaborateur ;
- filtres « Tous », « En activité » et « Au repos » ;
- retour visuel des actions simulées.

## Périmètre

La proposition cible en priorité le tableau de bord administrateur, car il concentre le plus d'enjeux de lecture rapide et de décision. L'audit couvre aussi la connexion, le parcours « Ma journée », la navigation commune et le responsive.
