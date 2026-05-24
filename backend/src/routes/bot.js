import { Router } from 'express'
import axios from 'axios'
import { config } from '../config/env.js'
import { db } from '../config/database.js'
import { refundEscrow } from '../services/escrow.js'
import { getActiveConnectionsCount } from '../services/websocket.js'

const router = Router()

// ── Telegram helper ───────────────────────────────────
const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('TG error:', e?.response?.data?.description || e.message))

const isAdmin = (id) =>
  config.adminTelegramId && parseInt(id) === parseInt(config.adminTelegramId)

// ── Лог действий администратора ──────────────────────
function adminLog(adminId, action, type = 'info', data = {}) {
  db.query(
    `INSERT INTO admin_logs (admin_id, action, type, data) VALUES ($1, $2, $3, $4)`,
    [adminId, action, type, JSON.stringify(data)]
  ).catch(() => {})
}

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
    console.log(`[BOT] /start id=${fromId} @${uname}`)
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        `👋 Добро пожаловать в *MicroCreative*!\n\n` +
        `🆔 Ваш Telegram ID: \`${fromId}\`\n\n` +
        `Биржа творческих микрозаказов — дизайн, тексты, музыка и не только.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '🚀 Открыть приложение', web_app: { url: config.frontendUrl } },
      ]] },
    })
    return
  }

  // /help
  if (text.startsWith('/help')) {
    const adm = isAdmin(fromId)
    const adminHelp = adm
      ? `\n\n*Команды администратора:*\n` +
        `/admin — меню\n/stats — статистика\n/frozen — эскроу\n` +
        `/health — статус сервисов\n/errors — последние ошибки\n` +
        `/version — версия деплоя\n/restart — перезапуск\n` +
        `/balance — баланс CryptoBot\n/pending — ожидают вывода\n` +
        `/sessions — WS-соединения\n/blocked — забаненные\n` +
        `/adminlog — лог действий\n` +
        `/revenue today|week|month — выручка\n` +
        `/maintenance on|off — режим обслуживания\n` +
        `/withdrawals — последние выводы\n/lonely — заказы без откликов\n` +
        `/categories — по категориям\n/duplicates — дубликаты\n` +
        `/export users|orders — выгрузка CSV\n` +
        `/ban @user — забанить\n/unban @user — разбанить\n` +
        `/verify @user — верифицировать\n/deleteorder ID — удалить заказ\n` +
        `/refund dealID — возврат\n/broadcast текст — рассылка\n` +
        `/msg @user текст — написать`
      : ''
    await tg('sendMessage', {
      chat_id: chatId,
      text: `📋 *Команды бота*\n\n/start — открыть приложение\n/help — справка${adminHelp}`,
      parse_mode: 'Markdown',
    })
    return
  }

  // Все команды ниже — только администратор
  if (!isAdmin(fromId)) return
  adminLog(fromId, `cmd: ${text.split(' ')[0]}`)

  if (text === '/admin')        { await sendAdminMenu(chatId);                      return }
  if (text === '/stats')        { await sendStats(chatId);                          return }
  if (text === '/frozen')       { await sendFrozen(chatId);                         return }
  if (text === '/health')       { await sendHealth(chatId);                         return }
  if (text === '/errors')       { await sendErrors(chatId);                         return }
  if (text === '/version')      { await sendVersion(chatId);                        return }
  if (text === '/restart')      { await doRestart(chatId, fromId);                  return }
  if (text === '/balance')      { await sendBotBalance(chatId);                     return }
  if (text === '/pending')      { await sendPending(chatId);                        return }
  if (text === '/sessions')     { await sendSessions(chatId);                       return }
  if (text === '/blocked')      { await sendBlocked(chatId);                        return }
  if (text === '/adminlog')     { await sendAdminLog(chatId);                       return }
  if (text === '/withdrawals')  { await sendWithdrawals(chatId);                    return }
  if (text === '/lonely')       { await sendLonely(chatId);                         return }
  if (text === '/categories')   { await sendCategories(chatId);                     return }
  if (text === '/duplicates')   { await sendDuplicates(chatId);                     return }
  if (text === '/complaints')   { await showComplaints(chatId);                     return }

  const revMatch = text.match(/^\/revenue\s+(today|week|month)$/i)
  if (revMatch)     { await sendRevenue(chatId, revMatch[1].toLowerCase());         return }

  const maintMatch = text.match(/^\/maintenance\s+(on|off)$/i)
  if (maintMatch)   { await setMaintenance(chatId, fromId, maintMatch[1] === 'on'); return }

  const exportMatch = text.match(/^\/export\s+(users|orders)$/i)
  if (exportMatch)  { await exportCsv(chatId, exportMatch[1].toLowerCase());        return }

  const banMatch    = text.match(/^\/ban\s+@?(\w+)/i)
  if (banMatch)     { await setBan(chatId, fromId, banMatch[1], true);              return }

  const unbanMatch  = text.match(/^\/unban\s+@?(\w+)/i)
  if (unbanMatch)   { await setBan(chatId, fromId, unbanMatch[1], false);           return }

  const verifyMatch = text.match(/^\/verify\s+@?(\w+)/i)
  if (verifyMatch)  { await verifyUser(chatId, verifyMatch[1]);                     return }

  const delMatch    = text.match(/^\/deleteorder\s+(\d+)/i)
  if (delMatch)     { await deleteOrder(chatId, parseInt(delMatch[1]));             return }

  const refundMatch = text.match(/^\/refund\s+(\d+)/i)
  if (refundMatch)  { await handleRefund(chatId, parseInt(refundMatch[1]));         return }

  const broadMatch  = text.match(/^\/broadcast\s+([\s\S]+)/i)
  if (broadMatch)   { await doBroadcast(chatId, broadMatch[1].trim());             return }

  const msgMatch    = text.match(/^\/msg\s+@?(\w+)\s+([\s\S]+)/i)
  if (msgMatch)     { await msgUser(chatId, msgMatch[1], msgMatch[2].trim());       return }

  await tg('sendMessage', { chat_id: chatId, text: 'Используй /help для списка команд.' })
})

// ════════════════════════════════════════════════════
//  МЕНЮ АДМИНИСТРАТОРА
// ════════════════════════════════════════════════════
async function sendAdminMenu(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: '🛠 *Панель администратора MicroCreative*',
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [
        { text: '📊 Статистика',          callback_data: 'admin:stats' },
        { text: '❄️ Заморожено',           callback_data: 'admin:frozen' },
      ],
      [
        { text: '💸 Выводы',              callback_data: 'admin:withdrawals' },
        { text: '😴 Без откликов',         callback_data: 'admin:lonely' },
      ],
      [
        { text: '📂 Категории',            callback_data: 'admin:categories' },
        { text: '🔍 Дубликаты',            callback_data: 'admin:duplicates' },
      ],
      [
        { text: '👥 Пользователи',         callback_data: 'admin:recent_users' },
        { text: '📋 Заказы',              callback_data: 'admin:recent_orders' },
      ],
      [
        { text: '📤 Экспорт users',        callback_data: 'admin:export_users' },
        { text: '📤 Экспорт orders',       callback_data: 'admin:export_orders' },
      ],
      [
        { text: '🚫 Заблокировать',        callback_data: 'admin:ban_help' },
        { text: '✅ Разблокировать',       callback_data: 'admin:unban_help' },
      ],
      [
        { text: '📢 Рассылка',             callback_data: 'admin:broadcast_prompt' },
        { text: '🆘 Жалобы',              callback_data: 'admin:complaints' },
      ],
      [
        { text: '🏥 Health',              callback_data: 'admin:health' },
        { text: '⚠️ Ошибки',              callback_data: 'admin:errors' },
      ],
      [
        { text: '🔧 Версия',              callback_data: 'admin:version' },
        { text: '🔄 Рестарт',             callback_data: 'admin:restart' },
      ],
      [
        { text: '💰 Баланс бота',          callback_data: 'admin:balance' },
        { text: '⏳ Ожидают вывода',       callback_data: 'admin:pending' },
      ],
      [
        { text: '📜 Правила',             callback_data: 'admin:rules' },
        { text: '🔒 Заблокированные',      callback_data: 'admin:blocked' },
      ],
      [
        { text: '📝 Лог действий',         callback_data: 'admin:adminlog' },
        { text: '🔌 Сессии',              callback_data: 'admin:sessions' },
      ],
      [
        { text: '📈 Выручка сегодня',      callback_data: 'admin:revenue_today' },
        { text: '📈 За неделю',            callback_data: 'admin:revenue_week' },
      ],
    ]},
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — СТАТИСТИКА
// ════════════════════════════════════════════════════
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
      `💰 Комиссий всего: *${parseFloat(commissions.rows[0].s).toFixed(2)}*\n` +
      `🔥 Активных сделок: *${active.rows[0].count}*\n\n` +
      `🏆 *Топ-3 исполнителя:*\n${topText}`,
    parse_mode: 'Markdown',
  })
}

async function sendFrozen(chatId) {
  const { rows } = await db.query(`
    SELECT COALESCE(SUM(frozen_usdt),0)  AS usdt,
           COALESCE(SUM(frozen_ton),0)   AS ton,
           COALESCE(SUM(frozen_rub),0)   AS rub,
           COALESCE(SUM(frozen_stars),0) AS stars,
           COUNT(*) FILTER (WHERE frozen_usdt>0 OR frozen_ton>0 OR frozen_rub>0 OR frozen_stars>0) AS users_cnt
    FROM users
  `)
  const r = rows[0]
  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `❄️ *Средства в эскроу*\n\n` +
      `💵 USDT: *${parseFloat(r.usdt).toFixed(2)}*\n` +
      `💎 TON:  *${parseFloat(r.ton).toFixed(4)}*\n` +
      `⭐ Stars: *${parseInt(r.stars)}*\n` +
      `₽ RUB: *${parseFloat(r.rub).toFixed(2)}*\n\n` +
      `👤 Пользователей с заморозкой: *${r.users_cnt}*`,
    parse_mode: 'Markdown',
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — HEALTH / СИСТЕМА
// ════════════════════════════════════════════════════
async function sendHealth(chatId) {
  // PostgreSQL
  let dbStatus = '✅ OK'
  try { await db.query('SELECT 1') }
  catch (e) { dbStatus = `❌ ${e.message.substring(0, 60)}` }

  // CryptoBot API
  let cbStatus = '✅ OK'
  try {
    const { data } = await axios.get(`${config.cryptobot.apiUrl}/getMe`, {
      headers: { 'Crypto-Pay-API-Token': config.cryptobot.apiToken },
      timeout: 5000,
    })
    if (!data.ok) cbStatus = `⚠️ ${JSON.stringify(data.error || 'unknown')}`
  } catch (e) { cbStatus = `❌ ${e.message.substring(0, 60)}` }

  const uptimeSec = Math.floor(process.uptime())
  const h = Math.floor(uptimeSec / 3600)
  const m = Math.floor((uptimeSec % 3600) / 60)
  const s = uptimeSec % 60

  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `🏥 *Health Check*\n\n` +
      `🗄 PostgreSQL: ${dbStatus}\n` +
      `🤖 CryptoBot API: ${cbStatus}\n\n` +
      `⏱ Uptime: *${h}h ${m}m ${s}s*\n` +
      `🔌 WS-соединений: *${getActiveConnectionsCount()}*\n` +
      `💾 Memory RSS: *${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB*`,
    parse_mode: 'Markdown',
  })
}

async function sendErrors(chatId) {
  const { rows } = await db.query(`
    SELECT message, path, method, created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }))

  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Ошибок не зафиксировано.' })
    return
  }
  const lines = rows.map((r, i) => {
    const dt = new Date(r.created_at).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    return `${i + 1}. [${r.method} ${r.path}] ${r.message?.substring(0, 80)} — ${dt}`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `⚠️ *Последние 10 ошибок*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

async function sendVersion(chatId) {
  const sha    = process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown'
  const branch = process.env.RAILWAY_GIT_BRANCH     || 'unknown'
  const deplId = process.env.RAILWAY_DEPLOYMENT_ID  || 'unknown'
  const env    = config.nodeEnv

  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `🔧 *Версия деплоя*\n\n` +
      `📌 Commit: \`${sha.slice(0, 12)}\`\n` +
      `🌿 Branch: \`${branch}\`\n` +
      `🆔 Deploy ID: \`${deplId.slice(0, 16)}\`\n` +
      `🌐 Environment: \`${env}\``,
    parse_mode: 'Markdown',
  })
}

async function doRestart(chatId, adminId) {
  adminLog(adminId, 'restart', 'warning')
  await tg('sendMessage', { chat_id: chatId, text: '🔄 Перезапускаю процесс... Railway поднимет новый.' })
  setTimeout(() => process.exit(0), 1500)
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — ФИНАНСЫ
// ════════════════════════════════════════════════════
async function sendBotBalance(chatId) {
  try {
    const { data } = await axios.get(`${config.cryptobot.apiUrl}/getBalance`, {
      headers: { 'Crypto-Pay-API-Token': config.cryptobot.apiToken },
      timeout: 8000,
    })
    if (!data.ok) {
      await tg('sendMessage', { chat_id: chatId, text: `❌ CryptoBot error: ${JSON.stringify(data.error)}` })
      return
    }
    const lines = data.result
      .filter(b => parseFloat(b.available) > 0 || parseFloat(b.onhold || 0) > 0)
      .map(b => `• *${b.currency_code}*: ${parseFloat(b.available).toFixed(4)} (в холде: ${parseFloat(b.onhold || 0).toFixed(4)})`)
      .join('\n')
    await tg('sendMessage', {
      chat_id: chatId,
      text: `💰 *Баланс CryptoBot*\n\n${lines || 'Пусто'}`,
      parse_mode: 'Markdown',
    })
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Ошибка: ${e.message}` })
  }
}

async function sendRevenue(chatId, period) {
  const intervals = { today: '1 day', week: '7 days', month: '30 days' }
  const label     = { today: 'сегодня', week: 'за 7 дней', month: 'за 30 дней' }
  const interval  = intervals[period] || '7 days'

  const [commissions, deals] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(amount),0) AS s, currency FROM transactions
              WHERE type='commission' AND status='completed' AND created_at > NOW()-INTERVAL '${interval}'
              GROUP BY currency`),
    db.query(`SELECT COUNT(*) FROM deals WHERE status='completed' AND completed_at > NOW()-INTERVAL '${interval}'`),
  ])

  const revLines = commissions.rows.length
    ? commissions.rows.map(r => `• *${r.currency}*: ${parseFloat(r.s).toFixed(4)}`).join('\n')
    : 'Нет данных'

  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `📈 *Выручка ${label[period]}*\n\n` +
      `${revLines}\n\n` +
      `✅ Завершённых сделок: *${deals.rows[0].count}*`,
    parse_mode: 'Markdown',
  })
}

async function sendPending(chatId) {
  const { rows } = await db.query(`
    SELECT wr.id, wr.amount, wr.currency, wr.address, wr.created_at,
           u.username, u.first_name
    FROM withdrawal_requests wr
    JOIN users u ON u.id = wr.user_id
    WHERE wr.status = 'pending'
    ORDER BY wr.created_at ASC
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Нет ожидающих запросов на вывод.' })
    return
  }
  const lines = rows.map(r => {
    const who  = r.username ? `@${r.username}` : r.first_name
    const addr = r.address.length > 14 ? r.address.slice(0, 6) + '…' + r.address.slice(-4) : r.address
    const dt   = new Date(r.created_at).toLocaleDateString('ru')
    return `⏳ #${r.id} ${who} — ${r.amount} ${r.currency} → \`${addr}\` (${dt})`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `⏳ *Ожидают вывода (${rows.length} шт.)*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — ПОЛЬЗОВАТЕЛИ / СЕССИИ
// ════════════════════════════════════════════════════
async function sendSessions(chatId) {
  const count = getActiveConnectionsCount()
  const { rows } = await db.query(`SELECT COUNT(*) FROM users`)
  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `🔌 *WebSocket-сессии*\n\n` +
      `Активных соединений: *${count}*\n` +
      `Всего пользователей: *${rows[0].count}*`,
    parse_mode: 'Markdown',
  })
}

async function sendBlocked(chatId) {
  const { rows } = await db.query(`
    SELECT username, first_name, telegram_id, updated_at
    FROM users WHERE is_banned = TRUE
    ORDER BY updated_at DESC
    LIMIT 20
  `)
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '✅ Заблокированных пользователей нет.' })
    return
  }
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    return `🔒 ${who} (ID: ${r.telegram_id})`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `🔒 *Заблокированные (${rows.length})*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

async function sendAdminLog(chatId) {
  const { rows } = await db.query(`
    SELECT admin_id, action, type, created_at
    FROM admin_logs
    ORDER BY created_at DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }))

  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: '📝 Лог действий пуст.' })
    return
  }
  const icon = { info: 'ℹ️', warning: '⚠️', error: '❌' }
  const lines = rows.map(r => {
    const dt = new Date(r.created_at).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    return `${icon[r.type] || 'ℹ️'} ${r.action} — ${dt}`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `📝 *Лог действий администратора*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

async function sendRecentUsers(chatId) {
  const { rows } = await db.query(`
    SELECT id, username, first_name, completed_deals, is_banned, is_verified, created_at
    FROM users ORDER BY created_at DESC LIMIT 8
  `)
  const lines = rows.map(r => {
    const who   = r.username ? `@${r.username}` : r.first_name
    const flags = [r.is_banned ? '🚫' : '', r.is_verified ? '✓' : ''].filter(Boolean).join('')
    const dt    = new Date(r.created_at).toLocaleDateString('ru')
    return `• ${who} ${flags} | сделок: ${r.completed_deals} | ${dt}`
  }).join('\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `👥 *Последние 8 пользователей*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

async function sendRecentOrders(chatId) {
  const { rows } = await db.query(`
    SELECT o.id, o.title, o.budget, o.currency, o.status,
           u.username, u.first_name,
           (SELECT COUNT(*) FROM order_responses WHERE order_id=o.id) AS resp
    FROM orders o JOIN users u ON u.id=o.author_id
    ORDER BY o.created_at DESC LIMIT 8
  `)
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    return `• #${r.id} _${r.title.substring(0,40)}_\n  ${r.budget} ${r.currency} | ${r.status} | ${who} | 💬 ${r.resp}`
  }).join('\n\n')
  await tg('sendMessage', {
    chat_id: chatId,
    text: `📋 *Последние 8 заказов*\n\n${lines}`,
    parse_mode: 'Markdown',
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — РЕЖИМ ОБСЛУЖИВАНИЯ
// ════════════════════════════════════════════════════
async function setMaintenance(chatId, adminId, enabled) {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('maintenance_mode', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [enabled ? 'true' : 'false']
  )
  adminLog(adminId, `maintenance ${enabled ? 'ON' : 'OFF'}`, 'warning')
  await tg('sendMessage', {
    chat_id: chatId,
    text: enabled
      ? '🔧 *Режим обслуживания включён*\nФронтенд показывает заглушку.'
      : '✅ *Режим обслуживания выключен*\nПриложение доступно.',
    parse_mode: 'Markdown',
  })
}

async function sendRules(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text:
      `📜 *Правила MicroCreative*\n\n` +
      `1. Запрещён спам и дублирование заказов.\n` +
      `2. Запрещено мошенничество и уклонение от эскроу.\n` +
      `3. Контент должен соответствовать законодательству.\n` +
      `4. Споры решаются через механизм dispute.\n\n` +
      `_Для редактирования правил обратитесь к разработчику._`,
    parse_mode: 'Markdown',
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — АНАЛИТИКА / ЗАКАЗЫ
// ════════════════════════════════════════════════════
async function sendWithdrawals(chatId) {
  const { rows } = await db.query(`
    SELECT wr.id, wr.amount, wr.currency, wr.address, wr.status, wr.created_at,
           u.username, u.first_name
    FROM withdrawal_requests wr
    JOIN users u ON u.id = wr.user_id
    ORDER BY wr.created_at DESC LIMIT 10
  `)
  if (!rows.length) { await tg('sendMessage', { chat_id: chatId, text: '💸 Запросов на вывод нет.' }); return }
  const icon = { pending: '⏳', approved: '✅', rejected: '❌' }
  const lines = rows.map(r => {
    const who  = r.username ? `@${r.username}` : r.first_name
    const addr = r.address.length > 14 ? r.address.slice(0,6) + '…' + r.address.slice(-4) : r.address
    return `${icon[r.status] || '?'} #${r.id} ${who} — ${r.amount} ${r.currency} → \`${addr}\``
  }).join('\n')
  await tg('sendMessage', { chat_id: chatId, text: `💸 *Последние 10 выводов*\n\n${lines}`, parse_mode: 'Markdown' })
}

async function sendLonely(chatId) {
  const { rows } = await db.query(`
    SELECT o.id, o.title, o.budget, o.currency, o.created_at, u.username, u.first_name
    FROM orders o JOIN users u ON u.id=o.author_id
    LEFT JOIN order_responses r ON r.order_id=o.id
    WHERE o.status='open' AND o.created_at < NOW()-INTERVAL '3 days'
    GROUP BY o.id, u.id HAVING COUNT(r.id)=0
    ORDER BY o.created_at ASC LIMIT 15
  `)
  if (!rows.length) { await tg('sendMessage', { chat_id: chatId, text: '✅ Заказов без откликов старше 3 дней нет.' }); return }
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    const age = Math.floor((Date.now() - new Date(r.created_at)) / 86400000)
    return `• #${r.id} _${r.title}_ (${r.budget} ${r.currency}) — ${who}, ${age} дн.`
  }).join('\n')
  await tg('sendMessage', { chat_id: chatId, text: `😴 *Без откликов > 3 дней (${rows.length} шт.)*\n\n${lines}`, parse_mode: 'Markdown' })
}

async function sendCategories(chatId) {
  const { rows } = await db.query(`
    SELECT category, COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='open') AS open,
           COUNT(*) FILTER (WHERE status='completed') AS done
    FROM orders GROUP BY category ORDER BY total DESC
  `)
  if (!rows.length) { await tg('sendMessage', { chat_id: chatId, text: 'Заказов нет.' }); return }
  const lines = rows.map(r => `*${r.category}* — всего ${r.total} | 🟢 ${r.open} | ✅ ${r.done}`).join('\n')
  await tg('sendMessage', { chat_id: chatId, text: `📂 *Статистика по категориям*\n\n${lines}`, parse_mode: 'Markdown' })
}

async function sendDuplicates(chatId) {
  const { rows } = await db.query(`
    SELECT u.username, u.first_name, u.telegram_id,
           COUNT(*) AS cnt,
           array_agg(o.id ORDER BY o.created_at) AS ids,
           array_agg(LEFT(o.title,60) ORDER BY o.created_at) AS titles
    FROM orders o JOIN users u ON u.id=o.author_id
    WHERE o.created_at > NOW()-INTERVAL '7 days'
    GROUP BY u.id, u.username, u.first_name, u.telegram_id, LEFT(lower(o.title),35)
    HAVING COUNT(*)>=2 ORDER BY cnt DESC LIMIT 10
  `)
  if (!rows.length) { await tg('sendMessage', { chat_id: chatId, text: '✅ Подозрительных дубликатов нет.' }); return }
  const lines = rows.map(r => {
    const who = r.username ? `@${r.username}` : r.first_name
    return `🔍 ${who} — ${r.cnt} похожих\n  IDs: ${r.ids.join(', ')}\n  «${r.titles[0]}»`
  }).join('\n\n')
  await tg('sendMessage', { chat_id: chatId, text: `🔍 *Дубликаты (7 дней)*\n\n${lines}`, parse_mode: 'Markdown' })
}

// ════════════════════════════════════════════════════
//  ЭКСПОРТ CSV
// ════════════════════════════════════════════════════
async function exportCsv(chatId, type) {
  let csv, filename
  if (type === 'users') {
    const { rows } = await db.query(`
      SELECT id, telegram_id, username, first_name, last_name,
             rating, completed_deals, is_banned, is_verified,
             balance_usdt, balance_ton, balance_stars, created_at
      FROM users ORDER BY id ASC
    `)
    const h = 'id,telegram_id,username,first_name,last_name,rating,completed_deals,is_banned,is_verified,balance_usdt,balance_ton,balance_stars,created_at'
    csv = h + '\n' + rows.map(r =>
      [r.id,r.telegram_id,r.username||'',r.first_name,r.last_name||'',r.rating,r.completed_deals,r.is_banned,r.is_verified,r.balance_usdt,r.balance_ton,r.balance_stars,new Date(r.created_at).toISOString()]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
    ).join('\n')
    filename = `users_${Date.now()}.csv`
  } else {
    const { rows } = await db.query(`
      SELECT o.id, o.title, o.category, o.budget, o.currency, o.status, o.deadline_days,
             u.username, u.first_name,
             (SELECT COUNT(*) FROM order_responses WHERE order_id=o.id) AS responses,
             o.created_at
      FROM orders o JOIN users u ON u.id=o.author_id ORDER BY o.id ASC
    `)
    const h = 'id,title,category,budget,currency,status,deadline_days,author,responses,created_at'
    csv = h + '\n' + rows.map(r =>
      [r.id,r.title,r.category,r.budget,r.currency,r.status,r.deadline_days,r.username||r.first_name,r.responses,new Date(r.created_at).toISOString()]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
    ).join('\n')
    filename = `orders_${Date.now()}.csv`
  }

  const form = new globalThis.FormData()
  form.append('chat_id', String(chatId))
  form.append('caption', `📤 Экспорт ${type} — ${new Date().toLocaleString('ru')}`)
  form.append('document', new Blob([csv], { type: 'text/csv' }), filename)
  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendDocument`, form
  ).catch(e => {
    console.error('[Export] error:', e?.response?.data || e.message)
    tg('sendMessage', { chat_id: chatId, text: `❌ Ошибка экспорта: ${e.message}` })
  })
}

// ════════════════════════════════════════════════════
//  КОМАНДЫ — МОДЕРАЦИЯ
// ════════════════════════════════════════════════════
async function setBan(chatId, adminId, username, ban) {
  const { rows } = await db.query(
    `UPDATE users SET is_banned=$1 WHERE LOWER(username)=LOWER($2) RETURNING id, first_name, username`,
    [ban, username.replace('@','')]
  )
  if (!rows[0]) { await tg('sendMessage', { chat_id: chatId, text: `❌ @${username} не найден` }); return }
  adminLog(adminId, `${ban ? 'ban' : 'unban'} @${rows[0].username}`, 'warning', { userId: rows[0].id })
  await tg('sendMessage', { chat_id: chatId, text: `${ban ? '🚫 Забанен' : '✅ Разбанен'}: @${rows[0].username || rows[0].first_name}` })
}

async function verifyUser(chatId, username) {
  const { rows } = await db.query(
    `UPDATE users SET is_verified=TRUE WHERE LOWER(username)=LOWER($1) RETURNING id, first_name, username, telegram_id`,
    [username.replace('@','')]
  )
  if (!rows[0]) { await tg('sendMessage', { chat_id: chatId, text: `❌ @${username} не найден` }); return }
  await tg('sendMessage', { chat_id: chatId, text: `✅ Верифицирован: @${rows[0].username || rows[0].first_name}` })
  await tg('sendMessage', { chat_id: rows[0].telegram_id, text: '✅ Ваш профиль верифицирован! Бейдж ✓ появился на вашей странице.' }).catch(() => {})
}

async function deleteOrder(chatId, orderId) {
  const { rows } = await db.query(`UPDATE orders SET status='cancelled' WHERE id=$1 RETURNING id, title`, [orderId])
  if (!rows[0]) { await tg('sendMessage', { chat_id: chatId, text: `❌ Заказ #${orderId} не найден` }); return }
  await tg('sendMessage', { chat_id: chatId, text: `🗑 Заказ #${orderId} «${rows[0].title}» удалён` })
}

async function handleRefund(chatId, dealId) {
  try {
    const result = await refundEscrow(dealId)
    await tg('sendMessage', { chat_id: chatId, text: `✅ Возврат по сделке #${dealId}\nВозвращено: ${result.refundedAmount} ${result.currency}` })
  } catch (e) {
    await tg('sendMessage', { chat_id: chatId, text: `❌ Ошибка: ${e.message}` })
  }
}

async function doBroadcast(chatId, text) {
  const { rows } = await db.query(`SELECT telegram_id FROM users WHERE is_banned=FALSE`)
  await tg('sendMessage', { chat_id: chatId, text: `📢 Рассылка на ${rows.length} пользователей...` })
  let sent = 0, failed = 0
  for (const user of rows) {
    try { await tg('sendMessage', { chat_id: user.telegram_id, text }); sent++ }
    catch { failed++ }
    await new Promise(r => setTimeout(r, 50))
  }
  await tg('sendMessage', { chat_id: chatId, text: `📢 Готово\n✅ ${sent}\n❌ ${failed}` })
}

async function msgUser(chatId, username, text) {
  const { rows } = await db.query(`SELECT telegram_id FROM users WHERE LOWER(username)=LOWER($1)`, [username.replace('@','')])
  if (!rows[0]) { await tg('sendMessage', { chat_id: chatId, text: `❌ @${username} не найден` }); return }
  await tg('sendMessage', { chat_id: rows[0].telegram_id, text }).catch(() => {})
  await tg('sendMessage', { chat_id: chatId, text: `✅ Сообщение доставлено @${username}` })
}

async function showComplaints(chatId) {
  const { rows } = await db.query(`
    SELECT c.id, c.text, c.created_at, u.username, u.first_name, u.id AS uid, u.telegram_id
    FROM complaints c JOIN users u ON u.id=c.user_id
    WHERE c.is_resolved=FALSE ORDER BY c.created_at DESC LIMIT 10
  `)
  if (!rows.length) { await tg('sendMessage', { chat_id: chatId, text: '✅ Активных жалоб нет' }); return }
  for (const c of rows) {
    const who = c.username ? `@${c.username}` : c.first_name
    await tg('sendMessage', {
      chat_id: chatId,
      text: `🚨 *Жалоба #${c.id}* от ${who}\n\n${c.text}\n\n_${new Date(c.created_at).toLocaleString('ru')}_`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '💬 Ответить', callback_data: `reply:${c.uid}:${c.username||''}` },
        { text: '✅ Закрыть',  callback_data: `resolve:${c.id}` },
      ]] },
    })
  }
}

// ════════════════════════════════════════════════════
//  ОДОБРЕНИЕ / ОТКЛОНЕНИЕ ВЫВОДА
// ════════════════════════════════════════════════════
async function approveWithdrawal(cq, requestId) {
  const chatId = cq.message.chat.id
  const { rows } = await db.query(
    `SELECT wr.*, u.telegram_id, u.username, u.first_name FROM withdrawal_requests wr
     JOIN users u ON u.id=wr.user_id WHERE wr.id=$1 AND wr.status='pending'`,
    [requestId]
  )
  const req = rows[0]
  if (!req) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Уже обработан', show_alert: true })
    return
  }
  await db.query(`UPDATE withdrawal_requests SET status='approved', updated_at=NOW() WHERE id=$1`, [requestId])
  await db.query(`UPDATE transactions SET status='completed' WHERE user_id=$1 AND type='withdrawal' AND status='pending' ORDER BY created_at DESC LIMIT 1`, [req.user_id])
  adminLog(cq.from.id, `approve withdrawal #${requestId}`, 'info', { amount: req.amount, currency: req.currency })
  const who = req.username ? `@${req.username}` : req.first_name
  await tg('sendMessage', { chat_id: req.telegram_id, text: `✅ *Вывод выполнен!*\nСумма: *${req.amount} ${req.currency}*\nАдрес: \`${req.address}\``, parse_mode: 'Markdown' }).catch(() => {})
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
  await tg('sendMessage', { chat_id: chatId, text: `✅ Вывод #${requestId} одобрен для ${who}` })
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Одобрено' })
}

async function rejectWithdrawal(cq, requestId) {
  const chatId = cq.message.chat.id
  const { rows } = await db.query(
    `SELECT wr.*, u.telegram_id, u.username, u.first_name FROM withdrawal_requests wr
     JOIN users u ON u.id=wr.user_id WHERE wr.id=$1 AND wr.status='pending'`,
    [requestId]
  )
  const req = rows[0]
  if (!req) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Уже обработан', show_alert: true })
    return
  }
  const BALANCE_COL = { USDT:'balance_usdt', TON:'balance_ton', BTC:'balance_usdt', STARS:'balance_stars' }
  const col = BALANCE_COL[req.currency] || 'balance_usdt'
  await db.withTransaction(async (client) => {
    await client.query(`UPDATE withdrawal_requests SET status='rejected', updated_at=NOW() WHERE id=$1`, [requestId])
    await client.query(`UPDATE users SET ${col}=${col}+$1 WHERE id=$2`, [req.amount, req.user_id])
    await client.query(`UPDATE transactions SET status='failed' WHERE user_id=$1 AND type='withdrawal' AND status='pending' ORDER BY created_at DESC LIMIT 1`, [req.user_id])
  })
  adminLog(cq.from.id, `reject withdrawal #${requestId}`, 'warning', { amount: req.amount, currency: req.currency })
  const who = req.username ? `@${req.username}` : req.first_name
  await tg('sendMessage', { chat_id: req.telegram_id, text: `❌ *Вывод отклонён*\nСумма ${req.amount} ${req.currency} возвращена на баланс.`, parse_mode: 'Markdown' }).catch(() => {})
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
  await tg('sendMessage', { chat_id: chatId, text: `❌ Вывод #${requestId} отклонён для ${who} — средства возвращены.` })
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: '❌ Отклонено' })
}

// ════════════════════════════════════════════════════
//  CALLBACK ROUTER
// ════════════════════════════════════════════════════
async function handleCallback(cq) {
  await tg('answerCallbackQuery', { callback_query_id: cq.id })
  const chatId = cq.message.chat.id
  const data   = cq.data

  // Выводы — кнопки wd:approve/reject доступны только администратору
  if (data.startsWith('wd:')) {
    if (!isAdmin(cq.from.id)) return
    const [, action, idStr] = data.split(':')
    const id = parseInt(idStr)
    if (action === 'approve') await approveWithdrawal(cq, id)
    if (action === 'reject')  await rejectWithdrawal(cq, id)
    return
  }

  if (!isAdmin(cq.from.id)) return
  adminLog(cq.from.id, `btn: ${data}`)

  const map = {
    'admin:stats':            () => sendStats(chatId),
    'admin:frozen':           () => sendFrozen(chatId),
    'admin:withdrawals':      () => sendWithdrawals(chatId),
    'admin:lonely':           () => sendLonely(chatId),
    'admin:categories':       () => sendCategories(chatId),
    'admin:duplicates':       () => sendDuplicates(chatId),
    'admin:recent_users':     () => sendRecentUsers(chatId),
    'admin:recent_orders':    () => sendRecentOrders(chatId),
    'admin:export_users':     () => exportCsv(chatId, 'users'),
    'admin:export_orders':    () => exportCsv(chatId, 'orders'),
    'admin:complaints':       () => showComplaints(chatId),
    'admin:health':           () => sendHealth(chatId),
    'admin:errors':           () => sendErrors(chatId),
    'admin:version':          () => sendVersion(chatId),
    'admin:restart':          () => doRestart(chatId, cq.from.id),
    'admin:balance':          () => sendBotBalance(chatId),
    'admin:pending':          () => sendPending(chatId),
    'admin:sessions':         () => sendSessions(chatId),
    'admin:blocked':          () => sendBlocked(chatId),
    'admin:adminlog':         () => sendAdminLog(chatId),
    'admin:rules':            () => sendRules(chatId),
    'admin:revenue_today':    () => sendRevenue(chatId, 'today'),
    'admin:revenue_week':     () => sendRevenue(chatId, 'week'),
    'admin:ban_help':         () => tg('sendMessage', { chat_id: chatId, text: 'Используйте команду:\n`/ban @username`', parse_mode: 'Markdown' }),
    'admin:unban_help':       () => tg('sendMessage', { chat_id: chatId, text: 'Используйте команду:\n`/unban @username`', parse_mode: 'Markdown' }),
    'admin:broadcast_prompt': () => tg('sendMessage', { chat_id: chatId, text: 'Напишите: /broadcast <текст>' }),
  }

  if (map[data]) { await map[data](); return }

  if (data.startsWith('resolve:')) {
    const id = data.split(':')[1]
    await db.query(`UPDATE complaints SET is_resolved=TRUE WHERE id=$1`, [id])
    await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
    await tg('sendMessage', { chat_id: chatId, text: `✅ Жалоба #${id} закрыта` })
    return
  }

  if (data.startsWith('reply:')) {
    const [, userId, username] = data.split(':')
    const mention = username ? `@${username}` : `пользователю ID ${userId}`
    await tg('sendMessage', { chat_id: chatId, text: `💬 Чтобы ответить ${mention}:\n/msg ${mention} <текст>` })
  }
}

export default router
