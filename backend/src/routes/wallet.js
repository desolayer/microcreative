import { Router } from 'express'
import axios from 'axios'
import { db } from '../config/database.js'
import { config } from '../config/env.js'

const router = Router()

const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('[Wallet] TG error:', e?.response?.data?.description || e.message))

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

// POST /api/wallet/withdraw-request — новый запрос на вывод (с кнопками одобрения для админа)
router.post('/withdraw-request', async (req, res, next) => {
  try {
    const { amount, currency, address } = req.body

    if (!amount || !currency || !address) {
      return res.status(400).json({ error: 'amount, currency and address are required' })
    }

    const ALLOWED = ['USDT', 'TON', 'BTC', 'STARS']
    if (!ALLOWED.includes(currency)) {
      return res.status(400).json({ error: `Unsupported currency. Allowed: ${ALLOWED.join(', ')}` })
    }

    const BALANCE_COL = {
      USDT:  'balance_usdt',
      TON:   'balance_ton',
      BTC:   'balance_usdt',   // BTC хранится в USDT-эквиваленте
      STARS: 'balance_stars',
    }
    const col = BALANCE_COL[currency]

    let requestId
    await db.withTransaction(async (client) => {
      // Резервируем средства (списываем с баланса)
      const { rows } = await client.query(
        `UPDATE users
         SET ${col} = ${col} - $1
         WHERE id = $2 AND ${col} >= $1
         RETURNING id, telegram_id, username, first_name`,
        [amount, req.user.id]
      )
      if (!rows[0]) throw Object.assign(new Error('Insufficient balance'), { status: 400 })
      const user = rows[0]

      // Создаём запрос
      const { rows: reqRows } = await client.query(
        `INSERT INTO withdrawal_requests (user_id, currency, amount, address)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.user.id, currency, amount, address]
      )
      requestId = reqRows[0].id

      // Транзакция «в процессе»
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, status, withdrawal_address)
         VALUES ($1, 'withdrawal', $2, $3, 'pending', $4)`,
        [req.user.id, amount, currency, address]
      )
    })

    // Уведомляем администратора с кнопками одобрения
    if (config.adminTelegramId) {
      const who  = req.user.username ? `@${req.user.username}` : req.user.first_name
      const addr = address.length > 20
        ? `${address.slice(0, 10)}…${address.slice(-6)}`
        : address

      await tg('sendMessage', {
        chat_id: config.adminTelegramId,
        text:
          `💸 *Запрос на вывод #${requestId}*\n\n` +
          `От: ${who}\n` +
          `Сумма: *${amount} ${currency}*\n` +
          `Адрес: \`${addr}\`\n` +
          `Полный адрес: \`${address}\``,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Одобрить', callback_data: `wd:approve:${requestId}` },
            { text: '❌ Отклонить', callback_data: `wd:reject:${requestId}` },
          ]],
        },
      })
    }

    res.json({ success: true, requestId })
  } catch (err) {
    next(err)
  }
})

// GET /api/wallet/withdrawals — история запросов текущего пользователя
router.get('/withdrawals', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, currency, amount, address, status, created_at
       FROM withdrawal_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

export default router
