BEGIN;

-- Distingue un vrai fichier uploadé (kind = 'FILE', stocké sur disque via file_path)
-- d'un document éditable créé dans la plateforme (kind = 'DOCUMENT', contenu HTML dans content).
ALTER TABLE resources_files
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'FILE';

-- Type MIME réel du fichier uploadé (pour le servir correctement en aperçu/téléchargement).
ALTER TABLE resources_files
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(150);

-- Contenu HTML des documents éditables (NULL pour les fichiers uploadés).
ALTER TABLE resources_files
    ADD COLUMN IF NOT EXISTS content TEXT;

-- Colonne mise à jour à chaque édition d'un document.
ALTER TABLE resources_files
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Les documents n'ont pas de fichier sur disque → file_path devient optionnel.
ALTER TABLE resources_files
    ALTER COLUMN file_path DROP NOT NULL;

COMMIT;
