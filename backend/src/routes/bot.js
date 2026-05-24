import { Router } from 'express'
import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'
import { refundEscrow } from '../services/escrow.js'

const router = Router()

// ── Telegram helper ───────────────────────────────────
const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('TG error:', e?.response?.data?.description || e.message))

const isAdmin = (id) =>
  config.adminTelegramId && parseInt(id) === parseInt(config.adminTelegramId)

// ── POST /api/bot/webhook ─────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200)

  const update = req.body

  if (update.callback_query) {
    await handleCallback(update.callback_query).catch(console.error)
    return
  }

  const message = update.message
  if (!message?.text) return

  const chatId = message.chat.id
  const fromId = message.from.id
  const text   = message.text.trim()
  const uname  = message.from.username || 'N/A'

  // /start
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

  // /help
  if (text.startsWith('/help')) {
    const adm = isAdmin(fromId)
    const adminHelp = adm
      ? `\n\n*Команды администратора:*\n` +
        `/admin — меню\n/stats — статистика\n/frozen — эскроу\n` +
        `/withdrawals — последние выводы\n/lonely — заказы без откликов\n` +
        `/categories — по категориям\n/duplicates — подозрительные заказы\n` +
        `/export users — выгрузка пользователей\n/export orders — выгрузка заказов\n` +
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

  // Все команды ниже — только для администратора
  if (!isAdmin(fromId)) return

  if (text === '/admin')        { await sendAdminMenu(chatId);                  return }
  if (text === '/stats')        { await sendStats(chatId);                      return }
  if (text === '/frozen')       { await sendFrozen(chatId);                     return }
  if (text === '/withdrawals')  { await sendWithdrawals(chatId);                return }
  if (text === '/lonely')       { await sendLonely(chatId);                     return }
  if (text === '/categories')   { await sendCategories(chatId);                 return }
  if (text === '/duplicates')   { await sendDuplicates(chatId);                 return }
  if (text === '/complaints')   { await showComplaints(chatId);                 return }

  const exportMatch = text.match(/^\/export\s+(users|orders)$/i)
  if (exportMatch)  { await exportCsv(chatId, exportMatch[1].toLowerCase());   return }

  const banMatch    = text.match(/^\/ban\s+@?(\w+)/i)
  if (banMatch)     { await setBan(chatId, banMatch[1], true);                 return }

  const unbanMatch  = text.match(/^\/unban\s+@?(\w+)/i)
  if (unbanMatch)   { await setBan(chatId, unbanMatch[1], false);              return }

  const verifyMatch = text.match(/^\/verify\s+@?(\w+)/i)
  if (verifyMatch)  { await verifyUser(chatId, verifyMatch[1]);                return }

  const delMatch    = text.match(/^\/deleteorder\s+(\d+)/i)
  if (delMatch)     { await deleteOrder(chatId, parseInt(delMatch[1]));        return }

  const refundMatch = text.match(/^\/refund\s+(\d+)/i)
  if (refundMatch)  { await handleRefund(chatId, parseInt(refundMatch[1]));    return }

  const broadMatch  = text.match(/^\/broadcast\s+([\s\S]+)/i)
  if (broadMatch)   { await doBroadcast(chatId, broadMatch[1].trim());         return }

  const msgMatch    = text.match(/^\/msg\s+@?(\w+)\s+([\s\S]+)/i)
  if (msgMatch)     { await msgUser(chatId, msgMatch[1], msgMatch[2].trim());  return }

  await tg('sendMessage', { chat_id: chatId, text: 'Используй /help для списка команд.' })
})

// ── Расширенное меню администратора ──────────────────
async function sendAdminMenu(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: '🛠 *Панель администратора MicroCreative*',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Статистика',          callback_data: 'admin:stats' },
          { text: '🔒 Эскроу',              callback_data: 'admin:frozen' },
        ],
        [
          { text: '💸 Выводы',              callback_data: 'admin:withdrawals' },
          { text: '🚨 Жалобы',              callback_data: 'admin:complaints' },
        ],
        [
          { text: '😴 Без откликов',         callback_data: 'admin:lonely' },
          { text: '🗂 Категории',            callback_data: 'admin:categories' },
        ],
        [
          { text: '🕵️ Дубликаты',           callback_data: 'admin:duplicates' },
          { text: '📢 Рассылка',             callback_data: 'admin:broadcast_prompt' },
        ],
        [
          { text: '📤 Экспорт users.csv',   callback_data: 'admin:export_users' },
          { text: '📤 Экспорт orders.csv',  callback_data: 'admin:export_orders' },
        ],
      ],
    },
  })
}

// ── /stats ────────────────────────────────────────────
async function sendStats(chatId) {
  const [total, today, deals, commissions, active, top5] = await Promise.all([
    db.query('SELECT COUNT(*) FROM users'),
    db.query(`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM deals WHERE status='completed'`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='commission' AND status='completed'`),
    db.query(`SELECT COUNT(*) FROM deals WHERE status IN ('active','submitted','disputed')`),
    db.query(`SELECT username, first_name, rating, completed_deals FROM users ORDER BY completed_deals DESC, rating DESC LIMIT 3`),
  ])

  const topText = top5.rows.length
    ? top5.rows.map((u, i) =>
        `${i + 1}. ${u.username ? `@${u.username}` : u.first_name} — ⭐${parseFloat(u.rating).toFixed(1)} (${u.completed_deals} сделок)`
      ).join('\n')
    : 'Нет данных'

  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `📊 *Статистика MicroCreative*\n\n` +
      `👥 Пользователей: *${total.rows[0].count}*\n` +
      `🆕 Новых сегодня: *${today.rows[0].count}*\n` +
      `💼 Сумма завершённых сделок: *${parseFloat(deals.rows[0].s).toFixed(2)}*\n` +
      `💰 Комиссий получено: *${parseFloat(commissions.rows[0].s).toFixed(2)}*\n` +
      `🔥 Активных сделок: *${active.rows[0].count}*\n\n` +
      `🏆 *Топ-3 исполнителя:*\n${topText}`,
    parse_mode: 'Markdown',
  })
}

// ── /frozen ───────────────────────────────────────────
async function sendFrozen(chatId) {
  const { rows } = await db.query(`
    SELECT
      COALESCE(SUM(frozen_usdt),  0) AS usdt,
      COALESCE(SUM(frozen_ton),   0) AS ton,
      COALESCE(SUM(frozen_rub),   0) AS rub,
      COALESCE(SUM(frozen_stars), 0) AS stars,
      COUNT(*) FILTER (WHERE frozen_usdt > 0 OR frozen_ton > 0 OR frozen_rub > 0 OR frozen_stars > 0) AS users_with_frozen
    FROM users
  `)
  const r = rows[0]
  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `🔒 *Средства в эскроу*\n\n` +
      `💵 USDT: *${parseFloat(r.usdt).toFixed(2)}*\n` +
      `💎 TON:  *${parseFloat(r.ton).toFixed(4)}*\n` +
      `⭐ Stars: *${parseInt(r.stars)}*\n` +
      `₽ RUB: *${parseFloat(r.rub).toFixed(2)}*\n\n` +
      `👤 Пользователей с заморозкой: *${r.users_with_frozen}*`,
    parse_mode: 'Markdown',
  })
}

// ── /withdrawals ──────────────────────────────────────
async function sendWithdrawals(chatId) {
  const { rows } = await db.query(`
    SELECT wr.id, wr.amount, wr.currency, wr.address, wr.status, wr.created_at,
           u.username, u.first_name
    FROM withdrawal_requests wr
    JOIN users u ON u.id = wr.user_id
    ORDER BY wr.created_at DESC
    LIMIT 10
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '💸 Запросов на вывод нет.' })
    return
  }
  const statusIcon = { pending: '⏳', approved: '✅', rejected: '❌' }
  const lines = rows.map(r => {
    const who  = r.username ? `@${r.username}` : r.first_name
    const addr = r.address.length > 14 ? r.address.slice(0, 6) + '…' + r.address.slice(-4) : r.address
    const dt   = new Date(r.created_at).toLocaleDateString('ru')
    return `${statusIcon[r.status] || '?'} #${r.id} ${who} — ${r.amount} ${r.currency} → \`${addr}\` ${dt}`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `💸 *Последние 10 выводов*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ── /lonely ───────────────────────────────────────────
async function sendLonely(chatId) {
  const { rows } = await db.query(`
    SELECT o.id, o.title, o.category, o.budget, o.currency,
           o.created_at, u.username, u.first_name
    FROM orders o
    JOIN users u ON u.id = o.author_id
    LEFT JOIN order_responses r ON r.order_id = o.id
    WHERE o.status = 'open'
      AND o.created_at < NOW() - INTERVAL '3 days'
    GROUP BY o.id, u.id
    HAVING COUNT(r.id) = 0
    ORDER BY o.created_at ASC
    LIMIT 15
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Заказов без откликов старше 3 дней нет.' })
    return
  }
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    const age = Math.floor((Date.now() - new Date(r.created_at)) / 86400000)
    return `• #${r.id} _${r.title}_ (${r.budget} ${r.currency}) — ${who}, ${age} дн.`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `😴 *Заказы без откликов > 3 дней (${rows.length} шт.)*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ── /categories ───────────────────────────────────────
async function sendCategories(chatId) {
  const { rows } = await db.query(`
    SELECT category,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'open')        AS open,
           COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
           COUNT(*) FILTER (WHERE status = 'completed')   AS completed
    FROM orders
    GROUP BY category
    ORDER BY total DESC
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: 'Заказов нет.' })
    return
  }
  const lines = rows.map(r =>
    `*${r.category}* — всего ${r.total} | 🟢 ${r.open} | ✅ ${r.completed}`
  ).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `🗂 *Статистика по категориям*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ── /duplicates ───────────────────────────────────────
async function sendDuplicates(chatId) {
  // Находим заказы одного автора с похожими заголовками (первые 35 символов совпадают)
  const { rows } = await db.query(`
    SELECT u.username, u.first_name, u.telegram_id,
           COUNT(*) AS cnt,
           MIN(o.created_at) AS first_at,
           array_agg(o.id ORDER BY o.created_at) AS ids,
           array_agg(LEFT(o.title,60) ORDER BY o.created_at) AS titles
    FROM orders o
    JOIN users u ON u.id = o.author_id
    WHERE o.created_at > NOW() - INTERVAL '7 days'
    GROUP BY u.id, u.username, u.first_name, u.telegram_id, LEFT(lower(o.title), 35)
    HAVING COUNT(*) >= 2
    ORDER BY cnt DESC
    LIMIT 10
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Подозрительных дубликатов не найдено.' })
    return
  }
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    return `🕵️ ${who} — ${r.cnt} похожих\n  IDs: ${r.ids.join(', ')}\n  «${r.titles[0]}»`
  }).join('\n\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `🕵️ *Подозрительные дубликаты (7 дней)*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ── /export users|orders ──────────────────────────────
async function exportCsv(chatId, type) {
  let csv, filename

  if (type === 'users') {
    const { rows } = await db.query(`
      SELECT id, telegram_id, username, first_name, last_name,
             rating, completed_deals, is_banned, is_verified,
             balance_usdt, balance_ton, balance_stars,
             created_at
      FROM users ORDER BY id ASC
    `)
    const headers = 'id,telegram_id,username,first_name,last_name,rating,completed_deals,is_banned,is_verified,balance_usdt,balance_ton,balance_stars,created_at'
    const body = rows.map(r =>
      [r.id, r.telegram_id, r.username || '', r.first_name, r.last_name || '',
       r.rating, r.completed_deals, r.is_banned, r.is_verified,
       r.balance_usdt, r.balance_ton, r.balance_stars,
       new Date(r.created_at).toISOString()]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
    ).join('\n')
    csv = headers + '\n' + body
    filename = `users_${Date.now()}.csv`

  } else {
    const { rows } = await db.query(`
      SELECT o.id, o.title, o.category, o.budget, o.currency,
             o.status, o.deadline_days,
             u.username, u.first_name,
             (SELECT COUNT(*) FROM order_responses WHERE order_id = o.id) AS responses,
             o.created_at
      FROM orders o
      JOIN users u ON u.id = o.author_id
      ORDER BY o.id ASC
    `)
    const headers = 'id,title,category,budget,currency,status,deadline_days,author,responses,created_at'
    const body = rows.map(r =>
      [r.id, r.title, r.category, r.budget, r.currency,
       r.status, r.deadline_days,
       r.username || r.first_name, r.responses,
       new Date(r.created_at).toISOString()]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
    ).join('\n')
    csv = headers + '\n' + body
    filename = `orders_${Date.now()}.csv`
  }

  // Отправляем как документ через multipart
  const FormData = (await import('node:buffer')).Blob
    ? (await import('form-data')).default ?? (await import('form-data'))
    : null

  // Используем встроенный FormData (Node 18+)
  const form = new globalThis.FormData()
  form.append('chat_id', String(chatId))
  form.append('caption', `📤 Экспорт ${type} — ${new Date().toLocaleString('ru')}`)
  form.append('document', new Blob([csv], { type: 'text/csv' }), filename)

  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendDocument`,
    form
  ).catch(e => {
    console.error('[Export] sendDocument error:', e?.response?.data || e.message)
    tg('sendMessage', { chat_id: chatId, text: `❌ Ошибка экспорта: ${e.message}` })
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
  await tg('sendMessage', { chat_id: chatId, text: `${action}: @${rows[0].username || rows[0].first_name}` })
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
  await tg('sendMessage', { chat_id: chatId, text: `✅ Верифицирован: @${rows[0].username || rows[0].first_name}` })
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
      text: `✅ Возврат по сделке #${dealId}\nВозвращено: ${result.refundedAmount} ${result.currency}`,
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
    await new Promise(r => setTimeout(r, 50))
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
  const { rows } = await db.query(`
    SELECT c.id, c.text, c.created_at,
           u.username, u.first_name, u.id AS uid, u.telegram_id
    FROM complaints c
    JOIN users u ON u.id = c.user_id
    WHERE c.is_resolved = FALSE
    ORDER BY c.created_at DESC
    LIMIT 10
  `)
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

// ── Одобрение / отклонение вывода ─────────────────────
async function approveWithdrawal(cq, requestId) {
  const chatId = cq.message.chat.id
  const msgId  = cq.message.message_id

  const { rows } = await db.query(
    `SELECT wr.*, u.telegram_id, u.username, u.first_name
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = $1 AND wr.status = 'pending'`,
    [requestId]
  )
  const req = rows[0]
  if (!req) {
    await tg('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Запрос уже обработан или не найден',
      show_alert: true,
    })
    return
  }

  // Помечаем как одобренный
  await db.query(
    `UPDATE withdrawal_requests SET status = 'approved', updated_at = NOW() WHERE id = $1`,
    [requestId]
  )
  await db.query(
    `UPDATE transactions SET status = 'completed'
     WHERE user_id = $1 AND type = 'withdrawal' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [req.user_id]
  )

  // Уведомляем пользователя
  const who = req.username ? `@${req.username}` : req.first_name
  await tg('sendMessage', {
    chat_id: req.telegram_id,
    text: `✅ *Вывод выполнен!*\n\nСумма: *${req.amount} ${req.currency}*\nАдрес: \`${req.address}\``,
    parse_mode: 'Markdown',
  }).catch(() => {})

  // Редактируем сообщение — убираем кнопки
  await tg('editMessageReplyMarkup', {
    chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] },
  }).catch(() => {})
  await tg('sendMessage', {
    chat_id: chatId,
    text: `✅ Вывод #${requestId} одобрен для ${who} (${req.amount} ${req.currency})`,
  })
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Одобрено' })
}

async function rejectWithdrawal(cq, requestId) {
  const chatId = cq.message.chat.id
  const msgId  = cq.message.message_id

  const { rows } = await db.query(
    `SELECT wr.*, u.telegram_id, u.username, u.first_name
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = $1 AND wr.status = 'pending'`,
    [requestId]
  )
  const req = rows[0]
  if (!req) {
    await tg('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Запрос уже обработан или не найден',
      show_alert: true,
    })
    return
  }

  // Возвращаем средства
  const BALANCE_COL = {
    USDT: 'balance_usdt', TON: 'balance_ton', BTC: 'balance_usdt', STARS: 'balance_stars',
  }
  const col = BALANCE_COL[req.currency] || 'balance_usdt'

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE withdrawal_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [requestId]
    )
    await client.query(
      `UPDATE users SET ${col} = ${col} + $1 WHERE id = $2`,
      [req.amount, req.user_id]
    )
    await client.query(
      `UPDATE transactions SET status = 'failed'
       WHERE user_id = $1 AND type = 'withdrawal' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user_id]
    )
  })

  // Уведомляем пользователя
  const who = req.username ? `@${req.username}` : req.first_name
  await tg('sendMessage', {
    chat_id: req.telegram_id,
    text: `❌ *Вывод отклонён*\n\nСумма ${req.amount} ${req.currency} возвращена на баланс.`,
    parse_mode: 'Markdown',
  }).catch(() => {})

  await tg('editMessageReplyMarkup', {
    chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] },
  }).catch(() => {})
  await tg('sendMessage', {
    chat_id: chatId,
    text: `❌ Вывод #${requestId} отклонён для ${who} — средства возвращены.`,
  })
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '❌ Отклонено' })
}

// ── Callback-кнопки ───────────────────────────────────
async function handleCallback(cq) {
  await tg('answerCallbackQuery', { callback_query_id: cq.id })

  const chatId = cq.message.chat.id
  const data   = cq.data

  // Выводы (доступно только администратору)
  if (data.startsWith('wd:')) {
    if (!isAdmin(cq.from.id)) return
    const [, action, idStr] = data.split(':')
    const id = parseInt(idStr)
    if (action === 'approve') await approveWithdrawal(cq, id)
    if (action === 'reject')  await rejectWithdrawal(cq, id)
    return
  }

  if (!isAdmin(cq.from.id)) return

  // Стандартные admin-действия
  if (data === 'admin:stats')            { await sendStats(chatId);        return }
  if (data === 'admin:frozen')           { await sendFrozen(chatId);       return }
  if (data === 'admin:withdrawals')      { await sendWithdrawals(chatId);  return }
  if (data === 'admin:complaints')       { await showComplaints(chatId);   return }
  if (data === 'admin:lonely')           { await sendLonely(chatId);       return }
  if (data === 'admin:categories')       { await sendCategories(chatId);   return }
  if (data === 'admin:duplicates')       { await sendDuplicates(chatId);   return }
  if (data === 'admin:export_users')     { await exportCsv(chatId, 'users');  return }
  if (data === 'admin:export_orders')    { await exportCsv(chatId, 'orders'); return }
  if (data === 'admin:broadcast_prompt') {
    await tg('sendMessage', { chat_id: chatId, text: 'Напишите: /broadcast <текст>' })
    return
  }

  if (data.startsWith('resolve:')) {
    const id = data.split(':')[1]
    await db.query(`UPDATE complaints SET is_resolved = TRUE WHERE id = $1`, [id])
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] },
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
