ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS field_authors JSONB NOT NULL DEFAULT '{}'::jsonb;
