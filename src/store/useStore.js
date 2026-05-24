import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── Пользователь ──────────────────────────────
  user: null,
  setUser: (user) => set({ user }),

  // ── Заказы ────────────────────────────────────
  orders: [],
  setOrders: (orders) => set({ orders }),
  addOrder: (order) => set((s) => ({ orders: [order, ...s.orders] })),

  // ── Активная категория в ленте ────────────────
  activeCategory: 'Все',
  setActiveCategory: (cat) => set({ activeCategory: cat }),

  // ── Сделки ────────────────────────────────────
  deals: [],
  dealsUnreadCount: 0,
  setDeals: (deals) => set({
    deals,
    dealsUnreadCount: deals.reduce((sum, d) => sum + (parseInt(d.unread_count) || 0), 0),
  }),

  // ── Баланс кошелька (загружается с API) ───────
  balance: {
    rub: 0,
    usdt: 0,
    ton: 0,
    stars: 0,
    frozen_rub: 0,
    frozen_usdt: 0,
    frozen_ton: 0,
    frozen_stars: 0,
  },
  setBalance: (balance) => set({ balance }),

  // ── Уведомления ───────────────────────────────
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  markAllRead: () => set({ unreadCount: 0 }),

  // ── Навигация (активный таб) ──────────────────
  activeTab: 'feed',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
