import './config/env.js'  // загружаем и валидируем переменные окружения
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { config } from './config/env.js'
import { pool } from './config/database.js'

import ordersRouter       from './routes/orders.js'
import dealsRouter        from './routes/deals.js'
import walletRouter       from './routes/wallet.js'
import paymentsRouter     from './routes/payments.js'
import profileRouter      from './routes/profile.js'
import notificationsRouter from './routes/notifications.js'
import botRouter           from './routes/bot.js'

const app = express()

// ── Базовые мидлвары ─────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
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

// ── Вебхуки (без авторизации) ─────────────────────────
app.use('/api/webhooks', paymentsRouter)  // CryptoBot / Cryptomus
app.use('/api/bot',      botRouter)       // Telegram Bot updates

// ── API с авторизацией ────────────────────────────────
app.use('/api', authMiddleware)

app.use('/api/orders',        ordersRouter)
app.use('/api/deals',         dealsRouter)
app.use('/api/wallet',        walletRouter)
app.use('/api/payments',      paymentsRouter)
app.use('/api/profile',       profileRouter)
app.use('/api/notifications', notificationsRouter)

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

app.listen(config.port, () => {
  console.log(`MicroCreative backend running on port ${config.port}`)
  console.log(`Environment: ${config.nodeEnv}`)
})

export default app
