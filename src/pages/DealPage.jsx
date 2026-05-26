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

const PAY_CURRENCIES = [
  { asset: 'USDT',  label: 'USDT',           icon: '💵' },
  { asset: 'TON',   label: 'TON',            icon: '💎' },
  { asset: 'BTC',   label: 'Bitcoin',        icon: '₿'  },
  { asset: 'XTR',   label: 'Telegram Stars', icon: '⭐' },
]

// Derive backend base URL for file serving
const BACKEND_URL = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
  return apiUrl.replace(/\/api$/, '')
})()

export default function DealPage({ dealId, onBack }) {
  const { user } = useStore()
  const [deal, setDeal]             = useState(null)
  const [messages, setMessages]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [text, setText]             = useState('')
  const [sending, setSending]       = useState(false)
  const [completing, setCompleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)
  // File upload
  const [uploading, setUploading]   = useState(false)
  const fileInputRef                = useRef(null)
  // Cancel deal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling]               = useState(false)
  // Currency picker sheet
  const [showPaySheet, setShowPaySheet] = useState(false)
  const [paying, setPaying]             = useState(false)
  const [payError, setPayError]         = useState(null)

  const bottomRef = useRef(null)
  const wsRef     = useRef(null)

  // ── Load deal + messages separately so one failing doesn't block the other ──
  const loadDeal = useCallback(async () => {
    if (!dealId) {
      setLoadError('Некорректный ID сделки')
      setLoading(false)
      return
    }
    try {
      const dealRes = await dealsAPI.getOne(dealId)
      setDeal(dealRes.data)
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Не удалось загрузить сделку')
      setLoading(false)
      return
    }
    // Messages load separately — failure doesn't block the page
    try {
      const msgRes = await dealsAPI.getMessages(dealId)
      setMessages(msgRes.data)
    } catch {
      // Non-critical — page still works with empty messages
    }
    setLoading(false)
  }, [dealId])

  useEffect(() => { loadDeal() }, [loadDeal])

  // ── WebSocket ──
  useEffect(() => {
    if (!dealId) return
    const initData = window.Telegram?.WebApp?.initData || ''
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', initData }))

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

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──
  const sendMessage = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    setActionError(null)
    try {
      const res = await dealsAPI.sendMessage(dealId, text.trim())
      setMessages(prev =>
        prev.some(m => m.id === res.data.id) ? prev : [...prev, res.data]
      )
      setText('')
    } catch (e) {
      setActionError(e.response?.data?.error || 'Ошибка отправки — попробуйте снова')
    } finally {
      setSending(false)
    }
  }

  // ── Pay with selected currency ──
  const handlePay = async (asset) => {
    setShowPaySheet(false)
    setPaying(true)
    setPayError(null)
    try {
      const res = await dealsAPI.pay(dealId, asset)
      const url = res.data.payUrl
      if (url) {
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(url)
        } else {
          window.open(url, '_blank')
        }
      }
    } catch (e) {
      setPayError(e.response?.data?.error || 'Ошибка создания счёта')
    } finally {
      setPaying(false)
    }
  }

  // ── Submit work ──
  const handleSubmit = async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      await dealsAPI.submit(dealId)
      setDeal(prev => ({ ...prev, status: 'submitted' }))
    } catch (e) {
      setActionError(e.response?.data?.error || 'Ошибка')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Complete deal ──
  const handleComplete = async () => {
    setCompleting(true)
    setActionError(null)
    try {
      await dealsAPI.complete(dealId)
      setDeal(prev => ({ ...prev, status: 'completed' }))
    } catch (e) {
      setActionError(e.response?.data?.error || 'Ошибка')
    } finally {
      setCompleting(false)
    }
  }

  // ── Cancel deal ──
  const handleCancel = async () => {
    setCancelling(true)
    setActionError(null)
    try {
      await dealsAPI.cancel(dealId)
      setDeal(prev => ({ ...prev, status: 'cancelled' }))
      setShowCancelConfirm(false)
    } catch (e) {
      setActionError(e.response?.data?.error || 'Ошибка отмены')
      setShowCancelConfirm(false)
    } finally {
      setCancelling(false)
    }
  }

  // ── Upload file ──
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setActionError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await dealsAPI.uploadFile(dealId, fd)
      setMessages(prev =>
        prev.some(m => m.id === res.data.id) ? prev : [...prev, res.data]
      )
    } catch (e) {
      setActionError(e.response?.data?.error || 'Ошибка загрузки файла')
    } finally {
      setUploading(false)
    }
  }

  // ── States ──────────────────────────────────────────
  if (loading) return (
    <div style={{ ...st.page, alignItems: 'center', justifyContent: 'center' }}>
      <div style={st.spinner} />
    </div>
  )

  if (loadError || !deal) return (
    <div style={st.page}>
      <div style={st.header}>
        <button onClick={onBack} style={st.backBtn}>←</button>
        <span style={st.headerTitle}>Сделка</span>
      </div>
      <div style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>
        {loadError || 'Сделка не найдена'}
      </div>
    </div>
  )

  const isClient     = user && deal.client_id === user.id
  const isFreelancer = user && deal.freelancer_id === user.id
  // Chat is open for all non-terminal statuses
  const canChat      = !['completed', 'cancelled'].includes(deal.status)

  const otherUser = isClient
    ? { name: deal.freelancer_first_name, username: deal.freelancer_username }
    : { name: deal.client_first_name,     username: deal.client_username }

  const currentStepIdx = STEPS.indexOf(deal.status)

  return (
    <div style={st.page}>
      {/* ── Header ── */}
      <div style={st.header}>
        <button onClick={onBack} style={st.backBtn}>←</button>
        <div style={st.headerInfo}>
          <div style={st.headerName}>{otherUser.name || otherUser.username || '—'}</div>
          <div style={st.headerOrder}>{deal.order_title}</div>
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
                {i > 0 && (
                  <div style={{ ...st.stepLine, background: i <= currentStepIdx ? '#a78bfa' : '#2a2a2a' }} />
                )}
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

        {/* Pay error */}
        {payError && <p style={st.payError}>{payError}</p>}

        {/* Action buttons */}
        {isClient && deal.status === 'pending' && (
          <button
            onClick={() => { setPayError(null); setShowPaySheet(true) }}
            disabled={paying}
            style={st.payBtn}
          >
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

        {/* Cancel button — visible for pending/active (both sides) */}
        {['pending', 'active'].includes(deal.status) && !showCancelConfirm && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            style={st.cancelDealBtn}
          >
            🚪 Отказаться от сделки
          </button>
        )}

        {/* Cancel confirmation */}
        {showCancelConfirm && (
          <div style={st.cancelConfirm}>
            <p style={st.cancelConfirmText}>
              {deal.status === 'active'
                ? '⚠️ Средства в эскроу будут возвращены заказчику. Уверены?'
                : 'Вы уверены, что хотите отменить сделку?'}
            </p>
            <div style={st.cancelConfirmBtns}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={st.cancelKeepBtn}
              >
                Нет
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ ...st.cancelConfirmYesBtn, opacity: cancelling ? 0.5 : 1 }}
              >
                {cancelling ? 'Отменяем...' : 'Да, отменить'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action error (send / submit / complete) */}
      {actionError && <p style={st.actionError}>{actionError}</p>}

      {/* ── Messages ── */}
      <div style={st.messages}>
        {messages.length === 0 && (
          <p style={st.noMsgs}>Напишите первое сообщение 👋</p>
        )}
        {messages.map(msg => {
          const mine    = msg.sender_id === user?.id
          const hasFile = !!msg.file_url
          const isImage = hasFile && /\.(jpg|jpeg|png|gif)$/i.test(msg.file_name || '')
          const fileUrl = hasFile ? `${BACKEND_URL}${msg.file_url}` : null
          return (
            <div key={msg.id} style={{ ...st.msgRow, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...st.bubble, background: mine ? '#6d28d9' : '#1e1e1e' }}>
                {hasFile ? (
                  isImage ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer">
                      <img
                        src={fileUrl}
                        alt={msg.file_name}
                        style={st.bubbleImg}
                      />
                    </a>
                  ) : (
                    <a href={fileUrl} target="_blank" rel="noreferrer" style={st.fileLink}>
                      📎 {msg.file_name || 'Файл'}
                    </a>
                  )
                ) : (
                  <div style={st.bubbleText}>{msg.text}</div>
                )}
                <div style={st.bubbleTime}>{fmtTime(msg.created_at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input (available for all non-terminal statuses) ── */}
      {canChat && (
        <div style={st.inputArea}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.pdf,.zip,.ai,.psd"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ ...st.attachBtn, opacity: uploading ? 0.5 : 1 }}
            title="Прикрепить файл"
          >
            {uploading
              ? <div style={st.uploadSpinner} />
              : <i className="ti ti-paperclip" style={{ fontSize: 18 }} />
            }
          </button>
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

      {/* ── Currency picker bottomsheet ── */}
      {showPaySheet && (
        <div style={st.overlay} onClick={() => setShowPaySheet(false)}>
          <div style={st.sheet} onClick={e => e.stopPropagation()}>
            <div style={st.sheetHandle} />
            <div style={st.sheetTitle}>Выберите валюту оплаты</div>
            <div style={st.sheetSubtitle}>
              Сумма к оплате: <strong style={{ color: '#a78bfa' }}>{deal.amount} {deal.currency}</strong>
            </div>
            <div style={st.currencyList}>
              {PAY_CURRENCIES.map(({ asset, label, icon }) => (
                <button
                  key={asset}
                  onClick={() => handlePay(asset)}
                  style={st.currencyBtn}
                >
                  <span style={st.currencyIcon}>{icon}</span>
                  <span style={st.currencyLabel}>{label}</span>
                  <i className="ti ti-chevron-right" style={{ color: '#555', fontSize: 16, marginLeft: 'auto' }} />
                </button>
              ))}
            </div>
            <button onClick={() => setShowPaySheet(false)} style={st.cancelSheetBtn}>
              Отмена
            </button>
          </div>
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
  headerInfo:  { flex: 1, minWidth: 0 },
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
  stepsRow:  { display: 'flex', alignItems: 'flex-start', marginBottom: 12 },
  stepWrap:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' },
  stepDot:   { width: 10, height: 10, borderRadius: '50%', marginBottom: 5, zIndex: 1, transition: 'all 0.3s' },
  stepLine:  {
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
  payError: { color: '#ef4444', fontSize: 13, margin: '8px 0 0', textAlign: 'center' },

  actionError: { color: '#ef4444', fontSize: 13, padding: '4px 16px', margin: 0, flexShrink: 0 },

  // Messages
  messages: {
    flex: 1, padding: '8px 16px 16px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  noMsgs:  { textAlign: 'center', color: '#444', fontSize: 13, marginTop: 20 },
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
  attachBtn: {
    width: 42, height: 42, borderRadius: '50%',
    background: '#1e1e1e', border: '0.5px solid #2a2a2a', color: '#666',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'opacity 0.2s',
  },
  uploadSpinner: {
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid #444', borderTopColor: '#a78bfa',
    animation: 'spin 0.7s linear infinite',
  },
  input: {
    flex: 1, padding: '10px 14px',
    background: '#1e1e1e', border: '0.5px solid #2a2a2a',
    borderRadius: 22, color: '#e5e5e5', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: '50%',
    background: '#a78bfa', border: 'none', color: '#0f0f0f',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'opacity 0.2s',
  },
  // File messages
  bubbleImg: {
    maxWidth: '100%', maxHeight: 200, borderRadius: 10,
    display: 'block', cursor: 'pointer',
  },
  fileLink: {
    color: '#a78bfa', fontSize: 13, textDecoration: 'none', wordBreak: 'break-all',
  },
  // Cancel deal
  cancelDealBtn: {
    width: '100%', padding: '10px', marginTop: 8,
    background: 'transparent', border: '0.5px solid #3a1a1a',
    borderRadius: 12, color: '#ef4444', fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  cancelConfirm: {
    marginTop: 10, padding: '12px 14px',
    background: '#1a0e0e', border: '0.5px solid #3a1a1a', borderRadius: 12,
  },
  cancelConfirmText: {
    fontSize: 13, color: '#aaa', textAlign: 'center', margin: '0 0 10px',
  },
  cancelConfirmBtns: { display: 'flex', gap: 8 },
  cancelKeepBtn: {
    flex: 1, padding: '10px', borderRadius: 10,
    background: '#222', border: '0.5px solid #333',
    color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  },
  cancelConfirmYesBtn: {
    flex: 1, padding: '10px', borderRadius: 10,
    background: '#2a1010', border: '0.5px solid #5a1a1a',
    color: '#ef4444', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.2s',
  },

  // Currency picker bottomsheet
  overlay: {
    position: 'fixed', inset: 0, background: '#000000aa',
    display: 'flex', alignItems: 'flex-end', zIndex: 100,
  },
  sheet: {
    width: '100%', maxWidth: 480, margin: '0 auto',
    background: '#1a1a1a', borderRadius: '20px 20px 0 0',
    padding: '12px 0 24px',
    display: 'flex', flexDirection: 'column',
  },
  sheetHandle: {
    width: 36, height: 4, background: '#333', borderRadius: 2,
    margin: '0 auto 16px',
  },
  sheetTitle: {
    fontSize: 17, fontWeight: 700, color: '#e5e5e5',
    padding: '0 20px', marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 13, color: '#888',
    padding: '0 20px', marginBottom: 16,
  },
  currencyList: {
    display: 'flex', flexDirection: 'column',
    borderTop: '0.5px solid #2a2a2a',
  },
  currencyBtn: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 20px', background: 'none', border: 'none',
    borderBottom: '0.5px solid #222', cursor: 'pointer',
    fontFamily: 'inherit', color: '#e5e5e5',
    transition: 'background 0.15s',
  },
  currencyIcon:  { fontSize: 22, width: 28, textAlign: 'center' },
  currencyLabel: { fontSize: 16, fontWeight: 500, flex: 1, textAlign: 'left' },
  cancelSheetBtn: {
    margin: '12px 20px 0',
    padding: '12px', background: '#252525',
    border: '0.5px solid #2a2a2a', borderRadius: 12,
    color: '#888', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
  },
}
