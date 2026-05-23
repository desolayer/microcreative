import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'
import { notifyUser } from './telegramNotify.js'
import { broadcastToDeal } from './websocket.js'

const client = axios.create({
  baseURL: config.cryptobot.apiUrl,
  headers: { 'Crypto-Pay-API-Token': config.cryptobot.apiToken },
})

// Все поддерживаемые активы CryptoBot
export const CRYPTO_ASSETS = ['TON', 'USDT', 'BTC', 'ETH', 'LTC', 'BNB', 'TRX', 'USDC']
export const ALL_ASSETS = [...CRYPTO_ASSETS, 'XTR'] // XTR = Telegram Stars

// Колонка баланса по валюте
const BALANCE_COL = {
  TON:  'balance_ton',
  XTR:  'balance_stars',
  // Все остальные крипто-активы → USDT-баланс
}
function balanceCol(currency) {
  return BALANCE_COL[currency] || 'balance_usdt'
}

/**
 * Создаёт инвойс CryptoBot.
 * asset: 'TON' | 'USDT' | 'BTC' | 'ETH' | 'LTC' | 'BNB' | 'TRX' | 'USDC' | 'XTR'
 */
export async function createCryptoBotInvoice({ userId, orderId, amount, asset, description }) {
  const isStars = asset === 'XTR'

  // CryptoBot API различает крипто и Stars (fiat)
  const invoiceParams = isStars
    ? {
        currency_type: 'fiat',
        fiat: 'XTR',
        amount: String(Math.round(amount)), // Stars — целое число
      }
    : {
        currency_type: 'crypto',
        asset,
        amount: String(amount),
      }

  const { data } = await client.post('/createInvoice', {
    ...invoiceParams,
    description: description || `MicroCreative заказ #${orderId}`,
    payload: JSON.stringify({ userId, orderId }),
    paid_btn_name: 'openBot',
    paid_btn_url: config.backendUrl,
    allow_comments: false,
    allow_anonymous: false,
    expires_in: 3600,
  })

  if (!data.ok) {
    throw new Error(`CryptoBot error: ${JSON.stringify(data.error)}`)
  }

  const invoice = data.result

  await db.query(
    `INSERT INTO transactions
       (user_id, type, amount, currency, status, payment_provider, provider_invoice_id, provider_data)
     VALUES ($1, 'deposit', $2, $3, 'pending', 'cryptobot', $4, $5)`,
    [userId, amount, asset, String(invoice.invoice_id), JSON.stringify(invoice)]
  )

  return {
    invoiceId: invoice.invoice_id,
    payUrl: invoice.pay_url,
    amount: invoice.amount,
    asset: invoice.asset || invoice.fiat,
    status: invoice.status,
  }
}

/**
 * Обрабатывает вебхук от CryptoBot (событие invoice_paid).
 * Различает оплату сделки и пополнение баланса по полю payload в инвойсе.
 */
export async function handleCryptoBotWebhook(payload) {
  if (payload.update_type !== 'invoice_paid') return

  const invoice = payload.payload
  const invoiceId = String(invoice.invoice_id)

  // Разбираем payload, который мы записали при создании инвойса
  let invoicePayload = {}
  try { invoicePayload = JSON.parse(invoice.payload || '{}') } catch (_) {}

  // ── Оплата сделки: по payload ИЛИ по invoice_id в таблице deals ──
  if (invoicePayload.type === 'deal_payment') {
    await handleDealPayment(invoice, invoicePayload.dealId)
    return
  }
  // Проверяем, не привязан ли инвойс к сделке напрямую (через POST /deals/:id/pay)
  const { rows: dealByInvoice } = await db.query(
    `SELECT id FROM deals WHERE invoice_id = $1 AND status = 'pending'`,
    [invoiceId]
  )
  if (dealByInvoice[0]) {
    await handleDealPayment(invoice, dealByInvoice[0].id)
    return
  }

  // ── Пополнение кошелька ───────────────────────────
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE provider_invoice_id = $1 AND payment_provider = 'cryptobot'`,
    [invoiceId]
  )
  const tx = rows[0]
  if (!tx || tx.status === 'completed') return

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE transactions
       SET status = 'completed', provider_data = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(invoice), tx.id]
    )

    const col = balanceCol(tx.currency)
    await client.query(
      `UPDATE users SET ${col} = ${col} + $1 WHERE id = $2`,
      [tx.amount, tx.user_id]
    )

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'payment_received', $2, $3, $4)`,
      [
        tx.user_id,
        'Пополнение получено',
        `${tx.amount} ${tx.currency} зачислено на ваш баланс`,
        JSON.stringify({ amount: tx.amount, currency: tx.currency }),
      ]
    )
  })
}

/**
 * Обрабатывает успешную оплату сделки.
 * Зачисляет сумму на баланс клиента, немедленно замораживает в эскроу, активирует сделку.
 */
async function handleDealPayment(invoice, dealId) {
  if (!dealId) return

  const { rows: dealRows } = await db.query(
    `SELECT d.*, c.telegram_id AS client_tg, f.telegram_id AS freelancer_tg
     FROM deals d
     JOIN users c ON c.id = d.client_id
     JOIN users f ON f.id = d.freelancer_id
     WHERE d.id = $1`,
    [dealId]
  )
  const deal = dealRows[0]
  if (!deal || deal.status !== 'pending') return

  const currency = deal.currency
  const { balance, frozen } = colsFor(currency)

  await db.withTransaction(async (client) => {
    // Пометим инвойс оплаченным в транзакциях
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, status, deal_id, payment_provider, provider_invoice_id)
       VALUES ($1, 'deal_payment', $2, $3, 'completed', $4, 'cryptobot', $5)
       ON CONFLICT DO NOTHING`,
      [deal.client_id, deal.amount, currency, dealId, String(invoice.invoice_id)]
    )

    // Зачисляем на баланс клиента и сразу замораживаем
    await client.query(
      `UPDATE users
       SET ${balance} = ${balance} + $1 - $1,
           ${frozen}  = ${frozen}  + $1
       WHERE id = $2`,
      [deal.amount, deal.client_id]
    )

    // Активируем сделку
    await client.query(
      `UPDATE deals SET status = 'active', invoice_id = $1 WHERE id = $2`,
      [String(invoice.invoice_id), dealId]
    )

    // Уведомления в БД
    for (const [userId, title, body] of [
      [deal.client_id,     'Эскроу пополнен',   `${deal.amount} ${currency} заморожено. Исполнитель может начать работу.`],
      [deal.freelancer_id, 'Оплата получена!',   `${deal.amount} ${currency} в эскроу. Можешь начинать работу!`],
    ]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payment_received', $2, $3, $4)`,
        [userId, title, body, JSON.stringify({ deal_id: dealId })]
      )
    }
  })

  // Telegram-уведомления
  const frontendUrl = config.frontendUrl
  notifyUser(deal.client_tg,
    `✅ Эскроу пополнен!\n${deal.amount} ${currency} заморожено.\nИсполнитель приступает к работе.`
  ).catch(() => {})
  notifyUser(deal.freelancer_tg,
    `💰 Оплата получена!\n${deal.amount} ${currency} в эскроу. Можешь начинать работу!\n[Открыть чат](${frontendUrl})`
  ).catch(() => {})

  // WebSocket-событие
  broadcastToDeal(deal.client_id, deal.freelancer_id, {
    type: 'deal_status',
    dealId,
    status: 'active',
  })
}

// Маппинг для заморозки (аналог escrow.js, чтобы не импортировать)
const COLS = {
  RUB:   { balance: 'balance_rub',   frozen: 'frozen_rub' },
  USDT:  { balance: 'balance_usdt',  frozen: 'frozen_usdt' },
  TON:   { balance: 'balance_ton',   frozen: 'frozen_ton' },
  STARS: { balance: 'balance_stars', frozen: 'frozen_stars' },
}
function colsFor(currency) {
  return COLS[currency] || COLS['USDT']
}

/**
 * Проверяет статус инвойса напрямую (для polling).
 */
export async function getCryptoBotInvoiceStatus(invoiceId) {
  const { data } = await client.get('/getInvoices', {
    params: { invoice_ids: invoiceId },
  })
  if (!data.ok || !data.result.items.length) return null
  return data.result.items[0].status
}
