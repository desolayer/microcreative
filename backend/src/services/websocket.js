import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { config } from '../config/env.js'
import { db } from '../config/database.js'

// Map: dbUserId (string) → Set<WebSocket>
const userSockets = new Map()

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws) => {
    let dbUserId = null

    // Keepalive ping каждые 25 сек
    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping()
    }, 25000)

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.type === 'auth') {
          const telegramId = resolveTelegramId(msg.initData)
          if (!telegramId) { ws.close(4001, 'Unauthorized'); return }

          const { rows } = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [telegramId]
          )
          if (!rows[0]) { ws.close(4002, 'User not found'); return }

          dbUserId = String(rows[0].id)
          if (!userSockets.has(dbUserId)) userSockets.set(dbUserId, new Set())
          userSockets.get(dbUserId).add(ws)

          ws.send(JSON.stringify({ type: 'auth_ok', userId: dbUserId }))
        }

        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
      } catch (_) { /* ignore parse errors */ }
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      if (dbUserId && userSockets.has(dbUserId)) {
        userSockets.get(dbUserId).delete(ws)
        if (userSockets.get(dbUserId).size === 0) userSockets.delete(dbUserId)
      }
    })

    ws.on('error', () => ws.close())
  })

  console.log('WebSocket server attached on /ws')
  return wss
}

function resolveTelegramId(initData) {
  // Dev: нет initData → дефолтный тестовый ID
  if (config.nodeEnv === 'development' && !initData) return 12345

  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')
    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.telegramBotToken)
      .digest()
    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex')
    if (expected !== hash) return null
    const user = JSON.parse(params.get('user') || '{}')
    return user.id || null
  } catch { return null }
}

/**
 * Отправляет событие конкретному пользователю (по DB id).
 */
export function sendToUser(dbUserId, data) {
  const sockets = userSockets.get(String(dbUserId))
  if (!sockets) return
  const msg = JSON.stringify(data)
  sockets.forEach(ws => { if (ws.readyState === 1) ws.send(msg) })
}

/**
 * Рассылает событие обоим участникам сделки.
 */
export function broadcastToDeal(clientId, freelancerId, data) {
  sendToUser(clientId, data)
  sendToUser(freelancerId, data)
}

/**
 * Возвращает общее кол-во активных WebSocket-соединений.
 */
export function getActiveConnectionsCount() {
  let count = 0
  for (const sockets of userSockets.values()) count += sockets.size
  return count
}
