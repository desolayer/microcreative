import { Router } from 'express'
import { handleCryptoBotWebhook } from '../services/cryptobot.js'

const router = Router()

/**
 * POST /api/webhooks/cryptobot
 * Вызывается CryptoBot при оплате инвойса — без авторизации.
 * Зарегистрировать в @CryptoBot → My Apps → App → Webhooks:
 *   https://backend-production-57ecb.up.railway.app/api/webhooks/cryptobot
 */
router.post('/cryptobot', async (req, res, next) => {
  try {
    console.log('[Webhook] CryptoBot:', req.body?.update_type, JSON.stringify(req.body).substring(0, 200))
    await handleCryptoBotWebhook(req.body)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
