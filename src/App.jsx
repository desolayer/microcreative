import { useState, useEffect } from 'react'
import BottomNav from './components/BottomNav'
import FeedPage from './pages/FeedPage'
import CreateOrderPage from './pages/CreateOrderPage'
import ProfilePage from './pages/ProfilePage'
import OrderDetailPage from './pages/OrderDetailPage'
import DealPage from './pages/DealPage'
import ResponsesPage from './pages/ResponsesPage'
import DealsPage from './pages/DealsPage'
import WalletPage from './pages/WalletPage'
import NotificationsPage from './pages/NotificationsPage'
import { profileAPI, notificationsAPI, walletAPI, getTelegramInitData } from './utils/api'
import { useStore } from './store/useStore'
import api from './utils/api'

export default function App() {
  const [currentPage, setCurrentPage]     = useState('feed')
  const [pageParams, setPageParams]       = useState(null)
  const [feedKey, setFeedKey]             = useState(0)   // инкремент → FeedPage перемонтируется
  const [maintenance, setMaintenance]     = useState(false)
  const [banInfo, setBanInfo]             = useState(null)
  const [unauthorized, setUnauthorized]   = useState(false)
  const { setUser, setBalance, setUnreadCount } = useStore()

  // Инициализация: загружаем статус + профиль, баланс, счётчик уведомлений
  useEffect(() => {
    // getTelegramInitData читает initData тремя способами:
    // SDK → URL query params → URL hash.
    // Если после загрузки страницы initData ещё не доступен через SDK
    // (Telegram Desktop/Web передаёт через postMessage асинхронно),
    // ждём до 2 секунд.
    const waitAndLoad = async () => {
      let initData = getTelegramInitData()

      if (!initData) {
        // Ждём до 2с с шагом 100мс (для Desktop/Web клиентов)
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 100))
          initData = getTelegramInitData()
          if (initData) break
        }
      }

    // Проверяем режим обслуживания
    api.get('/status')
      .then(r => { if (r.data.maintenance) setMaintenance(true) })
      .catch(() => {})

    profileAPI.getMe()
      .then(r => setUser(r.data))
      .catch(e => {
        const status = e?.response?.status
        const d = e?.response?.data
        // Не авторизован — открыт не через Telegram
        if (status === 401) {
          setUnauthorized(true)
          return
        }
        // Проверяем статус бана (403 с ban-info)
        if (status === 403 && d && d.is_permanent !== undefined) {
          setBanInfo(d)
        }
        // dev-режим без Telegram — остальное не критично
      })

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
    }

    waitAndLoad()
  }, [])

  const navigate = (page, params = null) => {
    setCurrentPage(page)
    setPageParams(params)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'feed':
        return (
          <FeedPage
            key={feedKey}
            onOrderClick={(order) => navigate('order-detail', order)}
            onNavigate={navigate}
          />
        )

      case 'order-detail':
        return (
          <OrderDetailPage
            orderId={pageParams?.id}
            onBack={(actionOrRefresh = false, extraParam = null) => {
              // actionOrRefresh can be:
              //   true        → refresh feed and go back
              //   'responses' → go to responses page (extraParam = orderId)
              //   false       → go back to feed
              if (actionOrRefresh === 'responses') {
                navigate('responses', { orderId: extraParam })
              } else {
                if (actionOrRefresh === true) setFeedKey(k => k + 1)
                navigate('feed')
              }
            }}
          />
        )

      case 'create':
        return (
          <CreateOrderPage
            onBack={() => navigate('feed')}
            onSuccess={() => navigate('feed')}
          />
        )

      case 'deal':
        return (
          <DealPage
            dealId={pageParams?.id}
            onBack={() => navigate('deals')}
          />
        )

      case 'responses':
        return (
          <ResponsesPage
            orderId={pageParams?.orderId}
            onBack={() => navigate('feed')}
            onDealCreated={(dealId) => navigate('deal', { id: dealId })}
          />
        )

      case 'deals':
        return (
          <DealsPage onDealClick={(dealId) => navigate('deal', { id: dealId })} />
        )

      case 'wallet':
        return <WalletPage />

      case 'profile':
        return <ProfilePage />

      case 'notifications':
        return <NotificationsPage onBack={() => navigate('feed')} />

      default:
        return <FeedPage onOrderClick={(order) => navigate('order-detail', order)} />
    }
  }

  const hideNav = ['order-detail', 'deal', 'responses', 'payment', 'respond', 'create', 'notifications'].includes(currentPage)

  // Не открыт через Telegram — показываем инструкцию
  if (unauthorized) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f0f', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#e5e5e5', textAlign: 'center', padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>✈️</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
          Откройте через Telegram
        </div>
        <div style={{ fontSize: 15, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
          MicroCreative работает только внутри Telegram.
        </div>
        <a
          href="https://t.me/microcreative_bot"
          style={{
            display: 'inline-block', marginTop: 8,
            padding: '12px 28px', borderRadius: 12,
            background: '#a78bfa', color: '#0f0f0f',
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
          }}
        >
          Открыть бот
        </a>
      </div>
    )
  }

  // Бан — показываем заглушку
  if (banInfo) {
    const isPermanent = banInfo.is_permanent
    const banDate = banInfo.banned_until
      ? new Date(banInfo.banned_until).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
      : null
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f0f', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#e5e5e5', textAlign: 'center', padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>{isPermanent ? '🚫' : '⏳'}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
          {isPermanent ? 'Аккаунт заблокирован' : 'Временная блокировка'}
        </div>
        {isPermanent ? (
          <>
            {banInfo.ban_reason && (
              <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>{banInfo.ban_reason}</div>
            )}
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
              Обратитесь в поддержку: @microcreative_bot
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>
              Ваш аккаунт заблокирован до <strong>{banDate}</strong>
            </div>
            {banInfo.ban_reason && (
              <div style={{ fontSize: 13, color: '#555' }}>Причина: {banInfo.ban_reason}</div>
            )}
          </>
        )}
      </div>
    )
  }

  // Режим обслуживания — показываем заглушку
  if (maintenance) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f0f', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#e5e5e5', textAlign: 'center', padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>🔧</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
          Технические работы
        </div>
        <div style={{ fontSize: 15, color: '#888' }}>Мы скоро вернёмся!</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 8 }}>
          Приносим извинения за неудобства.
        </div>
      </div>
    )
  }

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
