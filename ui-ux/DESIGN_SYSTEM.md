# Système visuel proposé

## Direction

Style : dashboard opérationnel sombre, calme, précis et orienté action.

Le moteur UI/UX Pro Max recommande une base « Modern Dark » et une typographie de dashboard dense. La palette générée utilise l'ambre comme couleur primaire ; cette proposition l'adapte pour préserver l'identité bleue existante. L'ambre reste sémantique : temps, attente et avertissement. Le bleu reste réservé à la navigation active et aux actions principales.

## Couleurs

### Thème sombre

| Token | Valeur | Usage |
|---|---:|---|
| `--ui-bg` | `#071426` | fond principal |
| `--ui-nav` | `#081a30` | navigation persistante |
| `--ui-surface` | `#0d213c` | cartes et panneaux |
| `--ui-surface-raised` | `#122947` | contrôles et cartes actives |
| `--ui-border` | `#203a5d` | séparateurs |
| `--ui-text` | `#f7fbff` | texte principal |
| `--ui-text-secondary` | `#a9b9ce` | texte secondaire |
| `--ui-text-muted` | `#879ab4` | métadonnées |
| `--ui-primary` | `#256bff` | CTA et sélection |
| `--ui-primary-hover` | `#1f5fe5` | survol du CTA |
| `--ui-success` | `#2bd477` | actif / succès |
| `--ui-warning` | `#f5a524` | temps / attente |
| `--ui-danger` | `#ff5b68` | retard / erreur |

### Thème clair

| Token | Valeur | Usage |
|---|---:|---|
| `--ui-bg` | `#f4f7fb` | fond principal |
| `--ui-surface` | `#ffffff` | cartes |
| `--ui-surface-raised` | `#edf3fb` | contrôles |
| `--ui-border` | `#d8e2ef` | séparateurs |
| `--ui-text` | `#0b1d35` | texte principal |
| `--ui-text-secondary` | `#40536b` | texte secondaire |
| `--ui-text-muted` | `#55667c` | métadonnées AA |

## Typographie

La maquette emploie Inter pour maximiser la lisibilité dans les vues denses. Montserrat peut être conservée lors de l'intégration afin d'éviter une migration globale ; l'important est surtout d'appliquer une échelle stable.

| Rôle | Taille | Graisse | Interligne |
|---|---:|---:|---:|
| Titre de page | 24–28 px | 700 | 1,2 |
| Titre de section | 18–20 px | 700 | 1,3 |
| Titre de carte | 15–16 px | 650–700 | 1,35 |
| Corps | 14–16 px | 400–500 | 1,5 |
| Métadonnée | 12–13 px | 500–600 | 1,4 |
| KPI / chrono | 24–32 px | 700 | 1 |

Les chronos et valeurs changeantes utilisent `font-variant-numeric: tabular-nums` afin d'éviter les sauts visuels.

## Espacement et formes

- Échelle : 4, 8, 12, 16, 24, 32, 48 px.
- Rayon contrôle : 10–12 px.
- Rayon carte : 16 px.
- Rayon panneau majeur : 20 px.
- Cible interactive : 44 × 44 px minimum.
- Conteneur desktop : 1440 px maximum, gouttière 32 px.
- Gouttière mobile : 16 px.

## Composants

### Boutons

- Une seule action primaire par zone.
- Fond bleu plein `#256bff`, texte blanc, sans extrémité de dégradé trop claire.
- État survol : bleu plus sombre, sans déplacement de mise en page.
- État focus : anneau externe de 3 px avec contraste visible.
- État désactivé : attribut `disabled`, opacité réduite et curseur explicite.

### Cartes KPI

- Toute la carte peut être un lien si elle mène vers le détail.
- Le libellé, la valeur et la conséquence métier doivent être lisibles dans cet ordre.
- Les couleurs sémantiques complètent une icône et un texte ; elles ne portent jamais seules le sens.

### Filtres

- Les groupes ont un libellé visible ou accessible.
- La sélection utilise `aria-pressed` ou un groupe de radios.
- La recherche attend 200 à 300 ms avant une requête distante.
- Un bouton « Réinitialiser » apparaît lorsque des filtres sont actifs.

### Listes de collaborateurs

- Actifs en premier, avec tâche courante et chrono tabulaire.
- Inactifs dans une présentation plus compacte.
- Titre complet sur deux lignes au maximum avant ellipse.
- Détail disponible au clavier, au clic et non uniquement au survol.

## Mouvement

- Transitions courtes de 160 à 220 ms.
- Animation uniquement pour exprimer un changement d'état.
- Skeleton au-delà de 300 ms ; aucun écran vide pendant un chargement.
- Aucun mouvement décoratif permanent hormis un statut « en direct » discret.
- Désactivation globale si `prefers-reduced-motion: reduce`.

## Breakpoints

- 375 px : une colonne, KPI compacts, actions critiques en premier.
- 768 px : deux colonnes possibles, navigation en tiroir.
- 1024 px : retour de la sidebar et grille structurée.
- 1440 px : largeur maximale, sans étirer excessivement les cartes.

