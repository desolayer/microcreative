import { Router } from 'express'
import { db } from '../config/database.js'

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
    const { title, description, category, budget, currency, deadline_days, files } = req.body

    if (!title || !description || !category || !budget || !currency) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const { rows } = await db.query(
      `INSERT INTO orders (author_id, title, description, category, budget, currency, deadline_days, files)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, title, description, category, budget, currency,
       deadline_days || 3, JSON.stringify(files || [])]
    )
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

    // Уведомляем заказчика
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

export default router
