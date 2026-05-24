import { db } from '../config/database.js'

export function errorHandler(err, req, res, next) {
  console.error(err)

  // Логируем серверные ошибки в БД (5xx или неизвестный статус)
  const status = err.status || err.statusCode || 500
  if (status >= 500) {
    db.query(
      `INSERT INTO error_logs (message, stack, path, method)
       VALUES ($1, $2, $3, $4)`,
      [
        String(err.message || 'Unknown error').substring(0, 500),
        String(err.stack || '').substring(0, 3000),
        req.path,
        req.method,
      ]
    ).catch(() => {}) // fire-and-forget, не мешаем ответу
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry' })
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' })
  }

  const message = err.message || 'Internal Server Error'
  res.status(status).json({ error: message })
}
