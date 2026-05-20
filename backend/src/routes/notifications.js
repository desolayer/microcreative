import { Router } from 'express'
import { db } from '../config/database.js'

const router = Router()

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const { limit = 30, offset = 0 } = req.query
    const { rows } = await db.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    )
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    )
    res.json({ notifications: rows, unread: parseInt(countRows[0].unread) })
  } catch (err) {
    next(err)
  }
})

// POST /api/notifications/read-all
router.post('/read-all', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
