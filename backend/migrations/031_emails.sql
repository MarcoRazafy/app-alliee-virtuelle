CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox TEXT NOT NULL DEFAULT 'INBOX',
  account TEXT NOT NULL,
  imap_uid BIGINT NOT NULL,
  message_id TEXT,

  from_name TEXT,
  from_address TEXT,
  to_addresses TEXT,
  subject TEXT,
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  received_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (account, mailbox, imap_uid)
);

CREATE INDEX IF NOT EXISTS idx_emails_received ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails (is_read) WHERE is_read = false;
