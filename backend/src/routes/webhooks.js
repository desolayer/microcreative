import { Router } from 'express'
import { handleCryptoBotWebhook } from '../services/cryptobot.js'
import { handleCryptomusWebhook } from '../services/cryptomus.js'
import { config } from '../config/env.js'

const router = Router()

/**
 * POST /api/webhooks/cryptobot
 * Вызывается CryptoBot при оплате инвойса — без авторизации пользователя,
 * но с проверкой подписи CryptoBot (заголовок Crypto-Pay-API-Token).
 * Зарегистрировать в @CryptoBot → My Apps → App → Webhooks:
 *   https://backend-production-57ecb.up.railway.app/api/webhooks/cryptobot
 */
router.post('/cryptobot', async (req, res, next) => {
  try {
    // ── Верифицируем, что запрос пришёл от CryptoBot ──────────────────
    // CryptoBot передаёт заголовок Crypto-Pay-API-Token = наш API-токен
    const tokenHeader = req.headers['crypto-pay-api-token']
    if (!tokenHeader || tokenHeader !== config.cryptobot.apiToken) {
      console.warn('[Webhook] CryptoBot: отклонён — неверный Crypto-Pay-API-Token')
      return res.status(403).json({ error: 'Forbidden' })
    }

    console.log('[Webhook] CryptoBot:', req.body?.update_type, JSON.stringify(req.body).substring(0, 200))
    await handleCryptoBotWebhook(req.body)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/webhooks/cryptomus
 * Вызывается Cryptomus при оплате инвойса — подпись проверяется внутри handleCryptomusWebhook.
 */
router.post('/cryptomus', async (req, res, next) => {
  try {
    console.log('[Webhook] Cryptomus:', req.body?.status, req.body?.uuid)
    await handleCryptomusWebhook(req.body)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
