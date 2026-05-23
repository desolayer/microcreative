/**
 * Отправляет уведомление конкретному пользователю через Telegram бота.
 * telegramId — числовой Telegram ID пользователя.
 */
import axios from 'axios'
import { config } from '../config/env.js'

const tgPost = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error(`TG notify error [${method}]:`, e?.response?.data?.description || e.message))

export async function notifyUser(telegramId, text, extra = {}) {
  if (!telegramId) return
  return tgPost('sendMessage', {
    chat_id: telegramId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  })
}
