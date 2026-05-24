-- =====================================================
-- MicroCreative — миграция 004: admin features
-- =====================================================

-- ── Лог ошибок (заполняется автоматически errorHandler) ──
CREATE TABLE IF NOT EXISTS error_logs (
  id         SERIAL PRIMARY KEY,
  message    TEXT    NOT NULL,
  stack      TEXT,
  path       VARCHAR(255),
  method     VARCHAR(10),
  user_id    INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

-- ── Лог действий администратора ──────────────────────
CREATE TABLE IF NOT EXISTS admin_logs (
  id         SERIAL PRIMARY KEY,
  admin_id   BIGINT,
  action     TEXT    NOT NULL,
  type       VARCHAR(20) DEFAULT 'info',  -- info | warning | error
  data       JSONB   DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_type    ON admin_logs(type);

-- ── Настройки приложения (key-value) ─────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
  VALUES ('maintenance_mode', 'false')
  ON CONFLICT (key) DO NOTHING;
