-- =====================================================
-- MicroCreative — начальная схема базы данных
-- =====================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Пользователи ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  telegram_id     BIGINT UNIQUE NOT NULL,
  username        VARCHAR(64),
  first_name      VARCHAR(128) NOT NULL,
  last_name       VARCHAR(128),
  photo_url       TEXT,
  bio             TEXT,

  -- Рейтинг исполнителя
  rating          DECIMAL(3, 2) DEFAULT 0,
  reviews_count   INTEGER DEFAULT 0,
  completed_deals INTEGER DEFAULT 0,

  -- Балансы (хранятся в минимальных единицах каждой валюты)
  balance_rub     DECIMAL(12, 2) DEFAULT 0,
  balance_usdt    DECIMAL(12, 6) DEFAULT 0,
  balance_ton     DECIMAL(12, 9) DEFAULT 0,
  balance_stars   INTEGER DEFAULT 0,

  -- Заморожено в эскроу
  frozen_rub      DECIMAL(12, 2) DEFAULT 0,
  frozen_usdt     DECIMAL(12, 6) DEFAULT 0,
  frozen_ton      DECIMAL(12, 9) DEFAULT 0,
  frozen_stars    INTEGER DEFAULT 0,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Заказы ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(256) NOT NULL,
  description   TEXT NOT NULL,
  category      VARCHAR(64) NOT NULL,  -- design, text, music, video, code, other
  budget        DECIMAL(12, 6) NOT NULL,
  currency      VARCHAR(10) NOT NULL,  -- RUB, USDT, TON, STARS
  deadline_days INTEGER NOT NULL DEFAULT 3,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  -- open | in_progress | completed | cancelled

  -- Прикреплённые файлы (массив объектов {name, url, size})
  files         JSONB DEFAULT '[]',

  -- Количество откликов
  responses_count INTEGER DEFAULT 0,

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Отклики на заказы ────────────────────────────────
CREATE TABLE IF NOT EXISTS order_responses (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  price         DECIMAL(12, 6),        -- предложенная цена (необязательно)
  currency      VARCHAR(10),
  deadline_days INTEGER,
  status        VARCHAR(20) DEFAULT 'pending',
  -- pending | accepted | rejected

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (order_id, freelancer_id)     -- один исполнитель — один отклик
);

-- ── Сделки (активные контракты) ───────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  client_id     INTEGER NOT NULL REFERENCES users(id),       -- заказчик
  freelancer_id INTEGER NOT NULL REFERENCES users(id),       -- исполнитель
  amount        DECIMAL(12, 6) NOT NULL,
  currency      VARCHAR(10) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | active | completed | disputed | cancelled

  -- Дедлайн сделки
  deadline      TIMESTAMP WITH TIME ZONE,

  -- Причина спора
  dispute_reason TEXT,
  disputed_at   TIMESTAMP WITH TIME ZONE,

  -- Когда завершена/отменена
  completed_at  TIMESTAMP WITH TIME ZONE,
  cancelled_at  TIMESTAMP WITH TIME ZONE,

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Сообщения в сделке ────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  text        TEXT,
  file_url    TEXT,
  file_name   VARCHAR(256),
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Транзакции / движение средств ────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id),
  type                  VARCHAR(30) NOT NULL,
  -- deposit | withdrawal | escrow_lock | escrow_release | escrow_refund | commission

  amount                DECIMAL(12, 6) NOT NULL,
  currency              VARCHAR(10) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | completed | failed | cancelled

  -- Платёжная система
  payment_provider      VARCHAR(20),  -- cryptobot | cryptomus
  provider_invoice_id   VARCHAR(256) UNIQUE,   -- ID инвойса в платёжной системе
  provider_data         JSONB DEFAULT '{}',    -- полный ответ провайдера

  -- Связь со сделкой (для эскроу-транзакций)
  deal_id               INTEGER REFERENCES deals(id),

  -- Для вывода — адрес кошелька
  withdrawal_address    VARCHAR(256),

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Уведомления ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  -- new_response | deal_created | deal_completed | payment_received |
  -- dispute_opened | message_received

  title       VARCHAR(256) NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}',   -- ссылка на order_id / deal_id и т.д.
  is_read     BOOLEAN DEFAULT FALSE,

  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Индексы ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_author     ON orders(author_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_category   ON orders(category);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deals_client      ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_freelancer  ON deals(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_deals_status      ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_order       ON deals(order_id);

CREATE INDEX IF NOT EXISTS idx_messages_deal     ON messages(deal_id);
CREATE INDEX IF NOT EXISTS idx_messages_created  ON messages(created_at ASC);

CREATE INDEX IF NOT EXISTS idx_transactions_user     ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(provider_invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read);

-- ── Триггер updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at') THEN
    CREATE TRIGGER orders_updated_at
      BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deals_updated_at') THEN
    CREATE TRIGGER deals_updated_at
      BEFORE UPDATE ON deals
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_updated_at') THEN
    CREATE TRIGGER transactions_updated_at
      BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
