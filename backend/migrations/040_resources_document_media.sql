-- Médias insérés dans un document des Ressources : photos, vidéos, PDF.
--
-- Table à part plutôt que resources_files : un média inséré dans un document n'est pas un
-- fichier du dossier. Rangé avec les autres, il apparaîtrait dans la liste, pourrait être
-- supprimé seul, et le document afficherait une image cassée.
--
-- Rattaché au DOSSIER (et non au document) : c'est le dossier qui porte les droits d'accès
-- (espace Admin réservé aux admins), et un média s'importe avant que le document n'existe
-- — pendant la rédaction d'un nouveau document, qui n'a pas encore d'identifiant.
-- Le document y fait référence par son adresse (/api/resources/media/<id>) dans son HTML.
CREATE TABLE IF NOT EXISTS resources_document_media (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES resources_folders(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_path varchar(512) NOT NULL,
  mime_type varchar(150) NOT NULL,
  file_size bigint NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_document_media_folder ON resources_document_media (folder_id);
