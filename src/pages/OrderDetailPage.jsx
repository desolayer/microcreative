import { useState, useEffect } from 'react'
import { ordersAPI } from '../utils/api'
import { useStore } from '../store/useStore'
import { useTelegram } from '../hooks/useTelegram'

const CATEGORY_STYLE = {
  'Дизайн':   { color: '#a78bfa', bg: '#1a1333' },
  'Логотипы': { color: '#34d399', bg: '#131e1e' },
  'Соцсети':  { color: '#f59e0b', bg: '#1e1510' },
  'Аватарки': { color: '#f472b6', bg: '#1e1318' },
  'Стикеры':  { color: '#60a5fa', bg: '#0d1929' },
}
const DEFAULT_STYLE = { color: '#94a3b8', bg: '#1a1a2e' }
const USER_COLORS   = ['#a78bfa','#34d399','#f59e0b','#f472b6','#60a5fa','#fb923c']

function priceLabel(budget, currency) {
  const n = parseFloat(budget)
  if (currency === 'STARS') return `${n.toLocaleString('ru')} ⭐`
  if (currency === 'TON')   return `${n} TON`
  if (currency === 'USDT')  return `$${n}`
  return `${n.toLocaleString('ru')} ₽`
}

function deadlineLabel(days) {
  if (!days) return '—'
  if (days === 1) return '1 день'
  if (days <= 4)  return `${days} дня`
  return `${days} дней`
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return 'только что'
  if (h < 24) return `${h} ч. назад`
  const d = Math.floor(h / 24)
  if (d === 1) return 'вчера'
  return `${d} дн. назад`
}

// ── Основной компонент ───────────────────────────────────
export default function OrderDetailPage({ orderId, onBack }) {
  const { user }   = useStore()
  const { haptic } = useTelegram()

  const [order,         setOrder]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [view,          setView]          = useState('detail') // 'detail' | 'respond' | 'success'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [deleteError,   setDeleteError]   = useState('')

  useEffect(() => {
    setLoading(true)
    ordersAPI.getOne(orderId)
      .then(r => setOrder(r.data))
      .catch(() => setError('Не удалось загрузить заказ'))
      .finally(() => setLoading(false))
  }, [orderId])

  const handleDelete = async () => {
    haptic('heavy')
    setDeleting(true)
    setDeleteError('')
    try {
      await ordersAPI.deleteOrder(orderId)
      onBack(true) // true = force refresh feed
    } catch (e) {
      setDeleteError(e?.response?.data?.error || 'Не удалось удалить заказ')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  // ── Загрузка / ошибка ───────────────────────────────
  if (loading) return (
    <div style={s.page}>
      <Header onBack={onBack} title="Заказ" />
      <div style={s.center}><div style={s.spinner} /></div>
    </div>
  )

  if (error || !order) return (
    <div style={s.page}>
      <Header onBack={onBack} title="Заказ" />
      <div style={s.center}>
        <i className="ti ti-alert-circle" style={{ fontSize: 40, color: '#333' }} />
        <div style={{ color: '#555', fontSize: 14, marginTop: 12 }}>{error || 'Заказ не найден'}</div>
        <button style={s.retryBtn} onClick={() => { setError(null); setLoading(true); ordersAPI.getOne(orderId).then(r => setOrder(r.data)).catch(() => setError('Ошибка')).finally(() => setLoading(false)) }}>
          Повторить
        </button>
      </div>
    </div>
  )

  const isOwn   = user && order.author_id === user.id
  const isAdmin = user?.is_admin === true

  if (view === 'respond') return (
    <RespondView
      order={order}
      onBack={() => { haptic('light'); setView('detail') }}
      onSuccess={() => { setView('success') }}
    />
  )

  if (view === 'success') return (
    <div style={s.page}>
      <Header onBack={onBack} title="Отклик" />
      <div style={{ ...s.center, minHeight: '70vh' }}>
        <i className="ti ti-circle-check" style={{ fontSize: 56, color: '#34d399' }} />
        <div style={s.successTitle}>Отклик отправлен!</div>
        <div style={s.successSub}>Заказчик рассмотрит ваш отклик и свяжется с вами.</div>
        <button style={s.primaryBtn} onClick={() => { haptic('light'); onBack() }}>
          Вернуться в ленту
        </button>
      </div>
    </div>
  )

  // ── Детали заказа ────────────────────────────────────
  const cat      = CATEGORY_STYLE[order.category] || DEFAULT_STYLE
  const colorIdx = (order.author_id || 0) % USER_COLORS.length
  const initials = ((order.first_name?.[0] || '') + (order.last_name?.[0] || '')).toUpperCase() || '?'

  return (
    <div style={s.page}>
      <Header onBack={onBack} title="Заказ" />

      <div style={s.body}>
        {/* Категория + дата */}
        <div style={s.topRow}>
          <span style={{ ...s.badge, background: cat.bg, color: cat.color }}>
            {order.category}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.mcId}>{`#MC-${String(order.id).padStart(6, '0')}`}</span>
            <span style={s.timeAgo}>{timeAgo(order.created_at)}</span>
          </div>
        </div>

        {/* Заголовок */}
        <h1 style={s.title}>{order.title}</h1>

        {/* Цена */}
        <div style={s.priceCard}>
          <div style={s.priceLabel}>Бюджет</div>
          <div style={s.priceValue}>{priceLabel(order.budget, order.currency)}</div>
        </div>

        {/* Метрики */}
        <div style={s.metaRow}>
          <div style={s.metaBox}>
            <i className="ti ti-clock" style={{ fontSize: 16, color: '#a78bfa' }} />
            <div style={s.metaVal}>{deadlineLabel(order.deadline_days)}</div>
            <div style={s.metaKey}>Дедлайн</div>
          </div>
          <div style={s.metaDivider} />
          <div style={s.metaBox}>
            <i className="ti ti-users" style={{ fontSize: 16, color: '#a78bfa' }} />
            <div style={s.metaVal}>{order.responses_count || 0}</div>
            <div style={s.metaKey}>Откликов</div>
          </div>
          <div style={s.metaDivider} />
          <div style={s.metaBox}>
            <i className="ti ti-circle-dot" style={{ fontSize: 16, color: order.status === 'open' ? '#34d399' : '#555' }} />
            <div style={{ ...s.metaVal, color: order.status === 'open' ? '#34d399' : '#555' }}>
              {order.status === 'open' ? 'Открыт' : 'Закрыт'}
            </div>
            <div style={s.metaKey}>Статус</div>
          </div>
        </div>

        {/* Описание */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Описание</div>
          <div style={s.description}>{order.description}</div>
        </div>

        {/* Заказчик */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Заказчик</div>
          <div style={s.clientCard}>
            <div style={s.clientLeft}>
              {order.photo_url
                ? <img src={order.photo_url} alt="" style={s.clientAvatar} />
                : (
                  <div style={{ ...s.clientAvatarFallback, background: cat.bg, color: USER_COLORS[colorIdx] }}>
                    {initials}
                  </div>
                )
              }
              <div>
                <div style={s.clientName}>
                  {[order.first_name, order.last_name].filter(Boolean).join(' ')}
                </div>
                {order.username && (
                  <div style={s.clientHandle}>@{order.username}</div>
                )}
              </div>
            </div>
            <div style={s.clientStats}>
              {parseFloat(order.rating) > 0 && (
                <div style={s.clientStat}>
                  <i className="ti ti-star-filled" style={{ fontSize: 13, color: '#f59e0b' }} />
                  <span>{parseFloat(order.rating).toFixed(1)}</span>
                </div>
              )}
              {order.completed_deals > 0 && (
                <div style={s.clientStat}>
                  <i className="ti ti-briefcase" style={{ fontSize: 13, color: '#a78bfa' }} />
                  <span>{order.completed_deals}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 110 }} />
      </div>

      {/* Нижняя панель */}
      <div style={s.footer}>
        {deleteError && (
          <div style={s.deleteError}>{deleteError}</div>
        )}

        {/* Подтверждение удаления */}
        {confirmDelete ? (
          <div style={s.confirmBox}>
            <div style={s.confirmText}>
              Вы уверены? Это действие нельзя отменить.
            </div>
            <div style={s.confirmBtns}>
              <button
                style={s.cancelBtn}
                onClick={() => { haptic('light'); setConfirmDelete(false) }}
              >
                Отмена
              </button>
              <button
                style={{ ...s.deleteBtn, opacity: deleting ? 0.5 : 1 }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Удаляю...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        ) : isOwn ? (
          /* Владелец: кнопка откликов + удаление */
          <>
            <button
              style={s.primaryBtn}
              onClick={() => { haptic('medium'); onBack('responses', order.id) }}
            >
              <i className="ti ti-users" style={{ fontSize: 16, marginRight: 8 }} />
              Смотреть отклики · {order.responses_count || 0}
            </button>
            <button
              style={{ ...s.deleteBtn, marginTop: 8 }}
              onClick={() => { haptic('medium'); setConfirmDelete(true) }}
            >
              🗑 Удалить заказ
            </button>
          </>
        ) : isAdmin && order.status !== 'cancelled' ? (
          /* Только для чужих заказов — кнопка модератора */
          <button
            style={s.adminDeleteBtn}
            onClick={() => { haptic('medium'); setConfirmDelete(true) }}
          >
            ⚠️ Удалить заказ (админ)
          </button>
        ) : order.status !== 'open' ? (
          <div style={s.ownNote}>
            <i className="ti ti-lock" style={{ fontSize: 15, marginRight: 6 }} />
            Заказ уже закрыт
          </div>
        ) : (
          <button
            style={s.primaryBtn}
            onClick={() => { haptic('medium'); setView('respond') }}
          >
            <i className="ti ti-send" style={{ fontSize: 17, marginRight: 8 }} />
            Откликнуться
          </button>
        )}
      </div>
    </div>
  )
}

// ── Форма отклика ────────────────────────────────────────
function RespondView({ order, onBack, onSuccess }) {
  const { haptic } = useTelegram()
  const [message,  setMessage]  = useState('')
  const [price,    setPrice]    = useState('')
  const [currency, setCurrency] = useState(order.currency)
  const [days,     setDays]     = useState(order.deadline_days || 3)
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState('')
  const [showPriceBlock, setShowPriceBlock] = useState(false)

  const CURRENCIES = ['USDT', 'TON', 'STARS']
  const DEADLINES  = [1, 2, 3, 5, 7, 14, 30]
  const canSend    = message.trim().length >= 10 && !sending

  const submit = async () => {
    haptic('medium')
    setSending(true)
    setError('')
    try {
      await ordersAPI.respond(order.id, {
        message: message.trim(),
        price:         showPriceBlock && price ? parseFloat(price) : null,
        currency:      showPriceBlock && price ? currency : null,
        deadline_days: days,
      })
      haptic('heavy')
      onSuccess()
    } catch (e) {
      setError(e?.response?.data?.error || 'Не удалось отправить отклик')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={s.page}>
      <Header
        onBack={onBack}
        title="Откликнуться"
        right={<span style={{ fontSize: 12, color: '#555' }}>{`#MC-${String(order.id).padStart(6, '0')}`}</span>}
      />

      <div style={s.body}>
        {/* Краткая инфа о заказе */}
        <div style={s.orderSnippet}>
          <div style={s.snippetTitle}>{order.title}</div>
          <div style={s.snippetPrice}>{priceLabel(order.budget, order.currency)}</div>
        </div>

        {/* Сообщение */}
        <div style={s.sectionTitle}>Ваше сообщение *</div>
        <textarea
          style={s.textarea}
          placeholder="Расскажите почему подходите: опыт, портфолио, сроки..."
          value={message}
          maxLength={1000}
          onChange={e => setMessage(e.target.value)}
          autoFocus
        />
        <div style={{ ...s.charCount, color: message.length > 900 ? '#f59e0b' : '#444' }}>
          {message.length}/1000
        </div>
        {message.trim().length > 0 && message.trim().length < 10 && (
          <div style={s.hint}>Минимум 10 символов</div>
        )}

        {/* Предложить свою цену */}
        <button
          style={s.toggleBtn}
          onClick={() => { haptic('light'); setShowPriceBlock(v => !v) }}
        >
          <i className={`ti ${showPriceBlock ? 'ti-chevron-up' : 'ti-plus'}`} style={{ fontSize: 14, marginRight: 6 }} />
          {showPriceBlock ? 'Убрать свою цену' : 'Предложить свою цену'}
        </button>

        {showPriceBlock && (
          <div style={{ marginBottom: 16 }}>
            <div style={s.budgetRow}>
              <input
                style={{ ...s.input, flex: 1, marginBottom: 0 }}
                type="number"
                placeholder="Ваша цена"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
            <div style={s.chips}>
              {CURRENCIES.map(cur => (
                <div
                  key={cur}
                  style={{
                    ...s.chip,
                    background: currency === cur ? '#a78bfa' : '#1a1a1a',
                    color:      currency === cur ? '#fff'    : '#666',
                    border:     currency === cur ? 'none'    : '0.5px solid #2a2a2a',
                  }}
                  onClick={() => setCurrency(cur)}
                >
                  {cur}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Дедлайн */}
        <div style={s.sectionTitle}>Срок выполнения</div>
        <div style={{ ...s.chips, marginBottom: 24 }}>
          {DEADLINES.map(d => (
            <div
              key={d}
              style={{
                ...s.chip,
                background: days === d ? '#a78bfa' : '#1a1a1a',
                color:      days === d ? '#fff'    : '#666',
                border:     days === d ? 'none'    : '0.5px solid #2a2a2a',
              }}
              onClick={() => setDays(d)}
            >
              {deadlineLabel(d)}
            </div>
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}
        <div style={{ height: 90 }} />
      </div>

      <div style={s.footer}>
        <button
          style={{ ...s.primaryBtn, opacity: canSend ? 1 : 0.4 }}
          disabled={!canSend}
          onClick={submit}
        >
          {sending ? 'Отправляю...' : '📨 Отправить отклик'}
        </button>
      </div>
    </div>
  )
}

// ── Общий хедер ──────────────────────────────────────────
function Header({ onBack, title, right }) {
  return (
    <div style={s.header}>
      <button style={s.backBtn} onClick={onBack}>
        <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
      </button>
      <span style={s.headerTitle}>{title}</span>
      <div style={{ width: 36 }}>{right}</div>
    </div>
  )
}

// ── Стили ────────────────────────────────────────────────
const s = {
  page:    { minHeight: '100vh', background: '#0f0f0f', display: 'flex', flexDirection: 'column' },
  header:  {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 12px', position: 'sticky', top: 0,
    background: '#0f0f0f', zIndex: 50, borderBottom: '0.5px solid #1a1a1a',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: '50%', background: '#1a1a1a',
    border: '0.5px solid #2a2a2a', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: '#e5e5e5',
  },
  headerTitle: { fontSize: 16, fontWeight: 500, color: '#e5e5e5' },

  body:  { flex: 1, padding: '20px 20px 0', overflowY: 'auto' },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: 300, textAlign: 'center', padding: '0 20px',
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '2px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.7s linear infinite',
  },
  retryBtn: {
    marginTop: 16, padding: '8px 20px', borderRadius: 10,
    background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    color: '#a78bfa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },

  topRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badge:     { fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 6 },
  timeAgo:   { fontSize: 11, color: '#444' },
  mcId:      { fontSize: 11, color: '#555', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' },
  title:     { fontSize: 20, fontWeight: 600, color: '#e5e5e5', lineHeight: 1.35, marginBottom: 16 },

  priceCard: {
    background: '#171717', border: '0.5px solid #262626', borderRadius: 16,
    padding: '14px 18px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  priceLabel: { fontSize: 12, color: '#555', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' },
  priceValue: { fontSize: 22, fontWeight: 600, color: '#a78bfa' },

  metaRow: {
    display: 'flex', background: '#171717', borderRadius: 16,
    border: '0.5px solid #262626', marginBottom: 20,
  },
  metaBox: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 },
  metaDivider: { width: '0.5px', background: '#262626', margin: '10px 0' },
  metaVal: { fontSize: 15, fontWeight: 600, color: '#e5e5e5' },
  metaKey: { fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 11, color: '#555', fontWeight: 500, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 10 },
  description:  { fontSize: 14, color: '#aaa', lineHeight: 1.7 },

  clientCard:  {
    background: '#171717', border: '0.5px solid #262626', borderRadius: 16,
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  clientLeft:   { display: 'flex', alignItems: 'center', gap: 12 },
  clientAvatar: { width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' },
  clientAvatarFallback: {
    width: 44, height: 44, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 500,
  },
  clientName:   { fontSize: 14, fontWeight: 500, color: '#e5e5e5' },
  clientHandle: { fontSize: 12, color: '#555', marginTop: 2 },
  clientStats:  { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  clientStat:   { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#777' },

  footer: {
    padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
    borderTop: '0.5px solid #1a1a1a', background: '#0f0f0f',
  },
  primaryBtn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: '#a78bfa', border: 'none', color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  ownNote: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#555', fontSize: 13, padding: '12px 0',
  },

  successTitle: { fontSize: 18, fontWeight: 500, color: '#e5e5e5', marginTop: 16 },
  successSub:   { fontSize: 14, color: '#555', marginTop: 8, marginBottom: 24, lineHeight: 1.5 },

  deleteError: { color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  deleteBtn: {
    width: '100%', padding: '13px', borderRadius: 14,
    background: '#2a1010', border: '0.5px solid #5a1a1a',
    color: '#f87171', fontSize: 14, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginTop: 8,
  },
  adminDeleteBtn: {
    width: '100%', padding: '13px', borderRadius: 14,
    background: '#1e1510', border: '0.5px solid #5a3a10',
    color: '#f59e0b', fontSize: 14, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmBox: {
    background: '#1a1a1a', border: '0.5px solid #3a1a1a',
    borderRadius: 14, padding: '14px 16px',
  },
  confirmText: { fontSize: 13, color: '#aaa', marginBottom: 12, textAlign: 'center' },
  confirmBtns: { display: 'flex', gap: 10 },
  cancelBtn: {
    flex: 1, padding: '12px', borderRadius: 12,
    background: '#222', border: '0.5px solid #333',
    color: '#aaa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },

  // Форма отклика
  orderSnippet: {
    background: '#171717', border: '0.5px solid #262626', borderRadius: 12,
    padding: '12px 16px', marginBottom: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  snippetTitle: { fontSize: 13, color: '#aaa', flex: 1, marginRight: 8 },
  snippetPrice: { fontSize: 14, fontWeight: 600, color: '#a78bfa', whiteSpace: 'nowrap' },

  textarea: {
    width: '100%', minHeight: 120, background: '#1a1a1a',
    border: '0.5px solid #2a2a2a', borderRadius: 12,
    padding: '12px 14px', color: '#e5e5e5', fontSize: 14,
    fontFamily: 'inherit', resize: 'none', outline: 'none',
    boxSizing: 'border-box', marginBottom: 4,
  },
  charCount: { fontSize: 11, textAlign: 'right', marginBottom: 4 },
  hint:      { fontSize: 12, color: '#555', marginBottom: 12 },
  error:     { color: '#f87171', fontSize: 13, marginBottom: 12 },

  toggleBtn: {
    display: 'flex', alignItems: 'center', background: 'none', border: 'none',
    color: '#a78bfa', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    padding: '4px 0', marginBottom: 12,
  },
  input: {
    width: '100%', background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    borderRadius: 12, padding: '12px 14px', color: '#e5e5e5',
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', marginBottom: 4,
  },
  budgetRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 },
  chips:  { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip:   { padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}
