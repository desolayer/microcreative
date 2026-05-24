import { Router } from 'express'
import { db } from '../config/database.js'
import {
  createCryptoBotInvoice,
  getCryptoBotInvoiceStatus,
  handleCryptoBotWebhook,
  ALL_ASSETS,
} from '../services/cryptobot.js'

const router = Router()

// POST /api/payments/cryptobot
// asset: 'TON' | 'USDT' | 'BTC' | 'ETH' | 'LTC' | 'BNB' | 'TRX' | 'USDC' | 'XTR'
router.post('/cryptobot', async (req, res, next) => {
  try {
    const { orderId, asset, amount } = req.body

    if (!asset || !amount) {
      return res.status(400).json({ error: 'asset and amount are required' })
    }
    if (!ALL_ASSETS.includes(asset)) {
      return res.status(400).json({ error: `Unsupported asset. Allowed: ${ALL_ASSETS.join(', ')}` })
    }

    const invoice = await createCryptoBotInvoice({
      userId: req.user.id,
      orderId: orderId || null,
      amount,
      asset,
    })
    res.json(invoice)
  } catch (err) {
    next(err)
  }
})

// GET /api/payments/:paymentId/status
router.get('/:paymentId/status', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT status, type, amount, currency, payment_provider, created_at, updated_at
       FROM transactions
       WHERE provider_invoice_id = $1 AND user_id = $2`,
      [req.params.paymentId, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Payment not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/webhooks/cryptobot  (без authMiddleware — вызывается CryptoBot)
// Маршрут /cryptobot потому что роутер смонтирован на /api/webhooks
router.post('/cryptobot', async (req, res, next) => {
  try {
    console.log('[Webhook] CryptoBot event:', JSON.stringify(req.body).substring(0, 200))
    await handleCryptoBotWebhook(req.body)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
