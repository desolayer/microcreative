import { db } from '../config/database.js'
import { config } from '../config/env.js'

const CURRENCY_BALANCE_COLUMN = {
  RUB:   { balance: 'balance_rub',   frozen: 'frozen_rub' },
  USDT:  { balance: 'balance_usdt',  frozen: 'frozen_usdt' },
  TON:   { balance: 'balance_ton',   frozen: 'frozen_ton' },
  STARS: { balance: 'balance_stars', frozen: 'frozen_stars' },
}

function cols(currency) {
  const c = CURRENCY_BALANCE_COLUMN[currency]
  if (!c) throw new Error(`Unsupported currency: ${currency}`)
  return c
}

/**
 * Замораживает средства заказчика при создании сделки.
 * Вызывается внутри транзакции (передаём client).
 */
export async function lockEscrow(dbClient, { userId, dealId, amount, currency }) {
  const { balance, frozen } = cols(currency)

  // Проверяем и списываем баланс атомарно
  const { rows } = await dbClient.query(
    `UPDATE users
     SET ${balance} = ${balance} - $1,
         ${frozen}  = ${frozen}  + $1
     WHERE id = $2 AND ${balance} >= $1
     RETURNING id`,
    [amount, userId]
  )

  if (rows.length === 0) {
    throw Object.assign(new Error('Insufficient balance'), { status: 400 })
  }

  await dbClient.query(
    `INSERT INTO transactions (user_id, type, amount, currency, status, deal_id)
     VALUES ($1, 'escrow_lock', $2, $3, 'completed', $4)`,
    [userId, amount, currency, dealId]
  )
}

/**
 * Завершение сделки — переводит эскроу исполнителю, списывает комиссию.
 */
export async function releaseEscrow(dealId) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM deals WHERE id = $1 FOR UPDATE`,
      [dealId]
    )
    const deal = rows[0]
    if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 })
    if (deal.status !== 'active') {
      throw Object.assign(new Error(`Cannot release escrow: deal is ${deal.status}`), { status: 400 })
    }

    const { balance, frozen } = cols(deal.currency)
    const commission = (deal.amount * config.platformCommission) / 100
    const freelancerAmount = deal.amount - commission

    // Размораживаем у заказчика
    await client.query(
      `UPDATE users SET ${frozen} = ${frozen} - $1 WHERE id = $2`,
      [deal.amount, deal.client_id]
    )

    // Зачисляем исполнителю
    await client.query(
      `UPDATE users SET ${balance} = ${balance} + $1 WHERE id = $2`,
      [freelancerAmount, deal.freelancer_id]
    )

    // Закрываем сделку
    await client.query(
      `UPDATE deals SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [dealId]
    )

    // Обновляем статус заказа
    await client.query(
      `UPDATE orders SET status = 'completed' WHERE id = $1`,
      [deal.order_id]
    )

    // Обновляем рейтинг — увеличиваем счётчик у исполнителя
    await client.query(
      `UPDATE users SET completed_deals = completed_deals + 1 WHERE id = $1`,
      [deal.freelancer_id]
    )

    // Записываем транзакции
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, status, deal_id)
       VALUES ($1, 'escrow_release', $2, $3, 'completed', $4)`,
      [deal.freelancer_id, freelancerAmount, deal.currency, dealId]
    )
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, status, deal_id)
       VALUES ($1, 'commission', $2, $3, 'completed', $4)`,
      [deal.client_id, commission, deal.currency, dealId]
    )

    return { dealId, freelancerAmount, commission, currency: deal.currency }
  })
}

/**
 * Возврат эскроу заказчику при отмене сделки.
 */
export async function refundEscrow(dealId) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM deals WHERE id = $1 FOR UPDATE`,
      [dealId]
    )
    const deal = rows[0]
    if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 })
    if (!['active', 'pending', 'disputed'].includes(deal.status)) {
      throw Object.assign(new Error(`Cannot refund: deal is ${deal.status}`), { status: 400 })
    }

    const { balance, frozen } = cols(deal.currency)

    // Возвращаем заказчику
    await client.query(
      `UPDATE users
       SET ${frozen}  = ${frozen}  - $1,
           ${balance} = ${balance} + $1
       WHERE id = $2`,
      [deal.amount, deal.client_id]
    )

    await client.query(
      `UPDATE deals SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [dealId]
    )

    await client.query(
      `UPDATE orders SET status = 'open' WHERE id = $1`,
      [deal.order_id]
    )

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, status, deal_id)
       VALUES ($1, 'escrow_refund', $2, $3, 'completed', $4)`,
      [deal.client_id, deal.amount, deal.currency, dealId]
    )

    return { dealId, refundedAmount: deal.amount, currency: deal.currency }
  })
}
