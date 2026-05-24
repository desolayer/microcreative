import crypto from 'crypto'
import { config } from '../config/env.js'
import { db } from '../config/database.js'
import { notifyAdmin } from '../services/adminNotify.js'

function validateTelegramInitData(initData) {
  if (!initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegramBotToken)
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return null

  const authDate = parseInt(params.get('auth_date') || '0')
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 86400) return null

  const userRaw = params.get('user')
  if (!userRaw) return null

  try {
    return JSON.parse(userRaw)
  } catch {
    return null
  }
}

export async function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data']

  if (config.nodeEnv === 'development' && !initData) {
    const devUser = await getOrCreateUser({
      id: 12345,
      first_name: 'Dev',
      last_name: 'User',
      username: 'dev_user',
    })
    req.user = devUser
    return next()
  }

  const telegramUser = validateTelegramInitData(initData)
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized: invalid Telegram initData' })
  }

  try {
    const user = await getOrCreateUser(telegramUser)

    // Авто-снятие истёкшего временного бана
    if (user.banned_until && new Date(user.banned_until) <= new Date()) {
      await db.query(
        `UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1`,
        [user.id]
      )
      user.banned_until = null
      user.ban_reason   = null
    }

    // Постоянный бан
    if (user.is_banned) {
      return res.status(403).json({
        error:        'Account permanently banned',
        is_permanent: true,
        ban_reason:   user.ban_reason || null,
      })
    }

    // Временный бан
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({
        error:        'Account temporarily banned',
        is_permanent: false,
        banned_until: user.banned_until,
        ban_reason:   user.ban_reason || null,
      })
    }

    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

async function getOrCreateUser(telegramUser) {
  const { rows } = await db.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username   = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name  = EXCLUDED.last_name,
       photo_url  = COALESCE(EXCLUDED.photo_url, users.photo_url),
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS is_new`,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name,
      telegramUser.last_name || null,
      telegramUser.photo_url || null,
    ]
  )
  const user = rows[0]

  // Уведомляем администратора о новом пользователе
  if (user.is_new) {
    const who = user.username ? `@${user.username}` : user.first_name
    notifyAdmin(`👤 Новый пользователь: ${who} (ID: ${user.telegram_id})`).catch(() => {})
  }

  return user
}
