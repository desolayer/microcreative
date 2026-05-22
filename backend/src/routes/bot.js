import { Router } from 'express'
import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'
import { refundEscrow } from '../services/escrow.js'

const router = Router()

const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('TG error:', e?.response?.data?.description || e.message))

const isAdmin = (id) =>
  config.adminTelegramId && parseInt(id) === parseInt(config.adminTelegramId)

// ── POST /api/bot/webhook ─────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200) // Telegram ждёт ответа < 10 сек — отвечаем сразу

  const update = req.body

  if (update.callback_query) {
    await handleCallback(update.callback_query).catch(console.error)
    return
  }

  const message = update.message
  if (!message?.text) return

  const chatId  = message.chat.id
  const fromId  = message.from.id
  const text    = message.text.trim()
  const uname   = message.from.username || 'N/A'

  // /start — логируем ID и отправляем приветствие
  if (text.startsWith('/start')) {
    console.log(`[BOT] /start  id=${fromId}  @${uname}`)
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        `👋 Добро пожаловать в *MicroCreative*!\n\n` +
        `🆔 Ваш Telegram ID: \`${fromId}\`\n\n` +
        `Биржа творческих микрозаказов — дизайн, тексты, музыка и не только.`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 Открыть приложение', web_app: { url: config.frontendUrl } },
        ]],
      },
    })
    return
  }

  // /help — доступно всем
  if (text.startsWith('/help')) {
    const isAdm = isAdmin(fromId)
    const adminHelp = isAdm
      ? `\n\n*Команды администратора:*\n` +
        `/admin — меню\n/stats — статистика\n` +
        `/ban @user — забанить\n/unban @user — разбанить\n` +
        `/verify @user — верифицировать\n/deleteorder ID — удалить заказ\n` +
        `/refund dealID — возврат денег\n/broadcast текст — рассылка\n` +
        `/msg @user текст — написать пользователю\n/complaints — жалобы`
      : ''
    await tg('sendMessage', {
      chat_id: chatId,
      text: `📋 *Команды бота*\n\n/start — открыть приложение\n/help — справка${adminHelp}`,
      parse_mode: 'Markdown',
    })
    return
  }

  // ── Все команды ниже — только для админа (молчим для остальных) ──
  if (!isAdmin(fromId)) return

  if (text === '/admin')      { await sendAdminMenu(chatId);               return }
  if (text === '/stats')      { await sendStats(chatId);                   return }
  if (text === '/complaints') { await showComplaints(chatId);              return }

  const banMatch = text.match(/^\/ban\s+@?(\w+)/i)
  if (banMatch)   { await setBan(chatId, banMatch[1], true);               return }

  const unbanMatch = text.match(/^\/unban\s+@?(\w+)/i)
  if (unbanMatch) { await setBan(chatId, unbanMatch[1], false);            return }

  const verifyMatch = text.match(/^\/verify\s+@?(\w+)/i)
  if (verifyMatch){ await verifyUser(chatId, verifyMatch[1]);              return }

  const delMatch = text.match(/^\/deleteorder\s+(\d+)/i)
  if (delMatch)   { await deleteOrder(chatId, parseInt(delMatch[1]));      return }

  const refundMatch = text.match(/^\/refund\s+(\d+)/i)
  if (refundMatch){ await handleRefund(chatId, parseInt(refundMatch[1]));  return }

  const broadMatch = text.match(/^\/broadcast\s+([\s\S]+)/i)
  if (broadMatch) { await doBroadcast(chatId, broadMatch[1].trim());       return }

  const msgMatch = text.match(/^\/msg\s+@?(\w+)\s+([\s\S]+)/i)
  if (msgMatch)   { await msgUser(chatId, msgMatch[1], msgMatch[2].trim()); return }

  // Неизвестная команда — подсказка
  await tg('sendMessage', { chat_id: chatId, text: 'Используй /help для списка команд.' })
})

// ── Админ-меню ────────────────────────────────────────
async function sendAdminMenu(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: '🛠 *Панель администратора MicroCreative*',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Статистика',   callback_data: 'admin:stats' },
          { text: '🚨 Жалобы',       callback_data: 'admin:complaints' },
        ],
        [
          { text: '📢 Рассылка',     callback_data: 'admin:broadcast_prompt' },
        ],
      ],
    },
  })
}

// ── Статистика ────────────────────────────────────────
async function sendStats(chatId) {
  const [total, today, deals, commissions, active, top5] = await Promise.all([
    db.query('SELECT COUNT(*) FROM users'),
    db.query(`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COALESCE(SUM(amount), 0) AS s FROM deals WHERE status = 'completed'`),
    db.query(`SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE type = 'commission' AND status = 'completed'`),
    db.query(`SELECT COUNT(*) FROM deals WHERE status = 'active'`),
    db.query(`SELECT username, first_name, rating, completed_deals FROM users ORDER BY rating DESC, completed_deals DESC LIMIT 5`),
  ])

  const top5Text = top5.rows.length
    ? top5.rows.map((u, i) =>
        `${i + 1}. ${u.username ? `@${u.username}` : u.first_name} — ⭐ ${parseFloat(u.rating).toFixed(1)} (${u.completed_deals} сделок)`
      ).join('\n')
    : 'Нет данных'

  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `📊 *Статистика MicroCreative*\n\n` +
      `👥 Пользователей всего: *${total.rows[0].count}*\n` +
      `🆕 Новых за сегодня: *${today.rows[0].count}*\n` +
      `💼 Сумма завершённых сделок: *${parseFloat(deals.rows[0].s).toFixed(2)}*\n` +
      `💰 Комиссий получено: *${parseFloat(commissions.rows[0].s).toFixed(2)}*\n` +
      `🔥 Активных сделок: *${active.rows[0].count}*\n\n` +
      `🏆 *Топ-5 исполнителей:*\n${top5Text}`,
    parse_mode: 'Markdown',
  })
}

// ── Бан / Разбан ──────────────────────────────────────
async function setBan(chatId, username, ban) {
  const { rows } = await db.query(
    `UPDATE users SET is_banned = $1 WHERE LOWER(username) = LOWER($2)
     RETURNING id, first_name, username`,
    [ban, username.replace('@', '')]
  )
  if (!rows[0]) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Пользователь @${username} не найден` })
    return
  }
  const action = ban ? '🚫 Забанен' : '✅ Разбанен'
  await tg('sendMessage', {
    chat_id: chatId,
    text: `${action}: @${rows[0].username || rows[0].first_name}`,
  })
}

// ── Верификация ───────────────────────────────────────
async function verifyUser(chatId, username) {
  const { rows } = await db.query(
    `UPDATE users SET is_verified = TRUE WHERE LOWER(username) = LOWER($1)
     RETURNING id, first_name, username, telegram_id`,
    [username.replace('@', '')]
  )
  if (!rows[0]) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Пользователь @${username} не найден` })
    return
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text: `✅ Верифицирован: @${rows[0].username || rows[0].first_name}`,
  })
  await tg('sendMessage', {
    chat_id: rows[0].telegram_id,
    text: '✅ Ваш профиль верифицирован! На вашей странице появился бейдж ✓',
  }).catch(() => {})
}

// ── Удалить заказ ─────────────────────────────────────
async function deleteOrder(chatId, orderId) {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'cancelled' WHERE id = $1 RETURNING id, title`,
    [orderId]
  )
  if (!rows[0]) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Заказ #${orderId} не найден` })
    return
  }
  await tg('sendMessage', { chat_id: chatId, text: `🗑 Заказ #${orderId} «${rows[0].title}» удалён` })
}

// ── Возврат эскроу ────────────────────────────────────
async function handleRefund(chatId, dealId) {
  try {
    const result = await refundEscrow(dealId)
    await tg('sendMessage', {
      chat_id: chatId,
      text: `✅ Возврат выполнен по сделке #${dealId}\nВозвращено: ${result.refundedAmount} ${result.currency}`,
    })
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Ошибка: ${e.message}` })
  }
}

// ── Рассылка ──────────────────────────────────────────
async function doBroadcast(chatId, text) {
  const { rows } = await db.query(`SELECT telegram_id FROM users WHERE is_banned = FALSE`)
  await tg('sendMessage', { chat_id: chatId, text: `📢 Рассылка на ${rows.length} пользователей...` })

  let sent = 0, failed = 0
  for (const user of rows) {
    try {
      await tg('sendMessage', { chat_id: user.telegram_id, text })
      sent++
    } catch { failed++ }
    await new Promise(r => setTimeout(r, 50)) // ~20 msg/s — не превышаем лимит
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text: `📢 Готово\n✅ Доставлено: ${sent}\n❌ Не доставлено: ${failed}`,
  })
}

// ── Написать пользователю ─────────────────────────────
async function msgUser(chatId, username, text) {
  const { rows } = await db.query(
    `SELECT telegram_id, first_name FROM users WHERE LOWER(username) = LOWER($1)`,
    [username.replace('@', '')]
  )
  if (!rows[0]) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Пользователь @${username} не найден` })
    return
  }
  await tg('sendMessage', { chat_id: rows[0].telegram_id, text }).catch(() => {})
  await tg('sendMessage', { chat_id: chatId, text: `✅ Сообщение доставлено @${username}` })
}

// ── Жалобы ────────────────────────────────────────────
async function showComplaints(chatId) {
  const { rows } = await db.query(
    `SELECT c.id, c.text, c.created_at,
            u.username, u.first_name, u.id AS uid, u.telegram_id
     FROM complaints c
     JOIN users u ON u.id = c.user_id
     WHERE c.is_resolved = FALSE
     ORDER BY c.created_at DESC
     LIMIT 10`
  )
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Активных жалоб нет' })
    return
  }
  for (const c of rows) {
    const who = c.username ? `@${c.username}` : c.first_name
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        `🚨 *Жалоба #${c.id}* от ${who} (ID: ${c.uid})\n\n${c.text}\n\n` +
        `_${new Date(c.created_at).toLocaleString('ru')}_`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '💬 Ответить', callback_data: `reply:${c.uid}:${c.username || ''}` },
          { text: '✅ Закрыть',  callback_data: `resolve:${c.id}` },
        ]],
      },
    })
  }
}

// ── Callback-кнопки ───────────────────────────────────
async function handleCallback(cq) {
  await tg('answerCallbackQuery', { callback_query_id: cq.id })
  if (!isAdmin(cq.from.id)) return

  const chatId = cq.message.chat.id
  const data   = cq.data

  if (data === 'admin:stats')            { await sendStats(chatId);     return }
  if (data === 'admin:complaints')       { await showComplaints(chatId); return }
  if (data === 'admin:broadcast_prompt') {
    await tg('sendMessage', { chat_id: chatId, text: 'Напишите: /broadcast <текст рассылки>' })
    return
  }

  if (data.startsWith('resolve:')) {
    const id = data.split(':')[1]
    await db.query(`UPDATE complaints SET is_resolved = TRUE WHERE id = $1`, [id])
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {})
    await tg('sendMessage', { chat_id: chatId, text: `✅ Жалоба #${id} закрыта` })
    return
  }

  if (data.startsWith('reply:')) {
    const [, userId, username] = data.split(':')
    const mention = username ? `@${username}` : `пользователю ID ${userId}`
    await tg('sendMessage', {
      chat_id: chatId,
      text: `💬 Чтобы ответить ${mention}, напишите:\n\n/msg ${mention} <текст ответа>`,
    })
  }
}

export default router
