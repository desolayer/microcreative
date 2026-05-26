import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { useStore } from '../store/useStore'
import { ordersAPI } from '../utils/api'

const CATEGORIES = ['Все', 'Дизайн', 'Логотипы', 'Аватарки', 'Соцсети', 'Стикеры']

const CATEGORY_STYLE = {
  'Дизайн':   { color: '#a78bfa', bg: '#1a1333' },
  'Логотипы': { color: '#34d399', bg: '#131e1e' },
  'Соцсети':  { color: '#f59e0b', bg: '#1e1510' },
  'Аватарки': { color: '#f472b6', bg: '#1e1318' },
  'Стикеры':  { color: '#60a5fa', bg: '#0d1929' },
}
const DEFAULT_STYLE = { color: '#94a3b8', bg: '#1a1a2e' }

const USER_COLORS = ['#a78bfa','#34d399','#f59e0b','#f472b6','#60a5fa','#fb923c']

function normalizeOrder(o) {
  const cat = CATEGORY_STYLE[o.category] || DEFAULT_STYLE
  const colorIdx = (o.author_id || 0) % USER_COLORS.length
  const initials = ((o.first_name?.[0] || '') + (o.last_name?.[0] || '')).toUpperCase() || '??'

  const deadlineDays = o.deadline_days || 0
  const deadlineLabel = deadlineDays <= 1 ? `${deadlineDays} день` : `${deadlineDays} дн.`

  return {
    id: o.id,
    type: o.category,
    typeColor: cat.color,
    typeBg: cat.bg,
    price: parseFloat(o.budget),
    currency: o.currency,
    title: o.title,
    desc: o.description,
    user: {
      initials,
      username: o.username ? `@${o.username}` : o.first_name,
      bg: cat.bg,
      color: USER_COLORS[colorIdx],
    },
    rating: parseFloat(o.rating) || 0,
    responds: parseInt(o.responses_count) || 0,
    deadline: deadlineLabel,
    deadlineUrgent: deadlineDays <= 1,
    featured: false,
  }
}

export default function FeedPage({ onOrderClick, onNavigate }) {
  const { user } = useTelegram()
  const { activeCategory, setActiveCategory, unreadCount } = useStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    const category = activeCategory === 'Все' ? undefined : activeCategory
    ordersAPI.getAll(category)
      .then(r => setOrders(r.data.map(normalizeOrder)))
      .catch(() => setError('Не удалось загрузить заказы'))
      .finally(() => setLoading(false))
  }, [activeCategory])

  const filteredOrders = searchQuery.trim()
    ? orders.filter(o =>
        o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.desc || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orders

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.greeting}>Добро пожаловать 👋</div>
          <div style={styles.title}>
            Micro<span style={{ color: '#a78bfa' }}>Creative</span>
          </div>
        </div>
        <div style={styles.notifBtn} onClick={() => onNavigate?.('notifications')}>
          <i className="ti ti-bell" style={{ fontSize: 18, color: unreadCount > 0 ? '#a78bfa' : '#666' }} />
          {unreadCount > 0 && (
            <div style={styles.notifBadge}>{unreadCount > 9 ? '9+' : unreadCount}</div>
          )}
        </div>
      </div>

      <div style={styles.search}>
        <i className="ti ti-search" style={{ fontSize: 16, color: '#444', flexShrink: 0 }} />
        <input
          style={styles.searchInput}
          placeholder="Поиск заказов..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <i
            className="ti ti-x"
            style={{ fontSize: 14, color: '#444', cursor: 'pointer', flexShrink: 0 }}
            onClick={() => setSearchQuery('')}
          />
        )}
      </div>

      <div style={styles.cats}>
        {CATEGORIES.map(cat => (
          <div
            key={cat}
            style={{
              ...styles.cat,
              background: activeCategory === cat ? '#a78bfa' : '#1a1a1a',
              color: activeCategory === cat ? '#fff' : '#666',
              border: activeCategory === cat ? 'none' : '0.5px solid #2a2a2a',
            }}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </div>
        ))}
      </div>

      <div style={styles.sectionTitle}>⚡ Активные заказы</div>

      {loading && (
        <div style={styles.center}>
          <div style={styles.spinner} />
        </div>
      )}

      {error && (
        <div style={styles.center}>
          <span style={{ color: '#555', fontSize: 14 }}>{error}</span>
        </div>
      )}

      {!loading && !error && filteredOrders.length === 0 && (
        <div style={styles.center}>
          <i className="ti ti-inbox" style={{ fontSize: 40, color: '#333' }} />
          <span style={{ color: '#555', fontSize: 14, marginTop: 12 }}>
            {searchQuery ? 'Ничего не найдено' : 'Заказов пока нет'}
          </span>
        </div>
      )}

      {filteredOrders.map(order => (
        <OrderCard key={order.id} order={order} onClick={() => onOrderClick?.(order)} />
      ))}

      <div style={{ height: 90 }} />
    </div>
  )
}

function OrderCard({ order, onClick }) {
  const priceLabel = order.currency === 'STARS'
    ? `${order.price.toLocaleString('ru')} ⭐`
    : order.currency === 'TON'
    ? `${order.price} TON`
    : order.currency === 'USDT'
    ? `$${order.price}`
    : `${order.price.toLocaleString('ru')} ₽`

  const mcId = `#MC-${String(order.id).padStart(6, '0')}`

  return (
    <div
      style={{
        ...styles.card,
        border: order.featured ? '0.5px solid #3d2f6e' : '0.5px solid #262626',
      }}
      onClick={onClick}
    >
      {order.featured && <div style={styles.featuredLabel}>★ Продвигается</div>}
      <div style={styles.cardTop}>
        <span style={{ ...styles.badge, background: order.typeBg, color: order.typeColor }}>
          {order.type}
        </span>
        <span style={styles.price}>{priceLabel}</span>
      </div>
      <div style={styles.cardId}>{mcId}</div>
      <div style={styles.cardTitle}>{order.title}</div>
      <div style={styles.cardDesc}>{order.desc}</div>
      <div style={styles.cardFooter}>
        <div style={styles.cardUser}>
          <div style={{ ...styles.avatar, background: order.user.bg, color: order.user.color }}>
            {order.user.initials}
          </div>
          <span style={styles.username}>{order.user.username}</span>
        </div>
        <div style={styles.cardMeta}>
          {order.rating > 0 && (
            <div style={styles.metaItem}>
              <i className="ti ti-star" style={{ fontSize: 13, color: '#f59e0b' }} />
              <span>{order.rating.toFixed(1)}</span>
            </div>
          )}
          <div style={styles.metaItem}>
            <i className="ti ti-users" style={{ fontSize: 13 }} />
            <span>{order.responds}</span>
          </div>
        </div>
      </div>
      <div style={styles.deadline}>
        <div style={{ ...styles.deadlineDot, background: order.deadlineUrgent ? '#f59e0b' : '#34d399' }} />
        <span>Дедлайн через {order.deadline}</span>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '0', overflowX: 'hidden' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '16px 20px 12px', position: 'sticky', top: 0,
    background: '#0f0f0f', zIndex: 50,
  },
  greeting: { fontSize: 13, color: '#555', marginBottom: 2 },
  title: { fontSize: 22, fontWeight: 500 },
  notifBtn: {
    position: 'relative',
    width: 36, height: 36, borderRadius: '50%',
    background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    flexShrink: 0,
  },
  notifBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    background: '#a78bfa', color: '#fff',
    fontSize: 9, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 3px',
  },
  search: {
    margin: '0 20px 16px', background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    borderRadius: 12, padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    fontSize: 14, color: '#e5e5e5', fontFamily: 'inherit',
  },
  cats: { display: 'flex', gap: 8, padding: '0 20px 20px', overflowX: 'auto' },
  cat: {
    whiteSpace: 'nowrap', padding: '6px 14px', borderRadius: 20,
    fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
  },
  sectionTitle: {
    padding: '0 20px 12px', fontSize: 11, fontWeight: 500,
    color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: 200,
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '2px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.7s linear infinite',
  },
  card: {
    margin: '0 20px 12px', background: '#171717',
    borderRadius: 16, padding: 16, cursor: 'pointer',
  },
  featuredLabel: { fontSize: 10, color: '#a78bfa', fontWeight: 500, marginBottom: 6 },
  cardId: { fontSize: 10, color: '#444', marginBottom: 4, fontVariantNumeric: 'tabular-nums' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  badge: { fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 6 },
  price: { fontSize: 17, fontWeight: 500, color: '#a78bfa' },
  cardTitle: { fontSize: 15, fontWeight: 500, color: '#e5e5e5', marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#555', lineHeight: 1.5, marginBottom: 12 },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardUser: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: {
    width: 24, height: 24, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 500,
  },
  username: { fontSize: 12, color: '#555' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 12 },
  metaItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#444' },
  deadline: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: '#444', marginTop: 10,
    paddingTop: 10, borderTop: '0.5px solid #222',
  },
  deadlineDot: { width: 6, height: 6, borderRadius: '50%' },
}
