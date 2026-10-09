CREATE TABLE IF NOT EXISTS connection_limit_hits (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_day date NOT NULL,
  hit_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, business_day)
);
