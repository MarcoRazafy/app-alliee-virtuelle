BEGIN;

CREATE TABLE IF NOT EXISTS message_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_group_members (
    group_id UUID NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS messages_channel_type_check;

ALTER TABLE messages
    ADD CONSTRAINT messages_channel_type_check
    CHECK (channel_type IN ('GLOBAL', 'PRIVATE', 'GROUP'));

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES message_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_message_group_members_user_id ON message_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_message_groups_last_message_at ON message_groups(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);

COMMIT;
