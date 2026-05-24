-- =====================================================
-- MicroCreative — миграция 005: moderation
-- =====================================================

-- Статус по умолчанию для новых заказов — ожидает проверки
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_review';

-- Причина отклонения (заполняется при reject)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Индекс для быстрой выборки очереди модерации
CREATE INDEX IF NOT EXISTS idx_orders_pending_review
  ON orders(created_at ASC) WHERE status = 'pending_review';
