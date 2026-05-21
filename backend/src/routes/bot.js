import { Router } from 'express'
import axios from 'axios'
import { config } from '../config/env.js'

const router = Router()

const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)

// POST /api/bot/webhook  — принимает апдейты от Telegram
// Без authMiddleware — Telegram не шлёт initData
router.post('/webhook', async (req, res) => {
  // Сразу отвечаем 200 — Telegram ждёт ответа не дольше 10 сек
  res.sendStatus(200)

  const update = req.body
  const message = update.message
  if (!message) return

  const chatId = message.chat.id
  const text   = message.text || ''

  if (text.startsWith('/start')) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: '👋 Добро пожаловать в MicroCreative!\n\nБиржа творческих микрозаказов — дизайн, тексты, музыка и не только.',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🚀 Открыть приложение',
            web_app: { url: config.frontendUrl },
          },
        ]],
      },
    }).catch(() => {})
    return
  }

  if (text.startsWith('/help')) {
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        '📋 *Команды бота*\n\n' +
        '/start — открыть приложение\n' +
        '/help  — эта справка',
      parse_mode: 'Markdown',
    }).catch(() => {})
  }
})

export default router
