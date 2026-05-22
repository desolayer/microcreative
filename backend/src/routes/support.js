import { Router } from 'express'
import { db } from '../config/database.js'
import { notifyAdmin } from '../services/adminNotify.js'

const router = Router()

// POST /api/support — пользователь отправляет обращение
router.post('/', async (req, res, next) => {
  try {
    const { message } = req.body
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' })
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: 'Сообщение слишком длинное (макс. 2000 символов)' })
    }

    const user = req.user
    const text = message.trim()

    // Сохраняем в БД
    const { rows } = await db.query(
      `INSERT INTO complaints (user_id, text) VALUES ($1, $2) RETURNING id`,
      [user.id, text]
    )
    const complaintId = rows[0].id

    const who     = user.username ? `@${user.username}` : user.first_name
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')

    // Отправляем уведомление администратору
    await notifyAdmin(
      `🆘 *Обращение в поддержку #${complaintId}*\n` +
      `От: ${who} (ID: ${user.telegram_id})\n` +
      `Имя: ${fullName}\n\n` +
      `${text}`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💬 Ответить пользователю',
              callback_data: `reply:${user.id}:${user.username || ''}`,
            },
            {
              text: '✅ Закрыть',
              callback_data: `resolve:${complaintId}`,
            },
          ]],
        },
      }
    )

    res.json({ success: true, complaintId })
  } catch (err) {
    next(err)
  }
})

export default router
