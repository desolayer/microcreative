import { Router } from 'express'
import { db } from '../config/database.js'
import { notifyAdmin } from '../services/adminNotify.js'
import { notifyUserById } from '../services/telegramNotify.js'
import { config } from '../config/env.js'

const router = Router()

// GET /api/orders?category=design&limit=20&offset=0
router.get('/', async (req, res, next) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query
    const params = [parseInt(limit), parseInt(offset)]
    let where = `WHERE o.status = 'open'`

    if (category && category !== 'Все') {
      where += ` AND o.category = $${params.length + 1}`
      params.push(category)
    }

    const { rows } = await db.query(
      `SELECT o.*,
              u.username, u.first_name, u.last_name, u.photo_url,
              u.rating, u.completed_deals
       FROM orders o
       JOIN users u ON u.id = o.author_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/mine — заказы текущего пользователя (все статусы)
router.get('/mine', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, category, budget, currency, status, rejection_reason,
              deadline_days, created_at,
              (SELECT COUNT(*) FROM order_responses WHERE order_id = orders.id) AS responses_count
       FROM orders
       WHERE author_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT o.*,
              u.username, u.first_name, u.last_name, u.photo_url,
              u.rating, u.completed_deals,
              (SELECT COUNT(*) FROM order_responses WHERE order_id = o.id) AS responses_count
       FROM orders o
       JOIN users u ON u.id = o.author_id
       WHERE o.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/orders
router.post('/', async (req, res, next) => {
  try {
    // Забаненные не могут создавать заказы
    if (req.user.is_banned) {
      return res.status(403).json({ error: 'Your account is banned' })
    }

    const { title, description, category, budget, currency, deadline_days, files } = req.body

    if (!title || !description || !category || !budget || !currency) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Анти-спам: 5+ заказов за час → автобан
    const { rows: spamCheck } = await db.query(
      `SELECT COUNT(*) FROM orders
       WHERE author_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [req.user.id]
    )
    if (parseInt(spamCheck[0].count) >= 5) {
      await db.query(`UPDATE users SET is_banned = TRUE WHERE id = $1`, [req.user.id])
      const who = req.user.username ? `@${req.user.username}` : req.user.first_name
      notifyAdmin(
        `🚨 *Автобан (спам)*\nПользователь: ${who} (TG: ${req.user.telegram_id})\nПричина: 5+ заказов за 1 час`
      ).catch(() => {})
      return res.status(429).json({ error: 'Слишком много заказов. Аккаунт заблокирован.' })
    }

    const { rows } = await db.query(
      `INSERT INTO orders (author_id, title, description, category, budget, currency, deadline_days, files)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, title, description, category, budget, currency,
       deadline_days || 3, JSON.stringify(files || [])]
    )

    // Уведомляем администратора с кнопками модерации
    const who = req.user.username ? `@${req.user.username}` : req.user.first_name
    const orderId = rows[0].id
    const descSnippet = (description || '').substring(0, 180) + (description.length > 180 ? '...' : '')
    notifyAdmin(
      `🔍 *Новый заказ на модерацию*\n\n` +
      `От: ${who}\n` +
      `Категория: ${category}\n` +
      `Название: *${title.replace(/[_*`[]/g, '\\$&')}*\n` +
      `Описание: ${descSnippet.replace(/[_*`[]/g, '\\$&')}\n` +
      `Бюджет: *${budget} ${currency}*`,
      {
        reply_markup: { inline_keyboard: [[
          { text: '✅ Одобрить',  callback_data: `mod:approve:${orderId}` },
          { text: '❌ Отклонить', callback_data: `mod:reject:${orderId}` },
        ]]},
      }
    ).catch(() => {})

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:id/respond — отклик исполнителя
router.post('/:id/respond', async (req, res, next) => {
  try {
    const { message, price, currency, deadline_days } = req.body
    const orderId = req.params.id

    // Забаненные не могут откликаться
    if (req.user.is_banned) {
      return res.status(403).json({ error: 'Your account is banned' })
    }

    // Нельзя откликнуться на свой заказ
    const { rows: orderRows } = await db.query(
      `SELECT author_id, status FROM orders WHERE id = $1`,
      [orderId]
    )
    const order = orderRows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.author_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot respond to your own order' })
    }
    if (order.status !== 'open') {
      return res.status(400).json({ error: 'Order is no longer open' })
    }

    const { rows } = await db.query(
      `INSERT INTO order_responses (order_id, freelancer_id, message, price, currency, deadline_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orderId, req.user.id, message, price || null, currency || null, deadline_days || null]
    )

    // Уведомляем заказчика (DB + Telegram с учётом notif_responses)
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'new_response', $2, $3, $4)`,
      [
        order.author_id,
        'Новый отклик на заказ',
        `${req.user.first_name} откликнулся на ваш заказ`,
        JSON.stringify({ order_id: parseInt(orderId), response_id: rows[0].id }),
      ]
    )
    notifyUserById(
      order.author_id,
      `🔔 *${req.user.first_name}* откликнулся на ваш заказ!`,
      'new_response'
    ).catch(() => {})

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:id/responses — отклики на заказ (только для автора)
router.get('/:id/responses', async (req, res, next) => {
  try {
    const orderId = req.params.id
    const { rows: orderRows } = await db.query(
      `SELECT author_id FROM orders WHERE id = $1`,
      [orderId]
    )
    if (!orderRows[0]) return res.status(404).json({ error: 'Order not found' })
    if (orderRows[0].author_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { rows } = await db.query(
      `SELECT r.*, u.username, u.first_name, u.last_name, u.photo_url, u.rating, u.completed_deals
       FROM order_responses r
       JOIN users u ON u.id = r.freelancer_id
       WHERE r.order_id = $1
       ORDER BY r.created_at DESC`,
      [orderId]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:id/responses/:responseId/accept — принять отклик
router.post('/:id/responses/:responseId/accept', async (req, res, next) => {
  try {
    const { id: orderId, responseId } = req.params

    await db.withTransaction(async (client) => {
      // Проверяем, что заказ принадлежит текущему пользователю
      const { rows: orderRows } = await client.query(
        `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      )
      const order = orderRows[0]
      if (!order || order.author_id !== req.user.id) {
        throw Object.assign(new Error('Forbidden'), { status: 403 })
      }
      if (order.status !== 'open') {
        throw Object.assign(new Error('Order is not open'), { status: 400 })
      }

      const { rows: responseRows } = await client.query(
        `SELECT * FROM order_responses WHERE id = $1 AND order_id = $2`,
        [responseId, orderId]
      )
      const response = responseRows[0]
      if (!response) throw Object.assign(new Error('Response not found'), { status: 404 })

      const amount = response.price || order.budget
      const currency = response.currency || order.currency
      const deadlineDays = response.deadline_days || order.deadline_days
      const deadline = new Date(Date.now() + deadlineDays * 86400000)

      // Создаём сделку
      const { rows: dealRows } = await client.query(
        `INSERT INTO deals (order_id, client_id, freelancer_id, amount, currency, status, deadline)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING *`,
        [orderId, req.user.id, response.freelancer_id, amount, currency, deadline]
      )
      const deal = dealRows[0]

      // Меняем статус заказа
      await client.query(
        `UPDATE orders SET status = 'in_progress' WHERE id = $1`,
        [orderId]
      )

      await client.query(
        `UPDATE order_responses SET status = 'accepted' WHERE id = $1`,
        [responseId]
      )

      // Уведомляем исполнителя
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'deal_created', $2, $3, $4)`,
        [
          response.freelancer_id,
          'Ваш отклик принят!',
          `Заказчик принял ваш отклик. Ожидайте оплату.`,
          JSON.stringify({ deal_id: deal.id, order_id: parseInt(orderId) }),
        ]
      )

      res.status(201).json(deal)
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/orders/:id — удалить заказ (владелец или админ)
router.delete('/:id', async (req, res, next) => {
  try {
    const orderId = req.params.id
    const isAdmin = config.adminTelegramId &&
      parseInt(req.user.telegram_id) === parseInt(config.adminTelegramId)

    // Получаем заказ
    const { rows: orderRows } = await db.query(
      `SELECT o.*, u.username, u.first_name FROM orders o
       JOIN users u ON u.id = o.author_id
       WHERE o.id = $1`,
      [orderId]
    )
    const order = orderRows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })

    // Проверяем права
    if (order.author_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Нельзя удалять заказ с активной сделкой
    const { rows: dealRows } = await db.query(
      `SELECT id FROM deals WHERE order_id = $1 AND status IN ('pending', 'active', 'disputed')`,
      [orderId]
    )
    if (dealRows.length > 0) {
      return res.status(400).json({ error: 'Нельзя удалить заказ с активной сделкой' })
    }

    // Удаляем (мягко — меняем статус)
    await db.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
      [orderId]
    )

    // Уведомляем администратора
    const who = order.username ? `@${order.username}` : order.first_name
    notifyAdmin(
      `🗑 Заказ удалён\nПользователь: ${who}\nЗаказ: ${order.title}`
    ).catch(() => {})

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
