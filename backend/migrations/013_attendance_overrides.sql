-- Corrections manuelles de présence décidées par un administrateur.
-- La valeur calculée reste disponible dans l'API : cette table ne détruit jamais
-- les sessions de connexion brutes et garde la traçabilité de la correction.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS disconnect_requested_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS attendance_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'late', 'absent')),
    late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0 AND late_minutes <= 1440),
    reason TEXT,
    corrected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, attendance_date),
    CHECK (status = 'late' OR late_minutes = 0)
);

CREATE INDEX IF NOT EXISTS idx_attendance_overrides_date
  ON attendance_overrides(attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_overrides_user_date
  ON attendance_overrides(user_id, attendance_date DESC);
