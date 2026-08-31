-- Traçabilité des évaluations : qui a enregistré la dernière version.
-- `created_by` existait déjà mais n'est jamais réécrit (ON CONFLICT ne le met pas à jour),
-- il garde donc le premier auteur ; `updated_by` répond à « qui a rempli ce mois-ci ».
-- L'auteur de chaque remarque, lui, est stocké dans le JSONB des critères (champ author_id).
ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
