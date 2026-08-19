-- Évaluations mensuelles d'un employé (fiche employé côté admin).
-- Une ligne par (employé × mois). Chaque critère porte une LISTE de remarques
-- (JSONB : [{ "rating": "good" | "bad", "comment": "..." }, ...]), pour pouvoir
-- noter plusieurs points bons et mauvais dans un même critère.
-- Un commentaire global est toujours visible par l'employé ; le détail (les listes)
-- n'est visible par l'employé que si visible_to_employee = true.
CREATE TABLE IF NOT EXISTS employee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month DATE NOT NULL, -- 1er jour du mois évalué (ex. 2026-08-01)
  visible_to_employee BOOLEAN NOT NULL DEFAULT false,
  global_comment TEXT,

  -- Une liste de remarques par critère : [{ rating: 'good'|'bad', comment: text }]
  delais_items JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Respect des délais et fiabilité
  qualite_items JSONB NOT NULL DEFAULT '[]'::jsonb,      -- Qualité des livrables et Rigueur
  autonomie_items JSONB NOT NULL DEFAULT '[]'::jsonb,    -- Autonomie et Résolution de problème
  adaptabilite_items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Adaptabilité et Évolution

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_employee_evaluations_user
  ON employee_evaluations (user_id, period_month DESC);
