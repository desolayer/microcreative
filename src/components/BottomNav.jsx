import { useStore } from '../store/useStore'
import { useTelegram } from '../hooks/useTelegram'

const tabs = [
  { id: 'feed',          icon: 'ti-layout-grid', label: 'Лента' },
  { id: 'deals',         icon: 'ti-message',     label: 'Сделки' },
  { id: 'create',        icon: null,             label: 'Заказ' },
  { id: 'wallet',        icon: 'ti-wallet',      label: 'Кошелёк' },
  { id: 'notifications', icon: 'ti-bell',        label: 'Уведомления' },
]

export default function BottomNav({ onNavigate }) {
  const { activeTab, setActiveTab, unreadCount } = useStore()
  const { haptic } = useTelegram()

  const handleTab = (id) => {
    haptic('light') // Тактильный отклик на каждый тап
    setActiveTab(id)
    onNavigate?.(id)
  }

  return (
    <nav style={styles.nav}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id

        // Центральная кнопка "+" — особая
        if (tab.id === 'create') {
          return (
            <div key={tab.id} style={styles.tabItem} onClick={() => handleTab('create')}>
              <div style={styles.plusBtn}>
                <i className="ti ti-plus" style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <span style={{ ...styles.label, marginTop: 2 }}>Заказ</span>
            </div>
          )
        }

        return (
          <div key={tab.id} style={styles.tabItem} onClick={() => handleTab(tab.id)}>
            <div style={{ position: 'relative' }}>
              <i
                className={`ti ${tab.icon}`}
                style={{ fontSize: 22, color: isActive ? '#a78bfa' : '#444' }}
              />
              {/* Бейдж непрочитанных для уведомлений */}
              {tab.id === 'notifications' && unreadCount > 0 && (
                <div style={styles.badge}>{unreadCount}</div>
              )}
            </div>
            <span style={{ ...styles.label, color: isActive ? '#a78bfa' : '#444' }}>
              {tab.label}
            </span>
          </div>
        )
      })}
    </nav>
  )
}

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#0f0f0f',
    borderTop: '0.5px solid #1e1e1e',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '10px 0 20px',
    zIndex: 100,
    // Учитываем safe area на iPhone
    paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
  },
  tabItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    padding: '0 16px',
    WebkitTapHighlightColor: 'transparent',
  },
  label: {
    fontSize: 10,
  },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#a78bfa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    boxShadow: '0 0 0 4px #0f0f0f',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    background: '#a78bfa',
    color: '#fff',
    fontSize: 9,
    fontWeight: 500,
    width: 15,
    height: 15,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
