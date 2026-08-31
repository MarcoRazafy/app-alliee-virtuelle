-- Auteur de chaque champ libre de l'évaluation (7 champs de développement + commentaire
-- global). Une seule colonne JSONB { "nom_du_champ": "uuid" } plutôt que huit colonnes
-- d'auteur, pour ne pas élargir la table à chaque nouveau champ.
-- L'auteur n'est réattribué que lorsque le TEXTE change : relire et réenregistrer une fiche
-- ne doit pas s'approprier ce qu'un collègue a écrit.
ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS field_authors JSONB NOT NULL DEFAULT '{}'::jsonb;
