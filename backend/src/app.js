import './config/env.js'  // загружаем и валидируем переменные окружения
import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { config } from './config/env.js'
import { pool } from './config/database.js'
import { setupWebSocket } from './services/websocket.js'
import { startScheduler } from './services/scheduler.js'
import { notifyAdmin } from './services/adminNotify.js'

import ordersRouter        from './routes/orders.js'
import dealsRouter         from './routes/deals.js'
import walletRouter        from './routes/wallet.js'
import paymentsRouter      from './routes/payments.js'
import webhooksRouter      from './routes/webhooks.js'
import profileRouter       from './routes/profile.js'
import notificationsRouter from './routes/notifications.js'
import botRouter           from './routes/bot.js'
import supportRouter       from './routes/support.js'

const app = express()

// Railway / Render / Vercel — за reverse proxy
app.set('trust proxy', 1)

// ── Базовые мидлвары ─────────────────────────────────
app.use(helmet())
app.use(cors({
  // Разрешаем любой origin — безопасность обеспечивается HMAC-валидацией initData,
  // а не CORS (Telegram Mini Apps открываются из разных origin-контекстов)
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

// ── Публичные эндпоинты (без авторизации) ────────────
app.use('/api/webhooks', webhooksRouter)
app.use('/api/bot',      botRouter)

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

server.listen(config.port, () => {
  console.log(`MicroCreative backend running on port ${config.port}`)
  console.log(`Environment: ${config.nodeEnv}`)
  startScheduler()

  // Уведомляем администратора что бэкенд поднялся
  const ver = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'
  notifyAdmin(`✅ *Бэкенд запущен* (${ver})\nPort: ${config.port}`).catch(() => {})
})

export default app
