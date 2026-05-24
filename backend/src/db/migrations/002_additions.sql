-- =====================================================
-- MicroCreative — дополнения к схеме БД
-- =====================================================

-- ── Колонки которые были пропущены в 001 ────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned    BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN DEFAULT FALSE;

-- ── Настройки уведомлений (новинка) ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_responses BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_messages  BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_balance   BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_deals     BOOLEAN DEFAULT TRUE;

-- ── Поля deals которых не хватало ───────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS invoice_id    VARCHAR(256);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pay_url       TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMP WITH TIME ZONE;

-- ── Запросы на вывод средств ─────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency    VARCHAR(10)   NOT NULL,
  amount      DECIMAL(18,8) NOT NULL,
  address     TEXT          NOT NULL,
  status      VARCHAR(20)   DEFAULT 'pending',   -- pending | approved | rejected
  admin_note  TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user   ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_created ON withdrawal_requests(created_at DESC);

-- ── Индекс для анти-спам проверки ───────────────────
CREATE INDEX IF NOT EXISTS idx_orders_author_created ON orders(author_id, created_at DESC);

-- ── complaints (если не создан в 001) ───────────────
CREATE TABLE IF NOT EXISTS complaints (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
