import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'
import { profileAPI, ordersAPI } from '../utils/api'

const NOTIF_LIST = [
  { key: 'notif_responses', icon: '🔔', label: 'Новые отклики на мои заказы' },
  { key: 'notif_messages',  icon: '💬', label: 'Новые сообщения в сделках' },
  { key: 'notif_balance',   icon: '💰', label: 'Изменения баланса' },
  { key: 'notif_deals',     icon: '🎉', label: 'Сделка завершена' },
]

export default function ProfilePage() {
  const { user, balance } = useStore()
  const { haptic } = useTelegram()
  const [view, setView]         = useState('profile') // 'profile' | 'support' | 'notifications' | 'orders'
  const [supportText, setSupportText] = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')

  // Notification settings state
  const [notifs, setNotifs]         = useState({
    notif_responses: true,
    notif_messages:  true,
    notif_balance:   true,
    notif_deals:     true,
  })
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaved, setNotifSaved]     = useState(false)

  // My orders state
  const [myOrders, setMyOrders]         = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Load my orders when switching to that view
  useEffect(() => {
    if (view !== 'orders') return
    setOrdersLoading(true)
    ordersAPI.getMine()
      .then(r => setMyOrders(r.data))
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  }, [view])

  // Load notif settings when switching to that view
  useEffect(() => {
    if (view !== 'notifications') return
    profileAPI.getNotifSettings()
      .then(r => setNotifs({
        notif_responses: r.data.notif_responses ?? true,
        notif_messages:  r.data.notif_messages  ?? true,
        notif_balance:   r.data.notif_balance   ?? true,
        notif_deals:     r.data.notif_deals     ?? true,
      }))
      .catch(() => {})
  }, [view])

  const toggleNotif = async (key) => {
    const next = { ...notifs, [key]: !notifs[key] }
    setNotifs(next)
    haptic('light')
    setNotifLoading(true)
    setNotifSaved(false)
    try {
      await profileAPI.saveNotifSettings(next)
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 2000)
    } catch { /* silently ignore */ }
    finally { setNotifLoading(false) }
  }

  const name = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : 'Загрузка...'
  const username = user?.username ? `@${user.username}` : null

  const sendSupport = async () => {
    if (!supportText.trim()) return
    haptic('medium')
    setSending(true)
    setError('')
    try {
      await api.post('/support', { message: supportText.trim() })
      setSent(true)
      setSupportText('')
    } catch (e) {
      setError(e?.response?.data?.error || 'Не удалось отправить. Попробуй ещё раз.')
    } finally {
      setSending(false)
    }
  }

  // ── My orders view ──────────────────────────────────
  if (view === 'orders') {
    const STATUS_LABEL = {
      pending_review: { text: '⏳ На модерации', color: '#f59e0b', bg: '#1e1510' },
      open:           { text: '✅ Опубликован',  color: '#34d399', bg: '#0d1a14' },
      in_progress:    { text: '🔄 В работе',     color: '#60a5fa', bg: '#0d1525' },
      completed:      { text: '✔ Завершён',      color: '#a78bfa', bg: '#1a1333' },
      rejected:       { text: '❌ Отклонён',     color: '#f87171', bg: '#1e0e0e' },
      cancelled:      { text: '🚫 Отменён',      color: '#555',    bg: '#1a1a1a' },
    }
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => setView('profile')}>
            <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
          </button>
          <span style={s.headerTitle}>Мои заказы</span>
          <div style={{ width: 36 }} />
        </div>
        <div style={s.body}>
          {ordersLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <div style={s.spinner} />
            </div>
          )}
          {!ordersLoading && myOrders.length === 0 && (
            <div style={{ color: '#444', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
              Вы ещё не создавали заказов
            </div>
          )}
          {!ordersLoading && myOrders.map(o => {
            const st = STATUS_LABEL[o.status] || { text: o.status, color: '#555', bg: '#1a1a1a' }
            return (
              <div key={o.id} style={s.orderCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#e5e5e5', flex: 1, marginRight: 8 }}>
                    {o.title}
                  </span>
                  <span style={{ ...s.statusBadge, background: st.bg, color: st.color }}>
                    {st.text}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: o.rejection_reason ? 6 : 0 }}>
                  {o.category} · {o.budget} {o.currency} · 💬 {o.responses_count || 0} откликов
                </div>
                {o.rejection_reason && (
                  <div style={{ fontSize: 12, color: '#f87171', marginTop: 4, lineHeight: 1.4 }}>
                    Причина: {o.rejection_reason}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Notifications view ──────────────────────────────
  if (view === 'notifications') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => setView('profile')}>
            <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
          </button>
          <span style={s.headerTitle}>Уведомления</span>
          <div style={{ width: 36 }} />
        </div>
        <div style={s.body}>
          <div style={s.section}>
            <div style={s.sectionTitle}>Telegram-уведомления от бота</div>
            <div style={s.balanceCard}>
              {NOTIF_LIST.map(({ key, icon, label }, i) => (
                <div key={key} style={{
                  ...s.balanceRow,
                  borderBottom: i < NOTIF_LIST.length - 1 ? '0.5px solid #222' : 'none',
                }}>
                  <span style={{ fontSize: 14, color: '#ccc' }}>{icon} {label}</span>
                  <div
                    style={{
                      ...s.toggle,
                      background: notifs[key] ? '#a78bfa' : '#2a2a2a',
                    }}
                    onClick={() => toggleNotif(key)}
                  >
                    <div style={{
                      ...s.toggleThumb,
                      transform: notifs[key] ? 'translateX(20px)' : 'translateX(2px)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {notifSaved && (
            <div style={{ color: '#22c55e', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
              ✓ Настройки сохранены
            </div>
          )}
          <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, marginTop: 12 }}>
            Уведомления приходят от бота в Telegram. Отключение не влияет на уведомления внутри приложения.
          </div>
        </div>
      </div>
    )
  }

  if (view === 'support') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => { setView('profile'); setSent(false); setError('') }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
          </button>
          <span style={s.headerTitle}>Поддержка</span>
          <div style={{ width: 36 }} />
        </div>

        <div style={s.body}>
          {sent ? (
            <div style={s.successBox}>
              <i className="ti ti-circle-check" style={{ fontSize: 48, color: '#34d399' }} />
              <div style={s.successTitle}>Обращение отправлено!</div>
              <div style={s.successSub}>Мы ответим вам в течение 24 часов через бота.</div>
              <button style={s.btn} onClick={() => { setSent(false); setView('profile') }}>
                Хорошо
              </button>
            </div>
          ) : (
            <>
              <div style={s.supportHint}>
                Опишите проблему — мы ответим в Telegram через бота.
              </div>
              <textarea
                style={s.textarea}
                placeholder="Опишите вашу проблему или вопрос..."
                value={supportText}
                maxLength={2000}
                onChange={e => setSupportText(e.target.value)}
                autoFocus
              />
              <div style={s.charCount}>{supportText.length}/2000</div>
              {error && <div style={s.error}>{error}</div>}
              <button
                style={{ ...s.btn, opacity: (!supportText.trim() || sending) ? 0.4 : 1 }}
                disabled={!supportText.trim() || sending}
                onClick={sendSupport}
              >
                {sending ? 'Отправляю...' : '📨 Отправить'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ width: 36 }} />
        <span style={s.headerTitle}>Профиль</span>
        <div style={{ width: 36 }} />
      </div>

      <div style={s.body}>
        {/* Аватар и имя */}
        <div style={s.avatarSection}>
          <div style={s.avatar}>
            {user?.photo_url
              ? <img src={user.photo_url} alt="" style={s.avatarImg} />
              : <span style={s.avatarLetter}>
                  {(user?.first_name?.[0] || '?').toUpperCase()}
                </span>
            }
            {user?.is_verified && (
              <div style={s.verifiedBadge} title="Верифицированный исполнитель">✓</div>
            )}
          </div>
          <div style={s.userName}>{name}</div>
          {username && <div style={s.userHandle}>{username}</div>}
        </div>

        {/* Статистика */}
        <div style={s.statsRow}>
          <div style={s.statBox}>
            <div style={s.statVal}>{user?.completed_deals || 0}</div>
            <div style={s.statLabel}>Сделок</div>
          </div>
          <div style={s.statDivider} />
          <div style={s.statBox}>
            <div style={s.statVal}>
              {user?.rating ? parseFloat(user.rating).toFixed(1) : '—'}
            </div>
            <div style={s.statLabel}>Рейтинг</div>
          </div>
          <div style={s.statDivider} />
          <div style={s.statBox}>
            <div style={s.statVal}>{user?.reviews_count || 0}</div>
            <div style={s.statLabel}>Отзывов</div>
          </div>
        </div>

        {/* Баланс */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Баланс</div>
          <div style={s.balanceCard}>
            {balance.rub > 0 && (
              <div style={s.balanceRow}>
                <span style={s.balanceLabel}>Рубли</span>
                <span style={s.balanceVal}>{balance.rub.toLocaleString('ru')} ₽</span>
              </div>
            )}
            {balance.usdt > 0 && (
              <div style={s.balanceRow}>
                <span style={s.balanceLabel}>USDT</span>
                <span style={s.balanceVal}>${balance.usdt.toFixed(2)}</span>
              </div>
            )}
            {balance.ton > 0 && (
              <div style={s.balanceRow}>
                <span style={s.balanceLabel}>TON</span>
                <span style={s.balanceVal}>{balance.ton.toFixed(4)}</span>
              </div>
            )}
            {balance.stars > 0 && (
              <div style={s.balanceRow}>
                <span style={s.balanceLabel}>Stars</span>
                <span style={s.balanceVal}>⭐ {balance.stars}</span>
              </div>
            )}
            {balance.rub === 0 && balance.usdt === 0 && balance.ton === 0 && balance.stars === 0 && (
              <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: 8 }}>
                Баланс пустой
              </div>
            )}
          </div>
        </div>

        {/* Кнопки */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            style={s.supportBtn}
            onClick={() => { haptic('light'); setView('orders') }}
          >
            <i className="ti ti-list" style={{ fontSize: 18, marginRight: 8 }} />
            📋 Мои заказы
          </button>
          <button
            style={s.supportBtn}
            onClick={() => { haptic('light'); setView('notifications') }}
          >
            <i className="ti ti-bell" style={{ fontSize: 18, marginRight: 8 }} />
            🔔 Уведомления
          </button>
          <button
            style={s.supportBtn}
            onClick={() => { haptic('light'); setView('support') }}
          >
            <i className="ti ti-headset" style={{ fontSize: 18, marginRight: 8 }} />
            🆘 Поддержка
          </button>
        </div>
      </div>

      <div style={{ height: 90 }} />
    </div>
  )
}

const s = {
  page:   { minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 12px', position: 'sticky', top: 0,
    background: '#0f0f0f', zIndex: 50, borderBottom: '0.5px solid #1a1a1a',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: '50%', background: '#1a1a1a',
    border: '0.5px solid #2a2a2a', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: '#e5e5e5',
  },
  headerTitle: { fontSize: 16, fontWeight: 500 },
  body: { padding: '20px 20px 0' },

  avatarSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: '50%', background: '#1a1333', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarImg: { width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' },
  avatarLetter: { fontSize: 32, color: '#a78bfa', fontWeight: 500 },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 20, height: 20, borderRadius: '50%',
    background: '#a78bfa', color: '#fff',
    fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #0f0f0f',
  },
  userName:   { fontSize: 18, fontWeight: 500, color: '#e5e5e5' },
  userHandle: { fontSize: 13, color: '#555', marginTop: 2 },

  statsRow:    { display: 'flex', background: '#171717', borderRadius: 16,
                 border: '0.5px solid #262626', marginBottom: 20 },
  statBox:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0' },
  statVal:     { fontSize: 20, fontWeight: 600, color: '#e5e5e5' },
  statLabel:   { fontSize: 11, color: '#555', marginTop: 2 },
  statDivider: { width: '0.5px', background: '#262626', margin: '10px 0' },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 11, color: '#555', fontWeight: 500, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 8 },
  balanceCard:  { background: '#171717', borderRadius: 16, border: '0.5px solid #262626', padding: '4px 0' },
  balanceRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', borderBottom: '0.5px solid #222' },
  balanceLabel: { fontSize: 14, color: '#777' },
  balanceVal:   { fontSize: 14, color: '#e5e5e5', fontWeight: 500 },

  supportBtn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    color: '#e5e5e5', fontSize: 15, cursor: 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  toggle: {
    width: 44, height: 26, borderRadius: 13,
    cursor: 'pointer', position: 'relative',
    transition: 'background 0.2s', flexShrink: 0,
    display: 'flex', alignItems: 'center',
  },
  toggleThumb: {
    width: 22, height: 22, borderRadius: '50%',
    background: '#fff', position: 'absolute',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '2px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.7s linear infinite',
  },
  orderCard: {
    background: '#171717', border: '0.5px solid #262626',
    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
  },
  statusBadge: {
    fontSize: 11, fontWeight: 500, padding: '3px 8px',
    borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
  },
  supportHint: { fontSize: 14, color: '#555', marginBottom: 16, lineHeight: 1.5 },
  textarea: {
    width: '100%', minHeight: 140, background: '#1a1a1a',
    border: '0.5px solid #2a2a2a', borderRadius: 12,
    padding: '12px 14px', color: '#e5e5e5', fontSize: 14,
    fontFamily: 'inherit', resize: 'none', outline: 'none',
    boxSizing: 'border-box',
  },
  charCount: { fontSize: 11, color: '#444', textAlign: 'right', marginTop: 4, marginBottom: 12 },
  error:     { color: '#f87171', fontSize: 13, marginBottom: 10 },
  btn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: '#a78bfa', border: 'none', color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    marginTop: 4,
  },
  successBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh', textAlign: 'center',
  },
  successTitle: { fontSize: 18, fontWeight: 500, color: '#e5e5e5', marginTop: 16 },
  successSub:   { fontSize: 14, color: '#555', marginTop: 8, marginBottom: 24, lineHeight: 1.5 },
}
