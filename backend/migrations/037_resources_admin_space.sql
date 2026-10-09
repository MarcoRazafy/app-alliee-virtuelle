ALTER TABLE resources_folders
  DROP CONSTRAINT IF EXISTS resources_folders_type_check;

ALTER TABLE resources_folders
  ADD CONSTRAINT resources_folders_type_check
  CHECK (type IN ('INTERNE', 'CLIENT', 'ADMIN'));
