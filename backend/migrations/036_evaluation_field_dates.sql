-- Date de dernière modification de chaque champ libre de l'évaluation (7 champs de
-- développement + commentaire global), en miroir de `field_authors` (migration 035) :
-- { "nom_du_champ": "2026-09-03T17:36:00.000Z" }. Une seule colonne JSONB plutôt que huit
-- colonnes de date, pour ne pas élargir la table à chaque nouveau champ.
-- Comme pour l'auteur, la date n'est réécrite que lorsque le TEXTE change : relire et
-- réenregistrer une fiche ne doit pas rajeunir ce qu'un collègue a écrit.
-- Les remarques des 4 critères portent leur propre date DANS leur JSONB (champ updated_at) :
-- rien à migrer pour elles, celles déjà enregistrées s'affichent simplement sans date.
ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS field_updated_at JSONB NOT NULL DEFAULT '{}'::jsonb;
