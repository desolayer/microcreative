import axios from 'axios'
import crypto from 'crypto'
import { config } from '../config/env.js'
import { db } from '../config/database.js'

// Cryptomus поддерживает: USDT, USDC, TRX, SOL, BTC, ETH и другие
export const CRYPTOMUS_CURRENCIES = ['USDT', 'USDC', 'TRX', 'SOL', 'BTC']

function sign(body) {
  const json = JSON.stringify(body)
  const base64 = Buffer.from(json).toString('base64')
  return crypto.createHash('md5').update(base64 + config.cryptomus.apiKey).digest('hex')
}

const client = axios.create({
  baseURL: config.cryptomus.apiUrl,
})

async function cryptomusRequest(endpoint, body) {
  const { data } = await client.post(endpoint, body, {
    headers: {
      merchant: config.cryptomus.merchantId,
      sign: sign(body),
      'Content-Type': 'application/json',
    },
  })
  if (!data.state || data.state !== 0) {
    throw new Error(`Cryptomus error: ${data.message || JSON.stringify(data)}`)
  }
  return data.result
}

/**
 * Создаёт инвойс Cryptomus для депозита.
 * currency: 'USDT', 'TRX', 'SOL', 'BTC'
 * network: 'TRON', 'SOLANA', 'BTC' и т.д.
 */
export async function createCryptomusInvoice({ userId, orderId, amount, currency, network }) {
  const orderRef = `mc-${userId}-${orderId}-${Date.now()}`

  const result = await cryptomusRequest('/payment', {
    amount: String(amount),
    currency,
    network,
    order_id: orderRef,
    url_callback: `${config.backendUrl}/api/webhooks/cryptomus`,
    url_return: config.backendUrl,
    url_success: config.backendUrl,
    is_payment_multiple: false,
    lifetime: 3600,
    to_currency: currency,
  })

  await db.query(
    `INSERT INTO transactions
       (user_id, type, amount, currency, status, payment_provider, provider_invoice_id, provider_data)
     VALUES ($1, 'deposit', $2, $3, 'pending', 'cryptomus', $4, $5)`,
    [userId, amount, currency, result.uuid, JSON.stringify(result)]
  )

  return {
    invoiceId: result.uuid,
    payUrl: result.url,
    amount: result.amount,
    currency: result.currency,
    network: result.network,
    address: result.address,
    expiredAt: result.expired_at,
  }
}

/**
 * Проверяет подпись вебхука Cryptomus.
 */
export function verifyCryptomusWebhook(body) {
  const received = body.sign
  if (!received) return false

  const { sign: _sign, ...rest } = body
  const computed = sign(rest)
  return computed === received
}

/**
 * Обрабатывает вебхук от Cryptomus.
 */
export async function handleCryptomusWebhook(body) {
  if (!verifyCryptomusWebhook(body)) {
    throw Object.assign(new Error('Invalid Cryptomus webhook signature'), { status: 400 })
  }

  const { order_id, uuid, status, amount, currency, payment_amount } = body

  if (status !== 'paid' && status !== 'paid_over') return

  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE provider_invoice_id = $1 AND payment_provider = 'cryptomus'`,
    [uuid]
  )
  const tx = rows[0]
  if (!tx || tx.status === 'completed') return

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE transactions
       SET status = 'completed', provider_data = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(body), tx.id]
    )

    const balanceCol = currency === 'USDT' || currency === 'USDC'
      ? 'balance_usdt'
      : 'balance_rub' // fallback — можно расширить под все монеты

    await client.query(
      `UPDATE users SET ${balanceCol} = ${balanceCol} + $1 WHERE id = $2`,
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
