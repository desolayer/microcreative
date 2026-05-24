/**
 * Уведомления пользователей через Telegram-бота.
 */
import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'

const tgPost = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error(`TG notify error [${method}]:`, e?.response?.data?.description || e.message))

/**
 * Отправляет сообщение по Telegram ID (числовой ID пользователя).
 * Используется когда telegram_id уже известен.
 */
export async function notifyUser(telegramId, text, extra = {}) {
  if (!telegramId) return
  return tgPost('sendMessage', {
    chat_id: telegramId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  })
}

// Тип уведомления → колонка настройки в users
const NOTIF_COL = {
  new_response:  'notif_responses',
  message:       'notif_messages',
  balance:       'notif_balance',
  deal_complete: 'notif_deals',
  payment:       'notif_balance',
}

/**
 * Отправляет уведомление пользователю по его internal ID,
 * с учётом его настроек уведомлений.
 *
 * @param {number} userId     - users.id
 * @param {string} text       - текст сообщения
 * @param {string|null} notifType - тип: 'new_response' | 'message' | 'balance' | 'deal_complete' | null
 *                                  null = всегда отправлять (системные сообщения)
 * @param {object} extra      - доп. параметры sendMessage (reply_markup и т.д.)
 */
export async function notifyUserById(userId, text, notifType = null, extra = {}) {
  try {
    const col = notifType ? NOTIF_COL[notifType] : null

    let q = `SELECT telegram_id`
    if (col) q += `, ${col} AS pref_enabled`
    q += ` FROM users WHERE id = $1`

    const { rows } = await db.query(q, [userId])
    const user = rows[0]
    if (!user?.telegram_id) return

    // Если тип указан и пользователь отключил его — пропускаем
    if (col && user.pref_enabled === false) return

    return notifyUser(user.telegram_id, text, extra)
  } catch (err) {
    console.error('[notifyUserById] error:', err.message)
  }
}
