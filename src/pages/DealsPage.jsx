import { useState, useEffect } from 'react'
import { dealsAPI } from '../utils/api'
import { useStore } from '../store/useStore'

const STATUS_COLOR = {
  pending:   '#f59e0b',
  active:    '#22c55e',
  submitted: '#3b82f6',
  completed: '#a78bfa',
  cancelled: '#6b7280',
  disputed:  '#ef4444',
}
const STATUS_LABEL = {
  pending:   'Ожидает',
  active:    'В работе',
  submitted: 'На проверке',
  completed: 'Завершена',
  cancelled: 'Отменена',
  disputed:  'Спор',
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'только что'
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч`
  const d = Math.floor(h / 24)
  if (d === 1) return 'вчера'
  return `${d} дн`
}

function getInitial(name) {
  return (name || '?')[0].toUpperCase()
}

const AVATAR_COLORS = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed']

export default function DealsPage({ onDealClick }) {
  const { user, setDeals: storeSetDeals } = useStore()
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    dealsAPI.getAll()
      .then(r => {
        setDeals(r.data)
        storeSetDeals(r.data)
      })
      .catch(() => setError('Не удалось загрузить сделки'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={st.page}>
      <div style={st.header}><div style={st.headerTitle}>Сделки</div></div>
      <div style={st.center}><div style={st.spinner} /></div>
    </div>
  )

  const active    = deals.filter(d => ['pending','active','submitted','disputed'].includes(d.status))
  const completed = deals.filter(d => ['completed','cancelled'].includes(d.status))

  return (
    <div style={st.page}>
      <div style={st.header}>
        <div style={st.headerTitle}>Сделки</div>
        {deals.length > 0 && <div style={st.countBadge}>{deals.length}</div>}
      </div>

      {error && <p style={st.errorMsg}>{error}</p>}

      {deals.length === 0 && !error && (
        <div style={st.empty}>
          <i className="ti ti-message-off" style={{ fontSize: 52, color: '#2a2a2a' }} />
          <p style={{ color: '#555', marginTop: 14, fontSize: 15 }}>Сделок пока нет</p>
          <p style={{ color: '#3a3a3a', fontSize: 13, marginTop: 4 }}>
            Примите отклик на заказ или откликнитесь сами
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div style={st.section}>
          <div style={st.sectionLabel}>Активные</div>
          {active.map(deal => (
            <DealRow key={deal.id} deal={deal} user={user} onPress={onDealClick} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div style={st.section}>
          <div style={st.sectionLabel}>Завершённые</div>
          {completed.map(deal => (
            <DealRow key={deal.id} deal={deal} user={user} onPress={onDealClick} />
          ))}
        </div>
      )}

      <div style={{ height: 32 }} />
    </div>
  )
}

function DealRow({ deal, user, onPress }) {
  const isClient     = user && deal.client_id === user.id
  const otherName    = isClient
    ? (deal.freelancer_first_name || deal.freelancer_username || 'Исполнитель')
    : (deal.client_first_name     || deal.client_username     || 'Заказчик')
  const otherPhoto   = isClient ? deal.freelancer_photo : deal.client_photo
  const otherColorSeed = isClient ? deal.freelancer_id : deal.client_id
  const avatarColor  = AVATAR_COLORS[(otherColorSeed || 0) % AVATAR_COLORS.length]

  const unread = parseInt(deal.unread_count || 0)
  const statusColor = STATUS_COLOR[deal.status] || '#888'

  return (
    <div style={st.row} onClick={() => onPress?.(deal.id)}>
      {/* Avatar */}
      <div style={st.avatarWrap}>
        {otherPhoto ? (
          <img src={otherPhoto} style={st.avatarImg} alt="" />
        ) : (
          <div style={{ ...st.avatarFallback, background: avatarColor + '22', color: avatarColor }}>
            {getInitial(otherName)}
          </div>
        )}
        {/* Status dot */}
        <div style={{ ...st.statusDot, background: statusColor }} />
      </div>

      {/* Content */}
      <div style={st.rowContent}>
        <div style={st.rowTop}>
          <div style={st.rowName}>{otherName}</div>
          <div style={st.rowTime}>{timeAgo(deal.updated_at)}</div>
        </div>
        <div style={st.rowBottom}>
          <div style={st.rowPreview}>
            <span style={{ ...st.statusTag, background: statusColor + '22', color: statusColor }}>
              {STATUS_LABEL[deal.status] || deal.status}
            </span>
            <span style={st.rowOrderTitle}>{deal.order_title}</span>
          </div>
          {unread > 0 && (
            <div style={st.unreadBadge}>{unread > 99 ? '99+' : unread}</div>
          )}
        </div>
      </div>
    </div>
  )
}

const st = {
  page: { minHeight: '100vh', background: '#0f0f0f', fontFamily: 'inherit' },

  header: {
    padding: '20px 20px 12px',
    background: '#0f0f0f',
    borderBottom: '0.5px solid #1a1a1a',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: 700, color: '#e5e5e5', flex: 1 },
  countBadge: {
    background: '#1e1e1e', color: '#888', fontSize: 12, fontWeight: 600,
    padding: '3px 9px', borderRadius: 20, border: '0.5px solid #2a2a2a',
  },

  center: { display: 'flex', justifyContent: 'center', padding: 48 },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '3px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.8s linear infinite',
  },

  errorMsg: { color: '#ef4444', padding: '12px 20px', margin: 0 },

  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '72px 24px', textAlign: 'center',
  },

  section:      { marginTop: 8 },
  sectionLabel: {
    fontSize: 11, color: '#444', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '10px 20px 6px',
  },

  row: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 20px', cursor: 'pointer',
    borderBottom: '0.5px solid #141414',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.1s',
  },

  // Avatar
  avatarWrap:    { position: 'relative', flexShrink: 0 },
  avatarImg:     { width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', display: 'block' },
  avatarFallback: {
    width: 50, height: 50, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700,
  },
  statusDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: '50%',
    border: '2px solid #0f0f0f',
  },

  // Row content
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  rowName: {
    fontSize: 15, fontWeight: 600, color: '#e5e5e5',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    flex: 1, marginRight: 8,
  },
  rowTime: { fontSize: 11, color: '#555', flexShrink: 0 },

  rowBottom: { display: 'flex', alignItems: 'center', gap: 6 },
  rowPreview: {
    display: 'flex', alignItems: 'center', gap: 6,
    flex: 1, minWidth: 0, overflow: 'hidden',
  },
  statusTag: {
    fontSize: 10, fontWeight: 600, padding: '2px 7px',
    borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap',
  },
  rowOrderTitle: {
    fontSize: 13, color: '#666',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    background: '#a78bfa', color: '#0f0f0f',
    fontSize: 10, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 5px', flexShrink: 0,
  },
}
