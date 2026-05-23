import { useState, useEffect } from 'react'
import BottomNav from './components/BottomNav'
import FeedPage from './pages/FeedPage'
import CreateOrderPage from './pages/CreateOrderPage'
import ProfilePage from './pages/ProfilePage'
import OrderDetailPage from './pages/OrderDetailPage'
import { profileAPI, notificationsAPI, walletAPI } from './utils/api'
import { useStore } from './store/useStore'

export default function App() {
  const [currentPage, setCurrentPage] = useState('feed')
  const [pageParams, setPageParams] = useState(null)
  const { setUser, setBalance, setUnreadCount } = useStore()

  // Инициализация: загружаем профиль, баланс, счётчик уведомлений
  useEffect(() => {
    profileAPI.getMe()
      .then(r => setUser(r.data))
      .catch(() => {}) // dev-режим без Telegram — не критично

    walletAPI.getBalance()
      .then(r => {
        const d = r.data
        setBalance({
          rub:          parseFloat(d.balance_rub)   || 0,
          usdt:         parseFloat(d.balance_usdt)  || 0,
          ton:          parseFloat(d.balance_ton)   || 0,
          stars:        parseInt(d.balance_stars)   || 0,
          frozen_rub:   parseFloat(d.frozen_rub)    || 0,
          frozen_usdt:  parseFloat(d.frozen_usdt)   || 0,
          frozen_ton:   parseFloat(d.frozen_ton)    || 0,
          frozen_stars: parseInt(d.frozen_stars)    || 0,
        })
      })
      .catch(() => {})

    notificationsAPI.getAll()
      .then(r => setUnreadCount(r.data.unread || 0))
      .catch(() => {})
  }, [])

  const navigate = (page, params = null) => {
    setCurrentPage(page)
    setPageParams(params)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'feed':
        return <FeedPage onOrderClick={(order) => navigate('order-detail', order)} />

      case 'order-detail':
        return (
          <OrderDetailPage
            orderId={pageParams?.id}
            onBack={() => navigate('feed')}
          />
        )

      case 'create':
        return (
          <CreateOrderPage
            onBack={() => navigate('feed')}
            onSuccess={() => navigate('feed')}
          />
        )

      case 'deals':
        return (
          <div style={styles.placeholder}>
            <i className="ti ti-message" style={{ fontSize: 48, color: '#333' }} />
            <div style={{ color: '#555', marginTop: 12 }}>Мои сделки</div>
          </div>
        )

      case 'wallet':
        return (
          <div style={styles.placeholder}>
            <i className="ti ti-wallet" style={{ fontSize: 48, color: '#333' }} />
            <div style={{ color: '#555', marginTop: 12 }}>Кошелёк</div>
          </div>
        )

      case 'notifications':
        return (
          <div style={styles.placeholder}>
            <i className="ti ti-bell" style={{ fontSize: 48, color: '#333' }} />
            <div style={{ color: '#555', marginTop: 12 }}>Уведомления</div>
          </div>
        )

      case 'profile':
        return <ProfilePage />

      default:
        return <FeedPage onOrderClick={(order) => navigate('order-detail', order)} />
    }
  }

  const hideNav = ['order-detail', 'deal', 'payment', 'respond', 'create'].includes(currentPage)

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ paddingBottom: hideNav ? 0 : 80 }}>
        {renderPage()}
      </div>
      {!hideNav && <BottomNav onNavigate={navigate} />}
    </div>
  )
}

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0f0f0f',
    color: '#e5e5e5',
    maxWidth: 480,
    margin: '0 auto',
  },
  placeholder: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh',
    fontFamily: 'inherit',
  },
  backBtn: {
    marginTop: 20, padding: '8px 20px', borderRadius: 10,
    background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    color: '#a78bfa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
}
