ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS field_updated_at JSONB NOT NULL DEFAULT '{}'::jsonb;
