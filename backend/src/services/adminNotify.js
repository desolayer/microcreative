import axios from 'axios'
import { config } from '../config/env.js'

const tgPost = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(() => {}) // уведомления не должны ломать основной поток

/**
 * Отправляет сообщение администратору в Telegram.
 * Молча игнорируется если ADMIN_TELEGRAM_ID не задан.
 */
export async function notifyAdmin(text, extra = {}) {
  if (!config.adminTelegramId) return
  await tgPost('sendMessage', {
    chat_id: config.adminTelegramId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  })
}
