import { useState, useEffect } from 'react'
import { notificationsAPI } from '../utils/api'
import { useStore } from '../store/useStore'

const TYPE_ICON = {
  new_response:   { icon: 'ti-message-2',    color: '#a78bfa' },
  deal_created:   { icon: 'ti-handshake',    color: '#34d399' },
  deal_complete:  { icon: 'ti-circle-check', color: '#34d399' },
  deal_cancelled: { icon: 'ti-circle-x',     color: '#f87171' },
  dispute:        { icon: 'ti-alert-triangle',color: '#f59e0b' },
  message:        { icon: 'ti-message',      color: '#60a5fa' },
  payment_received:{ icon: 'ti-coin',        color: '#34d399' },
  withdrawal:     { icon: 'ti-arrow-up-circle', color: '#a78bfa' },
  system:         { icon: 'ti-bell',         color: '#555' },
}
const DEFAULT_ICON = { icon: 'ti-bell', color: '#555' }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1)  return 'только что'
  if (m < 60) return `${m} мин. назад`
  if (h < 24) return `${h} ч. назад`
  return `${d} дн. назад`
}

export default function NotificationsPage({ onBack }) {
  const { setUnreadCount } = useStore()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    notificationsAPI.getAll()
      .then(r => {
        setItems(r.data.notifications || [])
        // Сбрасываем счётчик непрочитанных
        if ((r.data.unread || 0) > 0) {
          notificationsAPI.readAll().catch(() => {})
          setUnreadCount(0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={styles.page}>
      {/* Шапка */}
      <div style={styles.header}>
        <button style={styles.back} onClick={onBack}>
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </button>
        <div style={styles.title}>Уведомления</div>
        <div style={{ width: 36 }} />
      </div>

      {/* Контент */}
      {loading && (
        <div style={styles.center}>
          <div style={styles.spinner} />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={styles.center}>
          <i className="ti ti-bell-off" style={{ fontSize: 44, color: '#2a2a2a' }} />
          <span style={{ color: '#444', fontSize: 14, marginTop: 14 }}>
            Нет уведомлений
          </span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={styles.list}>
          {items.map(item => {
            const { icon, color } = TYPE_ICON[item.type] || DEFAULT_ICON
            const unread = !item.is_read
            return (
              <div key={item.id} style={{ ...styles.item, background: unread ? '#151515' : '#111' }}>
                <div style={{ ...styles.iconWrap, background: color + '18' }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
                </div>
                <div style={styles.itemBody}>
                  <div style={styles.itemTitle}>{item.title}</div>
                  {item.body && <div style={styles.itemText}>{item.body}</div>}
                  <div style={styles.itemTime}>{timeAgo(item.created_at)}</div>
                </div>
                {unread && <div style={styles.dot} />}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 32 }} />
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', position: 'sticky', top: 0,
    background: '#0f0f0f', borderBottom: '0.5px solid #1a1a1a', zIndex: 50,
  },
  back: {
    width: 36, height: 36, borderRadius: '50%',
    background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#e5e5e5',
  },
  title: { fontSize: 16, fontWeight: 600 },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: 300,
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '2px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.7s linear infinite',
  },
  list: { padding: '8px 0' },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 16px', borderBottom: '0.5px solid #181818',
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: 500, color: '#e5e5e5', marginBottom: 3 },
  itemText: {
    fontSize: 13, color: '#666', lineHeight: 1.4,
    overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  itemTime: { fontSize: 11, color: '#444', marginTop: 5 },
  dot: {
    width: 7, height: 7, borderRadius: '50%',
    background: '#a78bfa', flexShrink: 0, marginTop: 6,
  },
}
