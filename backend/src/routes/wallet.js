import { Router } from 'express'
import { db } from '../config/database.js'

const router = Router()

// GET /api/wallet/balance
router.get('/balance', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT balance_rub, balance_usdt, balance_ton, balance_stars,
              frozen_rub, frozen_usdt, frozen_ton, frozen_stars
       FROM users WHERE id = $1`,
      [req.user.id]
    )
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// GET /api/wallet/history
router.get('/history', async (req, res, next) => {
  try {
    const { limit = 30, offset = 0 } = req.query
    const { rows } = await db.query(
      `SELECT t.*, d.order_id
       FROM transactions t
       LEFT JOIN deals d ON d.id = t.deal_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/wallet/withdraw
router.post('/withdraw', async (req, res, next) => {
  try {
    const { amount, currency, address } = req.body

    if (!amount || !currency || !address) {
      return res.status(400).json({ error: 'amount, currency and address are required' })
    }

    const balanceCols = {
      RUB: 'balance_rub',
      USDT: 'balance_usdt',
      TON: 'balance_ton',
    }
    const col = balanceCols[currency]
    if (!col) return res.status(400).json({ error: 'Unsupported currency for withdrawal' })

    await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE users SET ${col} = ${col} - $1
         WHERE id = $2 AND ${col} >= $1
         RETURNING id`,
        [amount, req.user.id]
      )
      if (!rows[0]) {
        throw Object.assign(new Error('Insufficient balance'), { status: 400 })
      }

      await client.query(
        `INSERT INTO transactions
           (user_id, type, amount, currency, status, withdrawal_address)
         VALUES ($1, 'withdrawal', $2, $3, 'pending', $4)`,
        [req.user.id, amount, currency, address]
      )
    })

    // Здесь вызывался бы CryptoBot / Cryptomus API для реального перевода
    res.json({ success: true, message: 'Withdrawal request submitted' })
  } catch (err) {
    next(err)
  }
})

export default router
