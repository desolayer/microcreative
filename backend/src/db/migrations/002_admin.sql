-- =====================================================
-- MicroCreative — миграция 002: admin panel
-- =====================================================

-- Поля для модерации в таблице users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_banned   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Жалобы / обращения в поддержку
CREATE TABLE IF NOT EXISTS complaints (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_user     ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_resolved ON complaints(is_resolved);
