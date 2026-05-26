/**
 * Планировщик задач — без внешних зависимостей.
 * Проверяет время раз в минуту, каждую задачу запускает строго 1 раз в период.
 */
import axios from 'axios'
import { db } from '../config/database.js'
import { config } from '../config/env.js'

const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('[Scheduler] TG error:', e?.response?.data?.description || e.message))

// lastRun[jobName] = 'YYYY-MM-DD'  (один раз в день)
const lastRun   = {}
// lastRunHour[jobName] = 'YYYY-MM-DD-HH'  (один раз в час)
const lastHour  = {}

function todayStr()  { return new Date().toISOString().slice(0, 10) }
function hourStr()   { const n = new Date(); return `${n.toISOString().slice(0,10)}-${n.getHours()}` }

/** Запускается 1 раз в день в targetHour:targetMin. targetDow: 0=вс…6=сб, null=каждый день. */
function shouldRunDaily(name, h, m, dow = null) {
  const now = new Date()
  if (now.getHours() !== h || now.getMinutes() !== m) return false
  if (dow !== null && now.getDay() !== dow) return false
  const key = todayStr()
  if (lastRun[name] === key) return false
  lastRun[name] = key
  return true
}

/** Запускается 1 раз в час в :targetMin. */
function shouldRunHourly(name, m = 0) {
  const now = new Date()
  if (now.getMinutes() !== m) return false
  const key = hourStr()
  if (lastHour[name] === key) return false
  lastHour[name] = key
  return true
}

// ── Ежедневный отчёт в 23:59 ─────────────────────────
async function dailyReport() {
  if (!config.adminTelegramId) return

  const [users, orders, deals, commissions, active] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM users  WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COUNT(*) FROM deals  WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions
              WHERE type='commission' AND status='completed' AND created_at > NOW()-INTERVAL '1 day'`),
    db.query(`SELECT COUNT(*) FROM deals WHERE status IN ('active','submitted','disputed')`),
  ])

  await tg('sendMessage', {
    chat_id: config.adminTelegramId,
    text:
      `📊 *Дневной отчёт MicroCreative*\n\n` +
      `👥 Новых пользователей: *${users.rows[0].count}*\n` +
      `📋 Новых заказов: *${orders.rows[0].count}*\n` +
      `🤝 Новых сделок: *${deals.rows[0].count}*\n` +
      `💰 Комиссий за день: *${parseFloat(commissions.rows[0].s).toFixed(2)}*\n` +
      `🔥 Активных сделок: *${active.rows[0].count}*`,
    parse_mode: 'Markdown',
  })
  console.log('[Scheduler] daily report sent')
}

// ── Еженедельный отчёт — понедельник 09:00 ───────────
async function weeklyReport() {
  if (!config.adminTelegramId) return

  const [users, orders, deals, commissions, newFreelancers] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM users  WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.query(`SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.query(`SELECT COUNT(*) FROM deals  WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions
              WHERE type='commission' AND status='completed' AND created_at > NOW()-INTERVAL '7 days'`),
    db.query(`SELECT COUNT(*) FROM deals WHERE status='completed' AND completed_at > NOW()-INTERVAL '7 days'`),
  ])

  await tg('sendMessage', {
    chat_id: config.adminTelegramId,
    text:
      `📈 *Недельный отчёт MicroCreative*\n\n` +
      `👥 Новых пользователей: *${users.rows[0].count}*\n` +
      `📋 Новых заказов: *${orders.rows[0].count}*\n` +
      `🤝 Новых сделок: *${deals.rows[0].count}*\n` +
      `✅ Завершённых сделок: *${newFreelancers.rows[0].count}*\n` +
      `💰 Выручка (комиссии): *${parseFloat(commissions.rows[0].s).toFixed(2)}*`,
    parse_mode: 'Markdown',
  })
  console.log('[Scheduler] weekly report sent')
}

// ── Утренний алерт дедлайнов в 09:00 ────────────────
async function deadlineAlerts() {
  if (!config.adminTelegramId) return

  const { rows } = await db.query(`
    SELECT d.id, d.amount, d.currency, d.deadline,
           c.username AS client,   c.first_name AS client_name,
           f.username AS freelancer, f.first_name AS freelancer_name,
           o.title AS order_title
    FROM deals d
    JOIN users  c ON c.id = d.client_id
    JOIN users  f ON f.id = d.freelancer_id
    JOIN orders o ON o.id = d.order_id
    WHERE d.status IN ('active','submitted')
      AND d.deadline BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
    ORDER BY d.deadline ASC
  `)
  if (!rows.length) return

  const fmt = u => u ? `@${u}` : ''
  const list = rows.map(d => {
    const dl = new Date(d.deadline).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    return `• #${d.id} _${d.order_title}_\n  ⏰ ${dl} | ${fmt(d.client) || d.client_name} → ${fmt(d.freelancer) || d.freelancer_name}`
  }).join('\n\n')

  await tg('sendMessage', {
    chat_id: config.adminTelegramId,
    text: `⏰ *Дедлайны ближайшие 24 ч (${rows.length} шт.)*\n\n${list}`,
    parse_mode: 'Markdown',
  })
  console.log('[Scheduler] deadline alerts sent:', rows.length)
}

// ── Часовой мониторинг баланса CryptoBot ─────────────
async function checkCryptoBotBalance() {
  if (!config.adminTelegramId || !config.cryptobot.apiToken) return

  try {
    const { data } = await axios.get(`${config.cryptobot.apiUrl}/getBalance`, {
      headers: { 'Crypto-Pay-API-Token': config.cryptobot.apiToken },
      timeout: 8000,
    })
    if (!data.ok) return

    for (const item of data.result) {
      const avail = parseFloat(item.available || 0)
      // Предупреждение: USDT ниже $10
      if (item.currency_code === 'USDT' && avail < 10) {
        await tg('sendMessage', {
          chat_id: config.adminTelegramId,
          text:
            `⚠️ *Низкий баланс CryptoBot*\n\n` +
            `USDT: *${avail.toFixed(2)}* (< $10)\n` +
            `Пополните баланс для обеспечения выплат.`,
          parse_mode: 'Markdown',
        })
        console.log('[Scheduler] low CryptoBot balance alert:', avail, 'USDT')
      }
    }
  } catch (e) {
    console.error('[Scheduler] CryptoBot balance check failed:', e.message)
  }
}

// ── Запуск ────────────────────────────────────────────
export function startScheduler() {
  setInterval(() => {
    const now = new Date()
    // Ежедневно 23:59
    if (shouldRunDaily('dailyReport',    23, 59))  dailyReport().catch(console.error)
    // Ежедневно 09:00 (будни — алерты дедлайнов)
    if (shouldRunDaily('deadlineAlerts',  9,  0))  deadlineAlerts().catch(console.error)
    // Понедельник 09:00 — недельный отчёт
    if (shouldRunDaily('weeklyReport',    9,  0, 1)) weeklyReport().catch(console.error)
  }, 60_000)

  console.log('[Scheduler] started — daily 23:59, deadline 09:00, weekly Mon 09:00')
}
