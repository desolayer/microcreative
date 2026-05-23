-- =====================================================
-- MicroCreative — миграция 003: deal chat & payment
-- =====================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS invoice_id   TEXT,
  ADD COLUMN IF NOT EXISTS pay_url      TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;

-- Индекс для быстрого поиска сделок по инвойсу
CREATE INDEX IF NOT EXISTS idx_deals_invoice ON deals(invoice_id);
