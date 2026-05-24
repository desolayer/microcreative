-- =====================================================
-- MicroCreative — миграция 006: warnings & temp ban
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS warnings_count INT  DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until   TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users(banned_until)
  WHERE banned_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_warnings ON users(warnings_count)
  WHERE warnings_count > 0;
