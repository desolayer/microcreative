import { Router }      from 'express'
import jwt             from 'jsonwebtoken'
import { db }          from '../config/database.js'
import { config }      from '../config/env.js'

const router = Router()

// ── Миграция: создаём таблицу при первом запуске ─────────
export async function ensureAuthTokensTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id          SERIAL PRIMARY KEY,
      telegram_id BIGINT       NOT NULL,
      token       UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      expires_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
      used        BOOLEAN      NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ  DEFAULT NOW()
    )
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_token   ON auth_tokens(token)
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_cleanup ON auth_tokens(expires_at)
  `)
}

// ── Хелпер: сгенерировать токен для telegram_id ──────────
export async function createAuthToken(telegramId) {
  const { rows } = await db.query(
    `INSERT INTO auth_tokens (telegram_id) VALUES ($1) RETURNING token`,
    [telegramId]
  )
  return rows[0].token
}

// ── Хелпер: выдать JWT для пользователя ──────────────────
export function signJwt(user) {
  return jwt.sign(
    { userId: user.id, telegramId: user.telegram_id },
    config.jwtSecret,
    { expiresIn: '7d' }
  )
}

// ── POST /api/auth/token ──────────────────────────────────
// Принимает одноразовый token → возвращает JWT + профиль пользователя
router.post('/token', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token required' })

  try {
    // Атомарно помечаем токен использованным и получаем telegram_id
    const { rows } = await db.query(
      `UPDATE auth_tokens
          SET used = true
        WHERE token = $1 AND used = false AND expires_at > NOW()
        RETURNING telegram_id`,
      [token]
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'Token invalid or expired' })
    }

    const telegramId = rows[0].telegram_id

    // Ищем пользователя
    const userRes = await db.query(
      `SELECT * FROM users WHERE telegram_id = $1`,
      [telegramId]
    )

    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found. Open /start in the bot first.' })
    }

    const user = userRes.rows[0]

    // Авто-снятие истёкшего временного бана
    if (user.banned_until && new Date(user.banned_until) <= new Date()) {
      await db.query(
        `UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1`,
        [user.id]
      )
      user.banned_until = null
      user.ban_reason   = null
    }

    if (user.is_banned) {
      return res.status(403).json({
        error:        'Account permanently banned',
        is_permanent: true,
        ban_reason:   user.ban_reason || null,
      })
    }

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({
        error:        'Account temporarily banned',
        is_permanent: false,
        banned_until: user.banned_until,
        ban_reason:   user.ban_reason || null,
      })
    }

    const jwtToken = signJwt(user)
    console.log(`[AUTH] token exchange OK — telegram_id=${telegramId} user_id=${user.id}`)
    res.json({ token: jwtToken, user })

  } catch (err) {
    console.error('[AUTH] /token error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/auth/refresh ────────────────────────────────
// Принимает действующий JWT → выдаёт новый (продлевает сессию)
router.post('/refresh', async (req, res) => {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' })
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwtSecret)

    const { rows } = await db.query(
      `SELECT * FROM users WHERE id = $1`,
      [payload.userId]
    )

    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const user = rows[0]
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account permanently banned', is_permanent: true })
    }

    res.json({ token: signJwt(user), user })
  } catch (_) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
})

export default router
