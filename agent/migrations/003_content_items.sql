-- agent/migrations/003_content_items.sql
CREATE TABLE IF NOT EXISTS content_items (
  id            UUID PRIMARY KEY,
  client_id     TEXT NOT NULL,
  format        TEXT NOT NULL,
  network       TEXT NOT NULL,
  media_url     TEXT,
  caption       TEXT,
  hashtags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  external_id   TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_due ON content_items (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_client ON content_items (client_id);
