import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({ baseURL: BASE_URL })

/**
 * Читает Telegram initData тремя способами по приоритету:
 *  1. window.Telegram.WebApp.initData  (SDK уже разобрал)
 *  2. URL ?tgWebAppData=...            (SDK ещё не успел / base='./' edge case)
 *  3. URL #tgWebAppData=...            (hash-based передача в старых клиентах)
 *
 * Telegram всегда добавляет tgWebAppData к URL когда открывает Mini App.
 * Чтение напрямую из URL устраняет любые race conditions SDK.
 */
function getTelegramInitData() {
  // 1. Официальный SDK
  const sdkData = window.Telegram?.WebApp?.initData
  if (sdkData) return sdkData

  // 2. URL query string — ?tgWebAppData=<urlencoded>
  try {
    const qp = new URLSearchParams(window.location.search)
    const raw = qp.get('tgWebAppData')
    if (raw) return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch (_) {}

  // 3. URL hash — #tgWebAppData=<urlencoded>
  try {
    const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const raw = hp.get('tgWebAppData')
    if (raw) return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch (_) {}

  return ''
}

api.interceptors.request.use((config) => {
  const initData = getTelegramInitData()
  config.headers['X-Telegram-Init-Data'] = initData
  return config
})

// Экспортируем для использования в App.jsx (waitForInitData)
export { getTelegramInitData }

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

// asset: 'TON' | 'USDT' | 'BTC' | 'ETH' | 'LTC' | 'BNB' | 'TRX' | 'USDC' | 'XTR'
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
