import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config) => {
  const initData = window.Telegram?.WebApp?.initData || ''
  config.headers['X-Telegram-Init-Data'] = initData
  return config
})

export const ordersAPI = {
  getAll: (category) => api.get('/orders', { params: { category } }),
  getOne: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
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
  pay: (dealId) => api.post(`/deals/${dealId}/pay`),
  submit: (dealId) => api.post(`/deals/${dealId}/submit`),
  activate: (dealId) => api.post(`/deals/${dealId}/activate`),
  complete: (dealId) => api.post(`/deals/${dealId}/complete`),
  dispute: (dealId, reason) => api.post(`/deals/${dealId}/dispute`, { reason }),
  cancel: (dealId) => api.post(`/deals/${dealId}/cancel`),
}

export const walletAPI = {
  getBalance: () => api.get('/wallet/balance'),
  getHistory: () => api.get('/wallet/history'),
  withdraw: (data) => api.post('/wallet/withdraw', data),
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
  getMe: () => api.get('/profile/me'),
  getUser: (userId) => api.get(`/profile/${userId}`),
  update: (data) => api.put('/profile/me', data),
}

export default api
