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
