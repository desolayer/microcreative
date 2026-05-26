import crypto    from 'crypto'
import jwt       from 'jsonwebtoken'
import { config } from '../config/env.js'
import { db }     from '../config/database.js'
import { notifyAdmin } from '../services/adminNotify.js'

// ── Валидация Telegram initData (HMAC-SHA256) ─────────────
export function validateTelegramInitData(initData) {
  if (!initData) return { error: 'empty' }

  const params = new URLSearchParams(initData)
  const hash   = params.get('hash')
  if (!hash) return { error: 'no_hash' }

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegramBotToken.trim())
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return { error: 'bad_hash' }

  const authDate = parseInt(params.get('auth_date') || '0')
  const ageSec   = Math.floor(Date.now() / 1000) - authDate
  if (ageSec > 604800) return { error: `expired:${ageSec}s` }

  const userRaw = params.get('user')
  if (!userRaw) return { error: 'no_user' }

  try {
    return { user: JSON.parse(userRaw) }
  } catch {
    return { error: 'bad_user_json' }
  }
}

// ── Общие ban-проверки ────────────────────────────────────
async function applyBanChecks(user, res) {
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
    res.status(403).json({
      error: 'Account permanently banned', is_permanent: true,
      ban_reason: user.ban_reason || null,
    })
    return false
  }

  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    res.status(403).json({
      error: 'Account temporarily banned', is_permanent: false,
      banned_until: user.banned_until, ban_reason: user.ban_reason || null,
    })
    return false
  }

  return true
}

// ── authMiddleware ────────────────────────────────────────
export async function authMiddleware(req, res, next) {

  // ── 1. JWT (Authorization: Bearer <token>) ─────────────
  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const payload = jwt.verify(token, config.jwtSecret)

      const { rows } = await db.query(
        `SELECT * FROM users WHERE id = $1`,
        [payload.userId]
      )

      if (!rows.length) {
        return res.status(401).json({ error: 'User not found' })
      }

      const user = rows[0]
      const ok   = await applyBanChecks(user, res)
      if (!ok) return

      req.user = user
      return next()
    } catch (_) {
      return res.status(401).json({ error: 'Invalid or expired JWT' })
    }
  }

  // ── 2. Telegram initData (X-Telegram-Init-Data header) ──
  const rawHeader = req.headers['x-telegram-init-data']
  const initData  = rawHeader || ''

  // Dev-bypass
  if (config.nodeEnv === 'development' && !initData) {
    const devUser = await getOrCreateUser({
      id: 12345, first_name: 'Dev', last_name: 'User', username: 'dev_user',
    })
    req.user = devUser
    return next()
  }

  const result = validateTelegramInitData(initData)
  if (result.error) {
    const headerState = rawHeader === undefined ? 'absent' : 'empty'
    const logReason   = result.error === 'empty' ? headerState : result.error
    console.log(`[AUTH 401] ${logReason} — ${req.method} ${req.path}`)
    return res.status(401).json({ error: 'Unauthorized: no valid auth' })
  }

  try {
    const user = await getOrCreateUser(result.user)
    const ok   = await applyBanChecks(user, res)
    if (!ok) return

    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

// ── getOrCreateUser (только для initData-пути) ───────────
export async function getOrCreateUser(telegramUser) {
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
      telegramUser.username   || null,
      telegramUser.first_name,
      telegramUser.last_name  || null,
      telegramUser.photo_url  || null,
    ]
  )
  const user = rows[0]

  if (user.is_new) {
    const who = user.username ? `@${user.username}` : user.first_name
    notifyAdmin(`👤 Новый пользователь: ${who} (ID: ${user.telegram_id})`).catch(() => {})
  }

  return user
}
