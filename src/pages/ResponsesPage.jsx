import { useState, useEffect } from 'react'
import { ordersAPI } from '../utils/api'

export default function ResponsesPage({ orderId, onBack, onDealCreated }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [accepting, setAccepting] = useState(null)
  const [acceptError, setAcceptError] = useState(null)

  useEffect(() => {
    ordersAPI.getResponses(orderId)
      .then(r => setResponses(r.data))
      .catch(() => setError('Не удалось загрузить отклики'))
      .finally(() => setLoading(false))
  }, [orderId])

  const handleAccept = async (responseId) => {
    setAccepting(responseId)
    setAcceptError(null)
    try {
      const res = await ordersAPI.acceptResponse(orderId, responseId)
      // Backend returns the created deal object
      const dealId = res.data?.id
      if (dealId && onDealCreated) onDealCreated(dealId)
    } catch (e) {
      setAcceptError(e.response?.data?.error || 'Ошибка принятия отклика')
    } finally {
      setAccepting(null)
    }
  }

  return (
    <div style={st.page}>
      {/* Header */}
      <div style={st.header}>
        <button onClick={onBack} style={st.backBtn}>←</button>
        <div style={st.title}>Отклики на заказ</div>
        <div style={st.badge}>{responses.length}</div>
      </div>

      {loading && (
        <div style={st.center}><div style={st.spinner} /></div>
      )}

      {error && <p style={st.errorMsg}>{error}</p>}
      {acceptError && <p style={{ ...st.errorMsg, padding: '8px 16px' }}>{acceptError}</p>}

      {!loading && responses.length === 0 && !error && (
        <div style={st.empty}>
          <i className="ti ti-inbox" style={{ fontSize: 48, color: '#2a2a2a' }} />
          <p style={{ color: '#555', marginTop: 12, fontSize: 14 }}>Откликов пока нет</p>
          <p style={{ color: '#444', fontSize: 13, marginTop: 4 }}>Они появятся здесь, когда исполнители откликнутся</p>
        </div>
      )}

      <div style={st.list}>
        {responses.map(r => (
          <div key={r.id} style={st.card}>
            {/* User row */}
            <div style={st.userRow}>
              <div style={st.avatarWrap}>
                {r.photo_url
                  ? <img src={r.photo_url} style={st.avatarImg} alt="" />
                  : <span style={st.avatarLetter}>{(r.first_name || '?')[0].toUpperCase()}</span>
                }
              </div>
              <div style={st.userInfo}>
                <div style={st.userName}>{r.first_name || r.username || 'Аноним'}</div>
                {r.username && <div style={st.userHandle}>@{r.username}</div>}
              </div>
              <div style={st.ratingWrap}>
                <span style={st.starIcon}>★</span>
                <span style={st.ratingVal}>{Number(r.rating || 0).toFixed(1)}</span>
                {r.completed_deals > 0 && (
                  <span style={st.dealsCount}> · {r.completed_deals} сд.</span>
                )}
              </div>
            </div>

            {/* Cover letter */}
            {r.message && (
              <div style={st.coverLetter}>{r.message}</div>
            )}

            {/* Price / deadline */}
            {(r.price || r.deadline_days) && (
              <div style={st.meta}>
                {r.price && (
                  <span style={st.metaChip}>
                    💰 {r.price} {r.currency || ''}
                  </span>
                )}
                {r.deadline_days && (
                  <span style={st.metaChip}>
                    📅 {r.deadline_days} {pluralDays(r.deadline_days)}
                  </span>
                )}
              </div>
            )}

            {/* Action */}
            {r.status === 'accepted' ? (
              <div style={st.acceptedTag}>✅ Принято</div>
            ) : r.status === 'rejected' ? (
              <div style={st.rejectedTag}>Отклонено</div>
            ) : (
              <button
                onClick={() => handleAccept(r.id)}
                disabled={accepting === r.id}
                style={{ ...st.acceptBtn, opacity: accepting === r.id ? 0.6 : 1 }}
              >
                {accepting === r.id ? 'Принимаем...' : '✓ Принять исполнителя'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ height: 24 }} />
    </div>
  )
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день'
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дня'
  return 'дней'
}

const st = {
  page: { minHeight: '100vh', background: '#0f0f0f', fontFamily: 'inherit' },

  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', background: '#151515',
    borderBottom: '0.5px solid #222', position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    background: 'none', border: 'none', color: '#a78bfa',
    fontSize: 22, cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
  },
  title: { fontSize: 17, fontWeight: 700, color: '#e5e5e5', flex: 1 },
  badge: {
    background: '#1e1e1e', color: '#888', fontSize: 12, fontWeight: 600,
    padding: '3px 9px', borderRadius: 20, border: '0.5px solid #2a2a2a',
  },

  center: { display: 'flex', justifyContent: 'center', padding: 40 },
  spinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.8s linear infinite',
  },
  errorMsg: { color: '#ef4444', padding: '12px 16px', margin: 0, fontSize: 14 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 20px', textAlign: 'center',
  },

  list: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 },

  card: {
    background: '#151515', borderRadius: 14,
    border: '0.5px solid #222', padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  userRow: { display: 'flex', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 },
  avatarImg:  { width: 42, height: 42, objectFit: 'cover' },
  avatarLetter: {
    width: 42, height: 42, borderRadius: '50%',
    background: '#1a1333', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, fontWeight: 700, color: '#a78bfa',
  },
  userInfo:   { flex: 1, minWidth: 0 },
  userName:   { fontSize: 15, fontWeight: 600, color: '#e5e5e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userHandle: { fontSize: 12, color: '#666', marginTop: 1 },
  ratingWrap: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  starIcon:   { color: '#f59e0b', fontSize: 14 },
  ratingVal:  { fontSize: 13, fontWeight: 600, color: '#e5e5e5' },
  dealsCount: { fontSize: 12, color: '#666' },

  coverLetter: {
    fontSize: 14, color: '#aaa', lineHeight: 1.55,
    background: '#1a1a1a', borderRadius: 10, padding: '10px 12px',
  },

  meta: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  metaChip: {
    fontSize: 13, color: '#ccc', background: '#1e1e1e',
    border: '0.5px solid #2a2a2a', borderRadius: 20, padding: '4px 10px',
  },

  acceptBtn: {
    width: '100%', padding: '12px',
    background: '#a78bfa', color: '#0f0f0f', border: 'none',
    borderRadius: 12, fontSize: 14, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.2s',
  },
  acceptedTag: {
    textAlign: 'center', padding: '10px',
    background: '#22c55e18', color: '#22c55e',
    borderRadius: 10, fontSize: 14, fontWeight: 600,
  },
  rejectedTag: {
    textAlign: 'center', padding: '10px',
    background: '#ef444418', color: '#ef4444',
    borderRadius: 10, fontSize: 13,
  },
}
