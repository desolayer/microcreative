import { useState, useEffect, useRef, useCallback } from 'react'
import { dealsAPI } from '../utils/api'
import { useStore } from '../store/useStore'

// Derive WebSocket URL from the API URL (http→ws, https→wss, strip /api)
const WS_URL = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
  return apiUrl.replace(/\/api$/, '/ws').replace(/^http/, 'ws')
})()

const STATUS_LABEL = {
  pending:   'Ожидает оплаты',
  active:    'В работе',
  submitted: 'На проверке',
  completed: 'Завершена',
  cancelled: 'Отменена',
  disputed:  'Спор',
}
const STATUS_COLOR = {
  pending:   '#f59e0b',
  active:    '#22c55e',
  submitted: '#3b82f6',
  completed: '#a78bfa',
  cancelled: '#6b7280',
  disputed:  '#ef4444',
}
const STEPS = ['pending', 'active', 'submitted', 'completed']
const STEP_LABELS = ['Создана', 'В работе', 'На проверке', 'Завершена']

export default function DealPage({ dealId, onBack }) {
  const { user } = useStore()
  const [deal, setDeal]           = useState(null)
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [paying, setPaying]       = useState(false)
  const [completing, setCompleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const bottomRef = useRef(null)
  const wsRef     = useRef(null)

  const loadDeal = useCallback(async () => {
    try {
      const [dealRes, msgRes] = await Promise.all([
        dealsAPI.getOne(dealId),
        dealsAPI.getMessages(dealId),
      ])
      setDeal(dealRes.data)
      setMessages(msgRes.data)
    } catch {
      setError('Не удалось загрузить сделку')
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { loadDeal() }, [loadDeal])

  // WebSocket connection
  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData || ''
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', initData }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'new_message' && String(msg.message?.deal_id) === String(dealId)) {
          setMessages(prev =>
            prev.some(m => m.id === msg.message.id) ? prev : [...prev, msg.message]
          )
        }
        if (msg.type === 'deal_status' && String(msg.dealId) === String(dealId)) {
          setDeal(prev => prev ? { ...prev, status: msg.status } : prev)
        }
      } catch (_) {}
    }

    return () => ws.close()
  }, [dealId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await dealsAPI.sendMessage(dealId, text.trim())
      setMessages(prev =>
        prev.some(m => m.id === res.data.id) ? prev : [...prev, res.data]
      )
      setText('')
    } catch {
      setError('Ошибка отправки — попробуйте снова')
    } finally {
      setSending(false)
    }
  }

  const handlePay = async () => {
    setPaying(true)
    setError(null)
    try {
      const res = await dealsAPI.pay(dealId)
      if (res.data.payUrl) {
        // Open CryptoBot pay link inside Telegram
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(res.data.payUrl)
        } else {
          window.open(res.data.payUrl, '_blank')
        }
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка создания счёта')
    } finally {
      setPaying(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await dealsAPI.submit(dealId)
      setDeal(prev => ({ ...prev, status: 'submitted' }))
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    setError(null)
    try {
      await dealsAPI.complete(dealId)
      setDeal(prev => ({ ...prev, status: 'completed' }))
    } catch (e) {
      setError(e.response?.data?.error || 'Ошибка')
    } finally {
      setCompleting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────
  if (loading) return (
    <div style={{ ...st.page, alignItems: 'center', justifyContent: 'center' }}>
      <div style={st.spinner} />
    </div>
  )

  if (!deal) return (
    <div style={st.page}>
      <div style={st.header}>
        <button onClick={onBack} style={st.backBtn}>←</button>
        <span style={st.headerTitle}>Сделка</span>
      </div>
      <div style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>{error || 'Сделка не найдена'}</div>
    </div>
  )

  const isClient     = user && deal.client_id === user.id
  const isFreelancer = user && deal.freelancer_id === user.id
  const canChat      = ['active', 'submitted', 'disputed'].includes(deal.status)

  const otherUser = isClient
    ? { name: deal.freelancer_first_name, username: deal.freelancer_username, photo: deal.freelancer_photo }
    : { name: deal.client_first_name,     username: deal.client_username,     photo: deal.client_photo }

  const currentStepIdx = STEPS.indexOf(deal.status)

  return (
    <div style={st.page}>
      {/* ── Header ── */}
      <div style={st.header}>
        <button onClick={onBack} style={st.backBtn}>←</button>
        <div style={st.headerInfo}>
          <div style={st.headerName}>{otherUser.name || otherUser.username || '—'}</div>
          <div style={st.headerOrder} title={deal.order_title}>{deal.order_title}</div>
        </div>
        <div style={{
          ...st.statusChip,
          background: (STATUS_COLOR[deal.status] || '#888') + '22',
          color: STATUS_COLOR[deal.status] || '#888',
        }}>
          {STATUS_LABEL[deal.status] || deal.status}
        </div>
      </div>

      {/* ── Escrow card ── */}
      <div style={st.escrowCard}>
        <div style={st.escrowTop}>
          <span style={st.escrowLabel}>Эскроу</span>
          <span style={st.escrowAmount}>{deal.amount} {deal.currency}</span>
        </div>

        {/* Progress steps */}
        <div style={st.stepsRow}>
          {STEPS.map((s, i) => {
            const done   = i < currentStepIdx || deal.status === 'completed'
            const active = s === deal.status
            return (
              <div key={s} style={st.stepWrap}>
                {i > 0 && <div style={{ ...st.stepLine, background: i <= currentStepIdx ? '#a78bfa' : '#2a2a2a' }} />}
                <div style={{
                  ...st.stepDot,
                  background: done || active ? '#a78bfa' : '#2a2a2a',
                  boxShadow: active ? '0 0 0 3px #a78bfa44' : 'none',
                }} />
                <div style={{ ...st.stepLabel, color: done || active ? '#ccc' : '#444' }}>
                  {STEP_LABELS[i]}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        {isClient && deal.status === 'pending' && (
          <button onClick={handlePay} disabled={paying} style={st.payBtn}>
            {paying ? 'Создаём счёт...' : `💳 Оплатить ${deal.amount} ${deal.currency}`}
          </button>
        )}
        {isFreelancer && deal.status === 'pending' && (
          <p style={st.waitNote}>⏳ Ожидаем оплату от заказчика</p>
        )}
        {isFreelancer && deal.status === 'active' && (
          <button onClick={handleSubmit} disabled={submitting} style={st.submitBtn}>
            {submitting ? 'Отправляем...' : '📬 Сдать работу на проверку'}
          </button>
        )}
        {isClient && deal.status === 'submitted' && (
          <button onClick={handleComplete} disabled={completing} style={st.completeBtn}>
            {completing ? 'Подтверждаем...' : '🎉 Принять работу и оплатить'}
          </button>
        )}
        {isFreelancer && deal.status === 'submitted' && (
          <p style={st.waitNote}>⏳ Ожидаем подтверждения заказчика</p>
        )}
        {deal.status === 'completed' && (
          <p style={{ ...st.waitNote, color: '#22c55e' }}>✅ Сделка завершена</p>
        )}
        {deal.status === 'cancelled' && (
          <p style={{ ...st.waitNote, color: '#6b7280' }}>❌ Сделка отменена</p>
        )}
      </div>

      {error && <p style={st.errorNote}>{error}</p>}

      {/* ── Messages ── */}
      <div style={st.messages}>
        {!canChat && messages.length === 0 ? (
          <div style={st.chatLocked}>
            <i className="ti ti-lock" style={{ fontSize: 28, color: '#333' }} />
            <p style={{ color: '#444', margin: '8px 0 0', fontSize: 13 }}>
              Чат откроется после оплаты
            </p>
          </div>
        ) : messages.length === 0 ? (
          <p style={st.noMsgs}>Напишите первое сообщение 👋</p>
        ) : null}

        {messages.map(msg => {
          const mine = msg.sender_id === user?.id
          return (
            <div key={msg.id} style={{ ...st.msgRow, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...st.bubble, background: mine ? '#6d28d9' : '#1e1e1e' }}>
                <div style={st.bubbleText}>{msg.text}</div>
                <div style={st.bubbleTime}>{fmtTime(msg.created_at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      {canChat && (
        <div style={st.inputArea}>
          <input
            style={st.input}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Сообщение..."
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            maxLength={1000}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            style={{ ...st.sendBtn, opacity: text.trim() ? 1 : 0.4 }}
          >
            <i className="ti ti-send" style={{ fontSize: 16 }} />
          </button>
        </div>
      )}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

const st = {
  page: {
    minHeight: '100vh', background: '#0f0f0f',
    display: 'flex', flexDirection: 'column', fontFamily: 'inherit',
  },
  spinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.8s linear infinite',
  },

  // Header
  header: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
    background: '#151515', borderBottom: '0.5px solid #222',
    position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
  },
  backBtn: {
    background: 'none', border: 'none', color: '#a78bfa',
    fontSize: 22, cursor: 'pointer', padding: '4px 8px',
    fontFamily: 'inherit', flexShrink: 0,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: {
    fontWeight: 600, fontSize: 15, color: '#e5e5e5',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  headerOrder: {
    fontSize: 11, color: '#666',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  headerTitle: { fontSize: 16, fontWeight: 500, color: '#e5e5e5' },
  statusChip: {
    fontSize: 11, fontWeight: 600, padding: '3px 9px',
    borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap',
  },

  // Escrow card
  escrowCard: {
    margin: '12px 16px', padding: '14px 16px',
    background: '#151515', borderRadius: 14, border: '0.5px solid #222',
    flexShrink: 0,
  },
  escrowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  escrowLabel: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },
  escrowAmount: { fontSize: 18, fontWeight: 700, color: '#a78bfa' },

  // Steps
  stepsRow: { display: 'flex', alignItems: 'flex-start', marginBottom: 12 },
  stepWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' },
  stepDot:  { width: 10, height: 10, borderRadius: '50%', marginBottom: 5, zIndex: 1, transition: 'all 0.3s' },
  stepLine: {
    position: 'absolute', top: 4, right: '50%', width: '100%', height: 2,
    transition: 'background 0.3s',
  },
  stepLabel: { fontSize: 9, textAlign: 'center', lineHeight: 1.3, letterSpacing: '0.02em' },

  payBtn: {
    width: '100%', padding: 12, marginTop: 4,
    background: '#a78bfa', color: '#0f0f0f', border: 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  submitBtn: {
    width: '100%', padding: 12, marginTop: 4,
    background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44',
    borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  completeBtn: {
    width: '100%', padding: 12, marginTop: 4,
    background: '#a78bfa', color: '#0f0f0f', border: 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  waitNote: { textAlign: 'center', color: '#666', fontSize: 13, margin: '8px 0 0' },

  errorNote: { color: '#ef4444', fontSize: 13, padding: '4px 16px', margin: 0, flexShrink: 0 },

  // Messages
  messages: {
    flex: 1, padding: '8px 16px 16px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  chatLocked: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, padding: 40,
  },
  noMsgs: { textAlign: 'center', color: '#444', fontSize: 13, marginTop: 20 },
  msgRow:  { display: 'flex' },
  bubble: {
    maxWidth: '78%', padding: '8px 12px', borderRadius: 16,
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  bubbleText: { fontSize: 14, color: '#e5e5e5', wordBreak: 'break-word', lineHeight: 1.45 },
  bubbleTime: { fontSize: 10, color: '#ffffff44', textAlign: 'right' },

  // Input
  inputArea: {
    display: 'flex', gap: 8, padding: '10px 16px',
    background: '#151515', borderTop: '0.5px solid #222',
    position: 'sticky', bottom: 0, flexShrink: 0,
    paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
  },
  input: {
    flex: 1, padding: '10px 14px',
    background: '#1e1e1e', border: '0.5px solid #2a2a2a',
    borderRadius: 22, color: '#e5e5e5', fontSize: 14, fontFamily: 'inherit',
    outline: 'none',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: '50%',
    background: '#a78bfa', border: 'none', color: '#0f0f0f',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'opacity 0.2s',
  },
}
