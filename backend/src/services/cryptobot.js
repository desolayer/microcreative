import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'

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
 */
export async function handleCryptoBotWebhook(payload) {
  if (payload.update_type !== 'invoice_paid') return

  const invoice = payload.payload
  const invoiceId = String(invoice.invoice_id)

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
 * Проверяет статус инвойса напрямую (для polling).
 */
export async function getCryptoBotInvoiceStatus(invoiceId) {
  const { data } = await client.get('/getInvoices', {
    params: { invoice_ids: invoiceId },
  })
  if (!data.ok || !data.result.items.length) return null
  return data.result.items[0].status
}
