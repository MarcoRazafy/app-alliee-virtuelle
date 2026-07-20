# Dashboard administrateur — Override

Ce fichier adapte le Master généré à l'identité existante et aux contraintes du dashboard opérationnel.

## Règles prioritaires

- Conserver le bleu de marque `#256bff` comme action principale.
- Réserver l'ambre au temps, à l'attente et aux avertissements.
- Afficher « À traiter maintenant » avant la liste exhaustive de l'équipe.
- Prioriser les collaborateurs actifs ; condenser les collaborateurs au repos.
- Utiliser des chiffres tabulaires pour les KPI et chronos.
- Garder une seule action primaire par région.
- Cibles interactives de 44 × 44 px minimum.
- Focus visible, alternative clavier et contraste AA obligatoires.

## Responsive

- 375–767 px : navigation en tiroir, KPI en grille compacte, file d'actions avant l'équipe.
- 768–1023 px : deux colonnes pour les synthèses, panneaux empilés.
- ≥1024 px : sidebar persistante, contenu principal + panneau d'actions latéral.

## Mouvement

Transitions de 160–220 ms, sans overshoot sur les données. Respecter `prefers-reduced-motion`.

