import { Router } from 'express'
import { db } from '../config/database.js'
import { lockEscrow, releaseEscrow, refundEscrow } from '../services/escrow.js'
import { notifyAdmin } from '../services/adminNotify.js'
import { notifyUser } from '../services/telegramNotify.js'
import { broadcastToDeal, sendToUser } from '../services/websocket.js'
import { createCryptoBotInvoice } from '../services/cryptobot.js'

const router = Router()

// GET /api/deals — все сделки текущего пользователя
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*,
              o.title AS order_title, o.category,
              c.username AS client_username, c.first_name AS client_first_name, c.photo_url AS client_photo,
              f.username AS freelancer_username, f.first_name AS freelancer_first_name, f.photo_url AS freelancer_photo,
              (SELECT COUNT(*) FROM messages m WHERE m.deal_id = d.id AND m.is_read = false AND m.sender_id != $1) AS unread_count
       FROM deals d
       JOIN orders o ON o.id = d.order_id
       JOIN users c ON c.id = d.client_id
       JOIN users f ON f.id = d.freelancer_id
       WHERE d.client_id = $1 OR d.freelancer_id = $1
       ORDER BY d.updated_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/deals/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*,
              o.title AS order_title, o.description AS order_description, o.category,
              c.id AS client_id, c.username AS client_username,
              c.first_name AS client_first_name, c.photo_url AS client_photo,
              f.id AS freelancer_id, f.username AS freelancer_username,
              f.first_name AS freelancer_first_name, f.photo_url AS freelancer_photo,
              f.rating AS freelancer_rating
       FROM deals d
       JOIN orders o ON o.id = d.order_id
       JOIN users c ON c.id = d.client_id
       JOIN users f ON f.id = d.freelancer_id
       WHERE d.id = $1 AND (d.client_id = $2 OR d.freelancer_id = $2)`,
      [req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Deal not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// GET /api/deals/:id/messages
router.get('/:id/messages', async (req, res, next) => {
  try {
    const dealId = req.params.id

    // Проверяем доступ к сделке
    const { rows: dealRows } = await db.query(
      `SELECT id FROM deals WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2)`,
      [dealId, req.user.id]
    )
    if (!dealRows[0]) return res.status(404).json({ error: 'Deal not found' })

    const { rows } = await db.query(
      `SELECT m.*, u.first_name, u.username, u.photo_url
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.deal_id = $1
       ORDER BY m.created_at ASC`,
      [dealId]
    )

    // Отмечаем сообщения как прочитанные
    await db.query(
      `UPDATE messages SET is_read = true
       WHERE deal_id = $1 AND sender_id != $2 AND is_read = false`,
      [dealId, req.user.id]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/messages
router.post('/:id/messages', async (req, res, next) => {
  try {
    const dealId = req.params.id
    const { message } = req.body

    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' })

    const { rows: dealRows } = await db.query(
      `SELECT * FROM deals WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2)`,
      [dealId, req.user.id]
    )
    const deal = dealRows[0]
    if (!deal) return res.status(404).json({ error: 'Deal not found' })
    if (!['active', 'disputed'].includes(deal.status)) {
      return res.status(400).json({ error: 'Cannot send messages in this deal status' })
    }

    const { rows } = await db.query(
      `INSERT INTO messages (deal_id, sender_id, text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dealId, req.user.id, message.trim()]
    )

    const newMsg = rows[0]

    // Уведомляем другую сторону
    const recipientId = deal.client_id === req.user.id ? deal.freelancer_id : deal.client_id
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'message_received', $2, $3, $4)`,
      [
        recipientId,
        'Новое сообщение',
        `${req.user.first_name}: ${message.trim().substring(0, 80)}`,
        JSON.stringify({ deal_id: parseInt(dealId) }),
      ]
    )

    // WebSocket: рассылаем обоим участникам
    broadcastToDeal(deal.client_id, deal.freelancer_id, {
      type: 'new_message',
      message: { ...newMsg, first_name: req.user.first_name, username: req.user.username, photo_url: req.user.photo_url },
    })

    // TG: уведомляем получателя если не в сети
    const { rows: recipientRows } = await db.query(
      `SELECT telegram_id FROM users WHERE id = $1`, [recipientId]
    )
    if (recipientRows[0]?.telegram_id) {
      notifyUser(
        recipientRows[0].telegram_id,
        `💬 *${req.user.first_name}*: ${message.trim().substring(0, 120)}`
      ).catch(() => {})
    }

    res.status(201).json(newMsg)
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/complete — заказчик подтверждает выполнение
router.post('/:id/complete', async (req, res, next) => {
  try {
    const dealId = req.params.id

    const { rows } = await db.query(
      `SELECT * FROM deals WHERE id = $1 AND client_id = $2`,
      [dealId, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Deal not found or not your deal' })
    if (!['active', 'submitted'].includes(rows[0].status)) {
      return res.status(400).json({ error: 'Deal must be active or submitted to complete' })
    }

    const deal = rows[0]
    const result = await releaseEscrow(parseInt(dealId))

    // DB-уведомление исполнителю
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'deal_completed', $2, $3, $4)`,
      [
        deal.freelancer_id,
        'Сделка завершена!',
        `Заказчик подтвердил выполнение. ${result.freelancerAmount} ${result.currency} зачислено.`,
        JSON.stringify({ deal_id: parseInt(dealId) }),
      ]
    )

    // TG-уведомления обоим
    const { rows: users } = await db.query(
      `SELECT id, telegram_id FROM users WHERE id = ANY($1)`,
      [[deal.client_id, deal.freelancer_id]]
    )
    const clientTg     = users.find(u => u.id === deal.client_id)?.telegram_id
    const freelancerTg = users.find(u => u.id === deal.freelancer_id)?.telegram_id
    notifyUser(clientTg,     `✅ Сделка завершена! Средства переведены исполнителю.`).catch(() => {})
    notifyUser(freelancerTg, `🎉 Сделка завершена! ${result.freelancerAmount} ${result.currency} зачислено на ваш баланс.`).catch(() => {})

    // WebSocket
    broadcastToDeal(deal.client_id, deal.freelancer_id, {
      type: 'deal_status',
      dealId: parseInt(dealId),
      status: 'completed',
    })

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/dispute — открыть спор
router.post('/:id/dispute', async (req, res, next) => {
  try {
    const dealId = req.params.id
    const { reason } = req.body

    const { rows } = await db.query(
      `SELECT * FROM deals WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2)`,
      [dealId, req.user.id]
    )
    const deal = rows[0]
    if (!deal) return res.status(404).json({ error: 'Deal not found' })
    if (deal.status !== 'active') {
      return res.status(400).json({ error: 'Can only dispute active deals' })
    }

    await db.query(
      `UPDATE deals SET status = 'disputed', dispute_reason = $1, disputed_at = NOW()
       WHERE id = $2`,
      [reason || 'No reason provided', dealId]
    )

    // Уведомляем обе стороны + платформу
    const otherUserId = deal.client_id === req.user.id ? deal.freelancer_id : deal.client_id
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'dispute_opened', $2, $3, $4)`,
      [
        otherUserId,
        'Открыт спор по сделке',
        `${req.user.first_name} открыл спор. Причина: ${reason}`,
        JSON.stringify({ deal_id: parseInt(dealId) }),
      ]
    )

    // Уведомляем администратора о споре
    const { rows: users } = await db.query(
      `SELECT id, username, first_name FROM users WHERE id = ANY($1)`,
      [[deal.client_id, deal.freelancer_id]]
    )
    const fmt = (u) => u?.username ? `@${u.username}` : u?.first_name || '?'
    const client     = users.find(u => u.id === deal.client_id)
    const freelancer = users.find(u => u.id === deal.freelancer_id)
    notifyAdmin(
      `⚠️ Спор в сделке #${dealId} между ${fmt(client)} и ${fmt(freelancer)}\nПричина: ${reason || '—'}\nДля возврата: /refund ${dealId}`
    ).catch(() => {})

    res.json({ success: true, status: 'disputed' })
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/cancel — отмена (только в статусе pending)
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const dealId = req.params.id

    const { rows } = await db.query(
      `SELECT * FROM deals WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2)`,
      [dealId, req.user.id]
    )
    const deal = rows[0]
    if (!deal) return res.status(404).json({ error: 'Deal not found' })
    if (!['pending', 'active', 'disputed'].includes(deal.status)) {
      return res.status(400).json({ error: `Cannot cancel deal in status: ${deal.status}` })
    }

    // Если средства уже заморожены — возвращаем
    if (deal.status !== 'pending') {
      await refundEscrow(parseInt(dealId))
    } else {
      await db.query(
        `UPDATE deals SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
        [dealId]
      )
      await db.query(`UPDATE orders SET status = 'open' WHERE id = $1`, [deal.order_id])
    }

    res.json({ success: true, status: 'cancelled' })
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/pay — заказчик создаёт счёт CryptoBot для оплаты эскроу
router.post('/:id/pay', async (req, res, next) => {
  try {
    const dealId = req.params.id

    const { rows } = await db.query(
      `SELECT d.*, o.title AS order_title
       FROM deals d
       JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1 AND d.client_id = $2`,
      [dealId, req.user.id]
    )
    const deal = rows[0]
    if (!deal) return res.status(404).json({ error: 'Deal not found or not your deal' })
    if (deal.status !== 'pending') {
      return res.status(400).json({ error: `Cannot pay: deal is ${deal.status}` })
    }

    // XTR = Telegram Stars; остальное — крипто
    const asset = deal.currency === 'STARS' ? 'XTR' : deal.currency

    const invoice = await createCryptoBotInvoice({
      userId:      req.user.id,
      orderId:     deal.order_id,
      amount:      deal.amount,
      asset,
      description: `Эскроу: ${deal.order_title}`,
    })

    // Переопределяем payload инвойса для маршрутизации вебхука
    // (createCryptoBotInvoice уже создал запись с дефолтным payload,
    //  дополнительно сохраняем pay_url и ссылаем dealId на инвойс)
    await db.query(
      `UPDATE deals SET pay_url = $1, invoice_id = $2 WHERE id = $3`,
      [invoice.payUrl, String(invoice.invoiceId), dealId]
    )

    // Пересоздаём инвойс с правильным payload через прямой запрос
    // (CryptoBot не позволяет обновить существующий инвойс, поэтому
    //  при вебхуке мы ищем по invoice_id в таблице deals)
    res.json({ payUrl: invoice.payUrl, invoiceId: invoice.invoiceId, amount: invoice.amount, asset })
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/submit — исполнитель сдаёт работу на проверку
router.post('/:id/submit', async (req, res, next) => {
  try {
    const dealId = req.params.id

    const { rows } = await db.query(
      `SELECT d.*, c.telegram_id AS client_tg
       FROM deals d
       JOIN users c ON c.id = d.client_id
       WHERE d.id = $1 AND d.freelancer_id = $2`,
      [dealId, req.user.id]
    )
    const deal = rows[0]
    if (!deal) return res.status(404).json({ error: 'Deal not found or not your deal' })
    if (deal.status !== 'active') {
      return res.status(400).json({ error: 'Can only submit active deals' })
    }

    await db.query(
      `UPDATE deals SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
      [dealId]
    )

    // DB-уведомление заказчику
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'work_submitted', $2, $3, $4)`,
      [
        deal.client_id,
        'Работа сдана на проверку',
        `${req.user.first_name} отправил работу. Проверьте и подтвердите.`,
        JSON.stringify({ deal_id: parseInt(dealId) }),
      ]
    )

    // TG-уведомление заказчику
    notifyUser(deal.client_tg,
      `📬 *${req.user.first_name}* сдал работу по сделке.\nПроверьте и подтвердите выполнение.`
    ).catch(() => {})

    // WebSocket обоим участникам
    broadcastToDeal(deal.client_id, deal.freelancer_id, {
      type: 'deal_status',
      dealId: parseInt(dealId),
      status: 'submitted',
    })

    res.json({ success: true, status: 'submitted' })
  } catch (err) {
    next(err)
  }
})

// POST /api/deals/:id/activate — заказчик активирует сделку после оплаты эскроу
router.post('/:id/activate', async (req, res, next) => {
  try {
    const dealId = req.params.id

    await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM deals WHERE id = $1 AND client_id = $2 AND status = 'pending' FOR UPDATE`,
        [dealId, req.user.id]
      )
      const deal = rows[0]
      if (!deal) throw Object.assign(new Error('Deal not found or already active'), { status: 404 })

      // Замораживаем средства
      await lockEscrow(client, {
        userId: req.user.id,
        dealId: parseInt(dealId),
        amount: deal.amount,
        currency: deal.currency,
      })

      await client.query(
        `UPDATE deals SET status = 'active' WHERE id = $1`,
        [dealId]
      )

      // Уведомляем исполнителя
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'deal_created', $2, $3, $4)`,
        [
          deal.freelancer_id,
          'Сделка активирована!',
          `Заказчик внёс оплату в эскроу. Можно начинать работу!`,
          JSON.stringify({ deal_id: parseInt(dealId) }),
        ]
      )

      res.json({ success: true, status: 'active' })
    })
  } catch (err) {
    next(err)
  }
})

export default router
