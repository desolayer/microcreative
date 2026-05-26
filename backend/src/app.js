import './config/env.js'  // загружаем и валидируем переменные окружения
import { createServer }   from 'http'
import { fileURLToPath }  from 'url'
import { dirname, join }  from 'path'
import express            from 'express'
import cors               from 'cors'
import helmet             from 'helmet'
import morgan             from 'morgan'
import rateLimit          from 'express-rate-limit'

import { authMiddleware } from './middleware/auth.js'
import { errorHandler }   from './middleware/errorHandler.js'
import { config }         from './config/env.js'
import { pool }           from './config/database.js'
import { setupWebSocket } from './services/websocket.js'
import { startScheduler } from './services/scheduler.js'
import { notifyAdmin }    from './services/adminNotify.js'

import ordersRouter        from './routes/orders.js'
import dealsRouter, { ensureMessagesFileColumns } from './routes/deals.js'
import walletRouter        from './routes/wallet.js'
import paymentsRouter      from './routes/payments.js'
import webhooksRouter      from './routes/webhooks.js'
import profileRouter       from './routes/profile.js'
import notificationsRouter from './routes/notifications.js'
import botRouter           from './routes/bot.js'
import supportRouter       from './routes/support.js'
import authRouter, { ensureAuthTokensTable } from './routes/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const app = express()

// Railway / Render / Vercel — за reverse proxy
app.set('trust proxy', 1)

// ── Базовые мидлвары ─────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: true,
  credentials: false,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Telegram-Init-Data',
  ],
  exposedHeaders: ['Content-Type'],
}))
app.use(morgan('dev'))
app.use(express.json({ limit: '5mb' }))

// ── Rate limiting ─────────────────────────────────────
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 минута
  max: 60,
  message: { error: 'Too many requests, please slow down' },
})
app.use('/api', limiter)

// ── Статические файлы (загрузки сделок) ──────────────
// Файлы хранятся в <project_root>/uploads/
app.use('/uploads', express.static(join(__dirname, '../../uploads')))

// ── Публичные эндпоинты (без авторизации) ────────────
app.use('/api/webhooks', webhooksRouter)
app.use('/api/bot',      botRouter)
app.use('/api/auth',     authRouter)   // token exchange + JWT refresh

// Статус приложения — maintenance mode
app.get('/api/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'maintenance_mode'`
    )
    res.json({
      ok: true,
      maintenance: rows[0]?.value === 'true',
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    })
  } catch {
    res.json({ ok: true, maintenance: false, version: 'dev' })
  }
})

// ── API с авторизацией ────────────────────────────────
app.use('/api', authMiddleware)

app.use('/api/orders',        ordersRouter)
app.use('/api/deals',         dealsRouter)
app.use('/api/wallet',        walletRouter)
app.use('/api/payments',      paymentsRouter)
app.use('/api/profile',       profileRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/support',       supportRouter)

// ── Health check ──────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

// ── 404 ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// ── Глобальный обработчик ошибок ─────────────────────
app.use(errorHandler)

const server = createServer(app)
setupWebSocket(server)

server.listen(config.port, async () => {
  console.log(`MicroCreative backend running on port ${config.port}`)
  console.log(`Environment: ${config.nodeEnv}`)

  // Создаём таблицу auth_tokens если не существует
  await ensureAuthTokensTable()
    .then(() => console.log('[DB] auth_tokens table ready'))
    .catch(err => console.error('[DB] auth_tokens migration error:', err))

  // Добавляем колонки для файлов в messages (если нет)
  await ensureMessagesFileColumns()
    .then(() => console.log('[DB] messages file columns ready'))
    .catch(err => console.error('[DB] messages migration error:', err))

  startScheduler()

  // Уведомляем администратора что бэкенд поднялся
  const ver = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'
  notifyAdmin(`✅ *Бэкенд запущен* (${ver})\nPort: ${config.port}`).catch(() => {})
})

export default app
