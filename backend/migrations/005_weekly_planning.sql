-- L'Alliée Virtuelle - Feature "Planning hebdomadaire"
-- Migration additive : ne modifie jamais init.sql, 100% rétrocompatible.
-- À exécuter après init.sql et les migrations précédentes :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/005_weekly_planning.sql

-- ===== 1. weekly_plannings : un enregistrement par employé et par semaine (lundi-dimanche) =====

CREATE TABLE IF NOT EXISTS weekly_plannings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'LOCKED', 'ADMIN_MODIFIED', 'NOT_SUBMITTED')),
    general_note TEXT,
    submitted_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    last_modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_modified_at TIMESTAMPTZ,
    last_admin_change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_plannings_user_id ON weekly_plannings(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plannings_week_start_date ON weekly_plannings(week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plannings_status ON weekly_plannings(status);

-- ===== 2. planning_days : état général de chaque journée de la semaine =====

CREATE TABLE IF NOT EXISTS planning_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES weekly_plannings(id) ON DELETE CASCADE,
    planning_date DATE NOT NULL,
    availability_status VARCHAR(50) NOT NULL
        CHECK (availability_status IN ('AVAILABLE', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE', 'LEAVE', 'SICK')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (planning_id, planning_date)
);

CREATE INDEX IF NOT EXISTS idx_planning_days_planning_id ON planning_days(planning_id);
CREATE INDEX IF NOT EXISTS idx_planning_days_planning_date ON planning_days(planning_date);

-- ===== 3. planning_time_slots : plages horaires d'une journée disponible/partiellement disponible =====

CREATE TABLE IF NOT EXISTS planning_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_day_id UUID NOT NULL REFERENCES planning_days(id) ON DELETE CASCADE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_planning_time_slots_planning_day_id ON planning_time_slots(planning_day_id);

-- ===== 4. planning_history : traçabilité détaillée de chaque modification (employé ou admin) =====

CREATE TABLE IF NOT EXISTS planning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES weekly_plannings(id) ON DELETE CASCADE,
    planning_day_id UUID REFERENCES planning_days(id) ON DELETE SET NULL,
    time_slot_id UUID REFERENCES planning_time_slots(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_history_planning_id ON planning_history(planning_id);
CREATE INDEX IF NOT EXISTS idx_planning_history_changed_at ON planning_history(changed_at);
