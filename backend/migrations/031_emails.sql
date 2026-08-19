-- Boîte mail entrante : emails récupérés d'une boîte Gmail via IMAP et affichés dans l'app
-- (page admin « Boîte mail »). Lecture seule pour la v1. Une ligne par message IMAP.
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identité IMAP du message : le compte + l'UID sont uniques pour une boîte donnée.
  mailbox TEXT NOT NULL DEFAULT 'INBOX',
  account TEXT NOT NULL,          -- adresse de la boîte (ex. razafymarco0@gmail.com)
  imap_uid BIGINT NOT NULL,       -- UID IMAP (stable au sein d'une UIDVALIDITY)
  message_id TEXT,                -- Message-ID de l'entête (déduplication éventuelle)

  from_name TEXT,
  from_address TEXT,
  to_addresses TEXT,              -- destinataires (concaténés)
  subject TEXT,
  snippet TEXT,                   -- court extrait texte pour la liste
  body_text TEXT,
  body_html TEXT,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{filename, contentType, size}]

  received_at TIMESTAMPTZ,        -- date du mail (entête Date)
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (account, mailbox, imap_uid)
);

CREATE INDEX IF NOT EXISTS idx_emails_received ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails (is_read) WHERE is_read = false;
