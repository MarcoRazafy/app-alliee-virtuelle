ALTER TABLE resource_page_uploads DROP CONSTRAINT IF EXISTS resource_page_uploads_kind_check;
ALTER TABLE resource_page_uploads
  ADD CONSTRAINT resource_page_uploads_kind_check CHECK (kind IN ('photo', 'video', 'document'));
