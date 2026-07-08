-- L'Alliée Virtuelle - Schema PostgreSQL
-- 14 tables pour la gestion des tâches avec chronométrage

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    position VARCHAR(255),
    role VARCHAR(50) CHECK (role IN ('EMPLOYEE', 'ADMIN')) DEFAULT 'EMPLOYEE',
    status VARCHAR(50) CHECK (status IN ('EN_ATTENTE', 'ACTIF', 'SUSPENDU', 'REFUSÉ')) DEFAULT 'EN_ATTENTE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. TASKS
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    priority VARCHAR(50) CHECK (priority IN ('URGENT', 'HAUTE', 'NORMALE', 'FAIBLE')) DEFAULT 'NORMALE',
    status VARCHAR(50) CHECK (status IN ('DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE')) DEFAULT 'DECLAREE',
    start_date DATE,
    deadline DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- 3. TASK_HISTORY
CREATE TABLE IF NOT EXISTS task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    field_changed VARCHAR(255) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);

-- 4. TASK_COMMENTS
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) CHECK (type IN ('NOTE', 'COMMENT')) DEFAULT 'COMMENT',
    is_visible_to_employee BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

-- 5. TASK_ATTACHMENTS
CREATE TABLE IF NOT EXISTS task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_size BIGINT,
    file_type VARCHAR(50),
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);

-- 6. TIMELOG
CREATE TABLE IF NOT EXISTS timelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_timelog_task_id ON timelog(task_id);
CREATE INDEX IF NOT EXISTS idx_timelog_employee_id ON timelog(employee_id);

-- 7. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    channel_type VARCHAR(50) CHECK (channel_type IN ('GLOBAL', 'PRIVATE')) DEFAULT 'GLOBAL',
    recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);

-- 8. MESSAGE_CONVERSATIONS
CREATE TABLE IF NOT EXISTS message_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_message_conversations_participant1 ON message_conversations(participant1_id);

-- 9. RESOURCES_FOLDERS
CREATE TABLE IF NOT EXISTS resources_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_folder_id UUID REFERENCES resources_folders(id) ON DELETE CASCADE,
    type VARCHAR(50) CHECK (type IN ('INTERNE', 'CLIENT')) DEFAULT 'INTERNE',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resources_folders_parent ON resources_folders(parent_folder_id);

-- 10. RESOURCES_FILES
CREATE TABLE IF NOT EXISTS resources_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES resources_folders(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resources_files_folder_id ON resources_files(folder_id);

-- 11. RESOURCES_SHARES
CREATE TABLE IF NOT EXISTS resources_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES resources_folders(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) CHECK (permission_type IN ('LECTURE_SEULE', 'LECTURE_ECRITURE')) DEFAULT 'LECTURE_SEULE',
    shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resources_shares_folder_id ON resources_shares(folder_id);

-- 12. AUDIT_LOG
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    details JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

-- 13. USER_DAILY_SELECTION
CREATE TABLE IF NOT EXISTS user_daily_selection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    selected_order INTEGER NOT NULL,
    validated_at TIMESTAMP,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_daily_selection_user_date ON user_daily_selection(user_id, date);

-- 14. AI_CONVERSATIONS
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    context_data JSONB,
    model VARCHAR(100) DEFAULT 'mistral-medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_admin_id ON ai_conversations(admin_id);

-- DONNEES DE TEST
-- Mot de passe en clair pour les deux comptes : Admin1234!
INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
VALUES (
    'admin@alliee.test',
    '$2b$10$tz0oU5He83A2iNiIoSHG6uMwZB.XwFlIGbQXsxRHzGR.wZX3BduTq',
    'Admin Test',
    '+33612345678',
    'Administrateur',
    'ADMIN',
    'ACTIF'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
VALUES (
    'employee@alliee.test',
    '$2b$10$tz0oU5He83A2iNiIoSHG6uMwZB.XwFlIGbQXsxRHzGR.wZX3BduTq',
    'Employee Test',
    '+33687654321',
    'Développeur',
    'EMPLOYEE',
    'ACTIF'
) ON CONFLICT (email) DO NOTHING;

COMMIT;
