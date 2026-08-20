-- Champs de développement/carrière ajoutés à l'évaluation mensuelle (en plus des 4 critères
-- notés et du commentaire global). Texte libre, gouvernés par le même visible_to_employee.
ALTER TABLE employee_evaluations
  ADD COLUMN IF NOT EXISTS forces_actuelles TEXT,
  ADD COLUMN IF NOT EXISTS competences_ameliorer TEXT,
  ADD COLUMN IF NOT EXISTS competences_developper TEXT,
  ADD COLUMN IF NOT EXISTS objectifs_professionnels TEXT,
  ADD COLUMN IF NOT EXISTS formations_recommandees TEXT,
  ADD COLUMN IF NOT EXISTS nouvelles_responsabilites TEXT,
  ADD COLUMN IF NOT EXISTS prochaine_etape TEXT;
