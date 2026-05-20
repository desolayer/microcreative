export function errorHandler(err, req, res, next) {
  console.error(err)

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry' })
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' })
  }

  const status = err.status || err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  res.status(status).json({ error: message })
}
