-- agent/migrations/002_avatar_profiles.sql
CREATE TABLE IF NOT EXISTS avatar_profiles (
  id               BIGSERIAL PRIMARY KEY,
  client_id        TEXT NOT NULL UNIQUE,
  display_name     TEXT,
  heygen_avatar_id TEXT NOT NULL,
  avatar_type      TEXT NOT NULL DEFAULT 'talking_photo',
  consent_signed   BOOLEAN NOT NULL DEFAULT false,
  consent_date     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
