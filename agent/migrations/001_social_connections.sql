-- agent/migrations/001_social_connections.sql
CREATE TABLE IF NOT EXISTS social_connections (
  id               BIGSERIAL PRIMARY KEY,
  client_id        TEXT NOT NULL,
  platform         TEXT NOT NULL,
  account_id       TEXT NOT NULL,
  account_name     TEXT,
  access_token     TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform)
);
