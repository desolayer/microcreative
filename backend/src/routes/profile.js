import { Router } from 'express'
import { db } from '../config/database.js'

const router = Router()

// GET /api/profile/me
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, telegram_id, username, first_name, last_name, photo_url, bio,
              rating, reviews_count, completed_deals,
              balance_rub, balance_usdt, balance_ton, balance_stars,
              frozen_rub, frozen_usdt, frozen_ton, frozen_stars,
              created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    )
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// GET /api/profile/:userId
router.get('/:userId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, first_name, last_name, photo_url, bio,
              rating, reviews_count, completed_deals, created_at
       FROM users WHERE id = $1`,
      [req.params.userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// PUT /api/profile/me
router.put('/me', async (req, res, next) => {
  try {
    const { bio } = req.body
    const { rows } = await db.query(
      `UPDATE users SET bio = $1 WHERE id = $2 RETURNING *`,
      [bio, req.user.id]
    )
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

export default router
