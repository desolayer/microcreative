import crypto from 'crypto'
import { config } from '../config/env.js'
import { db } from '../config/database.js'

/**
 * Проверяет подпись Telegram initData.
 * Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateTelegramInitData(initData) {
  if (!initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  // Собираем строку для проверки — все поля кроме hash, отсортированные по ключу
  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // Секретный ключ = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegramBotToken)
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return null

  // Проверяем, что данные не старше 24 часов
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

/**
 * Express middleware — авторизует запрос через Telegram initData.
 * Устанавливает req.user с данными из БД (создаёт если нет).
 */
export async function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data']

  // В dev-режиме позволяем тестировать без initData
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
    req.user = await getOrCreateUser(telegramUser)
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
     RETURNING *`,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name,
      telegramUser.last_name || null,
      telegramUser.photo_url || null,
    ]
  )
  return rows[0]
}
