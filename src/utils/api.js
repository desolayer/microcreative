import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({ baseURL: BASE_URL })

// ── JWT хелперы ───────────────────────────────────────────
const JWT_KEY = 'mc_jwt'

export function getJwt()        { return localStorage.getItem(JWT_KEY) || '' }
export function setJwt(token)   { localStorage.setItem(JWT_KEY, token) }
export function clearJwt()      { localStorage.removeItem(JWT_KEY) }

/** Декодирует JWT без проверки подписи (только для чтения exp на клиенте) */
export function decodeJwt(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch (_) { return null }
}

/** Возвращает true если JWT существует и ещё не истёк (с запасом 60с) */
export function isJwtValid() {
  const token = getJwt()
  if (!token) return false
  const payload = decodeJwt(token)
  if (!payload?.exp) return false
  return payload.exp > Math.floor(Date.now() / 1000) + 60
}

// ── Читаем Telegram initData (3 источника, fallback) ─────
export function getTelegramInitData() {
  const sdkData = window.Telegram?.WebApp?.initData
  if (sdkData) return sdkData

  try {
    const qp  = new URLSearchParams(window.location.search)
    const raw = qp.get('tgWebAppData')
    if (raw) return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch (_) {}

  try {
    const hp  = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const raw = hp.get('tgWebAppData')
    if (raw) return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch (_) {}

  return ''
}

// ── Request interceptor: JWT → initData fallback ──────────
api.interceptors.request.use((cfg) => {
  const jwt = getJwt()
  if (jwt) {
    cfg.headers['Authorization'] = `Bearer ${jwt}`
  } else {
    const initData = getTelegramInitData()
    if (initData) cfg.headers['X-Telegram-Init-Data'] = initData
  }
  return cfg
})

// ── Response interceptor: 401 → clearJwt ─────────────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && getJwt()) {
      // JWT истёк или отозван — сбрасываем, пользователь увидит экран входа
      clearJwt()
    }
    return Promise.reject(err)
  }
)

export const ordersAPI = {
  getAll:  (category) => api.get('/orders', { params: { category } }),
  getMine: ()         => api.get('/orders/mine'),
  getOne:  (id)       => api.get(`/orders/${id}`),
  create:  (data)     => api.post('/orders', data),
  respond: (orderId, data) => api.post(`/orders/${orderId}/respond`, data),
  getResponses: (orderId) => api.get(`/orders/${orderId}/responses`),
  acceptResponse: (orderId, responseId) =>
    api.post(`/orders/${orderId}/responses/${responseId}/accept`),
  deleteOrder: (id) => api.delete(`/orders/${id}`),
}

export const dealsAPI = {
  getAll: () => api.get('/deals'),
  getOne: (id) => api.get(`/deals/${id}`),
  getMessages: (dealId) => api.get(`/deals/${dealId}/messages`),
  sendMessage: (dealId, message) => api.post(`/deals/${dealId}/messages`, { message }),
  pay: (dealId, asset) => api.post(`/deals/${dealId}/pay`, asset ? { asset } : {}),
  submit: (dealId) => api.post(`/deals/${dealId}/submit`),
  activate: (dealId) => api.post(`/deals/${dealId}/activate`),
  complete: (dealId) => api.post(`/deals/${dealId}/complete`),
  dispute: (dealId, reason) => api.post(`/deals/${dealId}/dispute`, { reason }),
  cancel: (dealId) => api.post(`/deals/${dealId}/cancel`),
}

export const walletAPI = {
  getBalance:       () => api.get('/wallet/balance'),
  getHistory:       () => api.get('/wallet/history'),
  withdraw:         (data) => api.post('/wallet/withdraw', data),
  withdrawRequest:  (data) => api.post('/wallet/withdraw-request', data),
  getWithdrawals:   () => api.get('/wallet/withdrawals'),
}

export const paymentsAPI = {
  createInvoice: (orderId, asset, amount) =>
    api.post('/payments/cryptobot', { orderId, asset, amount }),
  checkStatus: (paymentId) => api.get(`/payments/${paymentId}/status`),
}

export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  readAll: () => api.post('/notifications/read-all'),
  readOne: (id) => api.post(`/notifications/${id}/read`),
}

export const profileAPI = {
  getMe:             () => api.get('/profile/me'),
  getUser:           (userId) => api.get(`/profile/${userId}`),
  update:            (data) => api.put('/profile/me', data),
  getNotifSettings:  () => api.get('/profile/me/notifications'),
  saveNotifSettings: (data) => api.put('/profile/me/notifications', data),
}

export default api
