-- Espace de ressources réservé aux administrateurs (onglet « Admin » de la page Ressources).
--
-- Les routes de LECTURE des ressources sont ouvertes à tout utilisateur connecté (seule
-- l'écriture est réservée aux admins) : un employé pouvait donc lire n'importe quel dossier.
-- Ce nouveau type est donc filtré explicitement dans le contrôleur, dossier par dossier ET
-- fichier par fichier — la contrainte ci-dessous ne fait qu'autoriser la valeur en base.
ALTER TABLE resources_folders
  DROP CONSTRAINT IF EXISTS resources_folders_type_check;

ALTER TABLE resources_folders
  ADD CONSTRAINT resources_folders_type_check
  CHECK (type IN ('INTERNE', 'CLIENT', 'ADMIN'));
