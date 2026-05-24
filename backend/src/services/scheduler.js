/**
 * Планировщик задач — заменяет cron без лишних зависимостей.
 * Проверяет время раз в минуту, каждую задачу запускает не чаще 1 раза в день.
 */
import axios from 'axios'
import { db } from '../config/database.js'
import { config } from '../config/env.js'

const tg = (method, data) =>
  axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, data)
    .catch(e => console.error('[Scheduler] TG error:', e?.response?.data?.description || e.message))

// Хранит дату последнего запуска задачи ('YYYY-MM-DD')
const lastRun = {}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function shouldRun(jobName, targetHour, targetMin) {
  const now = new Date()
  if (now.getHours() !== targetHour || now.getMinutes() !== targetMin) return false
  const today = todayStr()
  if (lastRun[jobName] === today) return false
  lastRun[jobName] = today
  return true
}

// ── Ежедневный отчёт в 23:59 ─────────────────────────
async function dailyReport() {
  if (!config.adminTelegramId) return

  const [users, orders, deals, commissions, active] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COUNT(*) FROM deals  WHERE created_at > NOW() - INTERVAL '1 day'`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions
              WHERE type='commission' AND status='completed' AND created_at > NOW() - INTERVAL '1 day'`),
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
      `🔥 Активных сделок сейчас: *${active.rows[0].count}*`,
    parse_mode: 'Markdown',
  })
  console.log('[Scheduler] daily report sent')
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

  const fmt = (u) => u ? `@${u}` : ''
  const list = rows.map(d => {
    const dl = new Date(d.deadline).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    const c  = fmt(d.client)     || d.client_name
    const f  = fmt(d.freelancer) || d.freelancer_name
    return `• #${d.id} _${d.order_title}_\n  ⏰ ${dl} | ${c} → ${f}`
  }).join('\n\n')

  await tg('sendMessage', {
    chat_id: config.adminTelegramId,
    text: `⏰ *Дедлайны ближайшие 24 ч (${rows.length} шт.)*\n\n${list}`,
    parse_mode: 'Markdown',
  })
  console.log('[Scheduler] deadline alerts sent, count:', rows.length)
}

// ── Запуск планировщика ───────────────────────────────
export function startScheduler() {
  setInterval(() => {
    if (shouldRun('dailyReport',    23, 59)) dailyReport().catch(console.error)
    if (shouldRun('deadlineAlerts',  9,  0)) deadlineAlerts().catch(console.error)
  }, 60_000)

  console.log('[Scheduler] started — daily report 23:59, deadline alerts 09:00')
}
