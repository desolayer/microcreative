import { Router } from 'express'
import { db } from '../config/database.js'
import { config } from '../config/env.js'

const router = Router()

// GET /api/profile/me
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, telegram_id, username, first_name, last_name, photo_url, bio,
              rating, reviews_count, completed_deals,
              balance_rub, balance_usdt, balance_ton, balance_stars,
              frozen_rub, frozen_usdt, frozen_ton, frozen_stars,
              notif_responses, notif_messages, notif_balance, notif_deals,
              created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    )
    const isAdmin = config.adminTelegramId &&
      parseInt(rows[0].telegram_id) === parseInt(config.adminTelegramId)
    res.json({ ...rows[0], is_admin: !!isAdmin })
  } catch (err) {
    next(err)
  }
})

// GET /api/profile/me/notifications — текущие настройки уведомлений
router.get('/me/notifications', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT notif_responses, notif_messages, notif_balance, notif_deals
       FROM users WHERE id = $1`,
      [req.user.id]
    )
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// PUT /api/profile/me/notifications — сохранить настройки уведомлений
router.put('/me/notifications', async (req, res, next) => {
  try {
    const { notif_responses, notif_messages, notif_balance, notif_deals } = req.body
    const { rows } = await db.query(
      `UPDATE users
       SET notif_responses = COALESCE($1, notif_responses),
           notif_messages  = COALESCE($2, notif_messages),
           notif_balance   = COALESCE($3, notif_balance),
           notif_deals     = COALESCE($4, notif_deals)
       WHERE id = $5
       RETURNING notif_responses, notif_messages, notif_balance, notif_deals`,
      [
        notif_responses ?? null,
        notif_messages  ?? null,
        notif_balance   ?? null,
        notif_deals     ?? null,
        req.user.id,
      ]
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
