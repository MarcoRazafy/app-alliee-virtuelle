CREATE TABLE IF NOT EXISTS employee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  visible_to_employee BOOLEAN NOT NULL DEFAULT false,
  global_comment TEXT,

  delais_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualite_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  autonomie_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  adaptabilite_items JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_employee_evaluations_user
  ON employee_evaluations (user_id, period_month DESC);
