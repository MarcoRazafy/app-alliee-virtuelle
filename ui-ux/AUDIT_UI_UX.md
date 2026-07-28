# Audit UI/UX

## Synthèse

L'interface possède déjà une identité solide : palette marine cohérente, composants homogènes, navigation stable et distinction claire entre les espaces employé et administrateur. Le principal potentiel d'amélioration n'est pas décoratif ; il concerne la priorité de l'information et l'accessibilité des actions.

La recommandation directrice est de faire du dashboard admin un écran de décision : ce qui exige une action doit apparaître avant la grille complète des collaborateurs. Côté employé, la sélection de la journée doit rester utilisable sans glisser-déposer et garder l'action de validation visible.

## Méthode

Audit réalisé le 18 juillet 2026 à partir de :

- l'écran de connexion en 1440 × 1024 ;
- « Suivi en temps réel » en 1440 × 1100 et 390 × 844 ;
- « Ma journée » employé en 1440 × 1100 ;
- la structure React, les composants et les feuilles de styles du frontend ;
- la grille de contrôle UI/UX Pro Max : accessibilité, interaction, responsive, typographie, couleur, mouvement et performance.

## Ce qui fonctionne déjà bien

- Identité sombre professionnelle et reconnaissable.
- Utilisation cohérente d'icônes SVG plutôt que d'émojis structurels.
- Navigation active très visible et adaptée en tiroir sous 900 px.
- États métier rendus par texte, icône et couleur : actif, repos, urgent, retard.
- Thème clair/sombre centralisé avec des tokens sémantiques.
- Retours de chargement présents sur plusieurs actions et écrans.
- Libellés visibles sur le formulaire de connexion.

## Priorités

| Priorité | Constat | Risque | Recommandation |
|---|---|---|---|
| P0 | Le glisser-déposer de « Ma journée » n'a pas d'alternative clavier ou bouton. | Parcours bloquant pour le clavier, le tactile imprécis et certaines aides techniques. | Ajouter « Ajouter à ma journée » / « Retirer » et conserver le drag comme raccourci. |
| P0 | Plusieurs contrôles interactifs mesurent 30 à 38 px. | Cibles trop petites sur mobile ; erreurs de toucher. | Garantir une zone interactive minimale de 44 × 44 px. |
| P0 | Les styles de focus et `prefers-reduced-motion` ne sont pas globaux. | Navigation clavier inégale et animations imposées. | Ajouter un anneau `:focus-visible` commun et neutraliser les animations non essentielles. |
| P0 | Le texte blanc sur l'extrémité `#3d8bff` du dégradé d'action atteint environ 3,31:1. | Contraste sous 4,5:1 pour un texte normal. | Employer `#256bff` ou une teinte plus sombre pour toute la surface du CTA. |
| P0 | En thème clair, `#7a879e` sur les surfaces claires atteint environ 3,38 à 3,63:1. | Petits textes secondaires difficiles à lire. | Remonter le token secondaire/muet vers `#55667c` ou plus sombre. |
| P1 | Le compteur « 12 tâches en retard » alerte mais ne mène pas directement à une file d'action. | L'admin doit interpréter puis chercher la prochaine étape. | Ajouter une zone « À traiter maintenant » avec éléments triés et CTA contextualisé. |
| P1 | La grille admin donne le même poids aux collaborateurs actifs et au repos. | Lecture lente lorsque l'équipe grandit. | Mettre les actifs en premier, afficher leur tâche en cours, puis condenser les inactifs. |
| P1 | Les titres de tâches sont tronqués dans les cartes. | Perte de contexte et ambiguïté. | Autoriser deux lignes ou fournir un libellé complet accessible et un détail au focus/survol. |
| P1 | Sur mobile, les trois KPI occupent une grande partie du premier écran. | Les collaborateurs et urgences sont repoussés sous la ligne de flottaison. | Passer à une grille compacte 2 × 2 et placer les actions critiques avant les détails. |
| P1 | Le CTA « Valider ma journée » se trouve après une longue liste de tâches. | L'employé peut ne pas voir le résultat attendu de sa sélection. | Ajouter un résumé/sticky CTA indiquant le nombre de tâches choisies. |
| P2 | Toutes les routes sont importées de façon statique dans `App.jsx`. | Le bundle initial grossira avec l'application. | Découper par route avec `React.lazy` et `Suspense`, après mesure. |
| P2 | Les longues listes ne sont ni paginées ni virtualisées partout. | Dégradation future du scroll et du temps de rendu. | Paginer ou virtualiser à partir d'environ 50 éléments. |

## Écran de connexion

Le centrage, la profondeur de la carte et l'identité de marque sont réussis. Les améliorations proposées sont fonctionnelles :

- bouton afficher/masquer le mot de passe ;
- attributs `autocomplete="username"` et `autocomplete="current-password"` ;
- police d'entrée à 16 px sur mobile pour éviter le zoom automatique iOS ;
- zone tactile du bouton de thème portée à 44 px ;
- lien de récupération de mot de passe si le produit le prévoit.

## Parcours employé « Ma journée »

L'écran explique correctement que la validation est obligatoire. En revanche, la seule instruction principale est « glissez », alors que le drag-and-drop n'est pas une interaction universelle.

Proposition :

1. présenter trois étapes courtes : choisir, ordonner, valider ;
2. ajouter un bouton explicite sur chaque tâche ;
3. offrir recherche et filtres si la liste dépasse dix tâches ;
4. afficher un résumé persistant « 3 tâches sélectionnées » avec le CTA ;
5. annoncer les changements de colonne avec une région `aria-live`.

## Dashboard administrateur

La maquette fournie modifie la hiérarchie sans changer les fonctions métier :

- une synthèse compacte et cliquable ;
- une file « À traiter maintenant » ;
- les collaborateurs actifs avant ceux au repos ;
- la tâche et le chrono visibles sur une seule ligne de lecture ;
- des filtres accessibles et suffisamment grands ;
- un responsive qui conserve l'ordre de priorité.

## Critères de validation

- Toutes les fonctions sont utilisables au clavier.
- Focus visible sur chaque lien, bouton, champ et carte interactive.
- Cibles tactiles de 44 × 44 px minimum.
- Contraste de 4,5:1 pour le texte normal et 3:1 pour les grands glyphes/UI.
- Aucun sens transmis uniquement par couleur.
- Aucun scroll horizontal à 375 px.
- Interface testée à 375, 768, 1024 et 1440 px.
- Animations désactivables via `prefers-reduced-motion`.
- Chargements supérieurs à 300 ms représentés par skeleton ou indicateur.

