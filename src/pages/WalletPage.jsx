import { useState, useEffect } from 'react'
import { walletAPI, paymentsAPI } from '../utils/api'
import { useStore } from '../store/useStore'

const WITHDRAW_CURRENCIES = [
  { asset: 'USDT',  label: 'USDT',           icon: '💵', placeholder: '0.01' },
  { asset: 'TON',   label: 'TON',            icon: '💎', placeholder: '0.01' },
  { asset: 'STARS', label: 'Telegram Stars', icon: '⭐', placeholder: '1'    },
]

const CURRENCIES = [
  { key: 'usdt',  frozen: 'frozen_usdt',  label: 'USDT',  icon: '💵', color: '#26a17b', decimals: 2 },
  { key: 'ton',   frozen: 'frozen_ton',   label: 'TON',   icon: '💎', color: '#0088cc', decimals: 2 },
  { key: 'stars', frozen: 'frozen_stars', label: 'Stars', icon: '⭐', color: '#f59e0b', decimals: 0 },
]

const DEPOSIT_ASSETS = [
  { asset: 'USDT', label: 'USDT',           icon: '💵' },
  { asset: 'TON',  label: 'TON',            icon: '💎' },
  { asset: 'BTC',  label: 'Bitcoin',        icon: '₿'  },
  { asset: 'XTR',  label: 'Telegram Stars', icon: '⭐' },
]

const TX_TYPE_LABEL = {
  deposit:        'Пополнение',
  withdrawal:     'Вывод',
  escrow_lock:    'Заморозка',
  escrow_release: 'Выплата',
  escrow_refund:  'Возврат',
  commission:     'Комиссия',
  deal_payment:   'Оплата сделки',
}
const TX_TYPE_COLOR = {
  deposit:        '#22c55e',
  withdrawal:     '#ef4444',
  escrow_lock:    '#f59e0b',
  escrow_release: '#22c55e',
  escrow_refund:  '#22c55e',
  commission:     '#ef4444',
  deal_payment:   '#a78bfa',
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function WalletPage() {
  const { balance, setBalance } = useStore()
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [histLoading, setHistLoading] = useState(true)
  // Deposit sheet
  const [showDepSheet, setShowDepSheet] = useState(false)
  const [depAsset, setDepAsset]         = useState(null)
  const [depAmount, setDepAmount]       = useState('')
  const [depLoading, setDepLoading]     = useState(false)
  const [depError, setDepError]         = useState(null)
  const [depSuccess, setDepSuccess]     = useState(null)

  // Withdraw sheet
  const [showWdSheet, setShowWdSheet]   = useState(false)
  const [wdAsset, setWdAsset]           = useState(null)
  const [wdAmount, setWdAmount]         = useState('')
  const [wdAddress, setWdAddress]       = useState('')
  const [wdLoading, setWdLoading]       = useState(false)
  const [wdError, setWdError]           = useState(null)
  const [wdSuccess, setWdSuccess]       = useState(null)

  useEffect(() => {
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
      .finally(() => setLoading(false))

    walletAPI.getHistory()
      .then(r => setHistory(r.data))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [])

  const openDeposit = (asset) => {
    setDepAsset(asset)
    setDepAmount('')
    setDepError(null)
    setDepSuccess(null)
  }

  const openWithdraw = () => {
    setShowWdSheet(true)
    setWdAsset(null)
    setWdAmount('')
    setWdAddress('')
    setWdError(null)
    setWdSuccess(null)
  }

  const handleWithdraw = async () => {
    if (!wdAmount || parseFloat(wdAmount) <= 0) { setWdError('Введите сумму'); return }
    if (!wdAddress.trim()) { setWdError('Введите адрес кошелька'); return }
    setWdLoading(true)
    setWdError(null)
    try {
      await walletAPI.withdrawRequest({ amount: parseFloat(wdAmount), currency: wdAsset, address: wdAddress.trim() })
      setWdSuccess(true)
      setWdAsset(null)
      // Refresh balance
      walletAPI.getBalance().then(r => {
        const d = r.data
        setBalance({
          rub: parseFloat(d.balance_rub) || 0, usdt: parseFloat(d.balance_usdt) || 0,
          ton: parseFloat(d.balance_ton) || 0,  stars: parseInt(d.balance_stars) || 0,
          frozen_rub: parseFloat(d.frozen_rub) || 0, frozen_usdt: parseFloat(d.frozen_usdt) || 0,
          frozen_ton: parseFloat(d.frozen_ton) || 0,  frozen_stars: parseInt(d.frozen_stars) || 0,
        })
      }).catch(() => {})
    } catch (e) {
      setWdError(e.response?.data?.error || 'Ошибка запроса на вывод')
    } finally {
      setWdLoading(false)
    }
  }

  const handleDeposit = async () => {
    if (!depAmount || parseFloat(depAmount) <= 0) {
      setDepError('Введите сумму')
      return
    }
    setDepLoading(true)
    setDepError(null)
    try {
      const res = await paymentsAPI.createInvoice(null, depAsset, parseFloat(depAmount))
      const url = res.data.payUrl
      if (url) {
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(url)
        } else {
          window.open(url, '_blank')
        }
      }
      setDepSuccess('Счёт создан — оплатите в CryptoBot')
      setDepAsset(null)
    } catch (e) {
      setDepError(e.response?.data?.error || 'Ошибка создания счёта')
    } finally {
      setDepLoading(false)
    }
  }

  const totalUSDT = (balance.usdt + (balance.frozen_usdt || 0)).toFixed(2)
  const totalTON  = (balance.ton  + (balance.frozen_ton  || 0)).toFixed(2)

  return (
    <div style={st.page}>
      <div style={st.header}>
        <div style={st.headerTitle}>Кошелёк</div>
      </div>

      {/* ── Balance cards ── */}
      <div style={st.balanceSection}>
        {loading ? (
          <div style={st.center}><div style={st.spinner} /></div>
        ) : (
          CURRENCIES.map(({ key, frozen, label, icon, color, decimals }) => {
            const avail  = parseFloat(balance[key]  || 0)
            const locked = parseFloat(balance[frozen] || 0)
            return (
              <div key={key} style={st.balCard}>
                <div style={st.balCardLeft}>
                  <span style={st.balIcon}>{icon}</span>
                  <div>
                    <div style={st.balLabel}>{label}</div>
                    {locked > 0 && (
                      <div style={st.balLocked}>🔒 {locked.toFixed(decimals)} в эскроу</div>
                    )}
                  </div>
                </div>
                <div style={st.balCardRight}>
                  <div style={{ ...st.balAmount, color }}>{avail.toFixed(decimals)}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={st.depBtn}
                      onClick={() => {
                        setShowDepSheet(true)
                        setDepAsset(null)
                        setDepAmount('')
                        setDepError(null)
                        setDepSuccess(null)
                      }}
                    >
                      + Пополнить
                    </button>
                    <button
                      style={{ ...st.depBtn, color: '#f87171', borderColor: '#3a1a1a' }}
                      onClick={openWithdraw}
                    >
                      ↑ Вывести
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Transaction history ── */}
      <div style={st.histSection}>
        <div style={st.sectionTitle}>История транзакций</div>
        {histLoading ? (
          <div style={st.center}><div style={st.spinner} /></div>
        ) : history.length === 0 ? (
          <div style={st.empty}>
            <i className="ti ti-receipt-off" style={{ fontSize: 36, color: '#2a2a2a' }} />
            <p style={{ color: '#444', marginTop: 10, fontSize: 13 }}>Транзакций пока нет</p>
          </div>
        ) : (
          history.map(tx => {
            const positive = ['deposit', 'escrow_release', 'escrow_refund'].includes(tx.type)
            return (
              <div key={tx.id} style={st.txRow}>
                <div style={{
                  ...st.txDot,
                  background: (TX_TYPE_COLOR[tx.type] || '#666') + '22',
                  color: TX_TYPE_COLOR[tx.type] || '#666',
                }}>
                  {positive ? '↑' : '↓'}
                </div>
                <div style={st.txInfo}>
                  <div style={st.txType}>{TX_TYPE_LABEL[tx.type] || tx.type}</div>
                  <div style={st.txDate}>{fmtDate(tx.created_at)}</div>
                </div>
                <div style={{ ...st.txAmount, color: TX_TYPE_COLOR[tx.type] || '#888' }}>
                  {positive ? '+' : '-'}{tx.amount} {tx.currency}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ height: 32 }} />

      {/* ── Deposit bottomsheet ── */}
      {/* ── Withdrawal bottomsheet ── */}
      {showWdSheet && (
        <div style={st.overlay} onClick={() => setShowWdSheet(false)}>
          <div style={st.sheet} onClick={e => e.stopPropagation()}>
            <div style={st.sheetHandle} />

            {wdSuccess ? (
              <div style={{ padding: '16px 20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  Запрос отправлен!
                </div>
                <div style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
                  Средства зарезервированы. Администратор проверит и выполнит вывод.
                </div>
                <button onClick={() => setShowWdSheet(false)} style={st.cancelBtn}>Закрыть</button>
              </div>
            ) : wdAsset ? (
              <div style={{ padding: '16px 20px 24px' }}>
                <div style={st.sheetTitle}>
                  Вывести {WITHDRAW_CURRENCIES.find(c => c.asset === wdAsset)?.icon} {wdAsset}
                </div>
                <input
                  style={st.depInput}
                  type="number"
                  placeholder={`Сумма (напр. ${WITHDRAW_CURRENCIES.find(c => c.asset === wdAsset)?.placeholder})`}
                  value={wdAmount}
                  onChange={e => setWdAmount(e.target.value)}
                  min="0"
                  step="any"
                  autoFocus
                />
                <input
                  style={{ ...st.depInput, marginTop: 8, fontFamily: 'monospace', fontSize: 13 }}
                  type="text"
                  placeholder={wdAsset === 'STARS' ? 'Telegram username (для возврата Stars)' : 'Адрес кошелька'}
                  value={wdAddress}
                  onChange={e => setWdAddress(e.target.value)}
                />
                {wdError && <p style={{ color: '#ef4444', fontSize: 13, margin: '6px 0' }}>{wdError}</p>}
                <p style={{ color: '#555', fontSize: 11, margin: '6px 0 10px', lineHeight: 1.5 }}>
                  Средства будут зарезервированы и отправлены после проверки администратором.
                </p>
                <button
                  onClick={handleWithdraw}
                  disabled={wdLoading}
                  style={{ ...st.payBtn, background: '#ef4444', opacity: wdLoading ? 0.6 : 1 }}
                >
                  {wdLoading ? 'Отправляем запрос...' : `Запросить вывод`}
                </button>
                <button onClick={() => setWdAsset(null)} style={{ ...st.cancelBtn, marginTop: 8 }}>
                  ← Назад
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: '4px 20px 12px' }}>
                  <div style={st.sheetTitle}>Выберите валюту для вывода</div>
                </div>
                <div style={st.assetList}>
                  {WITHDRAW_CURRENCIES.map(({ asset, label, icon }) => (
                    <button key={asset} onClick={() => setWdAsset(asset)} style={st.assetBtn}>
                      <span style={st.assetIcon}>{icon}</span>
                      <span style={st.assetLabel}>{label}</span>
                      <i className="ti ti-chevron-right" style={{ color: '#555', fontSize: 16, marginLeft: 'auto' }} />
                    </button>
                  ))}
                </div>
                <div style={{ padding: '0 20px 8px' }}>
                  <button onClick={() => setShowWdSheet(false)} style={st.cancelBtn}>Отмена</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDepSheet && (
        <div style={st.overlay} onClick={() => setShowDepSheet(false)}>
          <div style={st.sheet} onClick={e => e.stopPropagation()}>
            <div style={st.sheetHandle} />

            {depSuccess ? (
              <div style={{ padding: '16px 20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  {depSuccess}
                </div>
                <button onClick={() => setShowDepSheet(false)} style={st.cancelBtn}>Закрыть</button>
              </div>
            ) : depAsset ? (
              <div style={{ padding: '16px 20px 24px' }}>
                <div style={st.sheetTitle}>
                  Пополнить {DEPOSIT_ASSETS.find(a => a.asset === depAsset)?.icon} {depAsset}
                </div>
                <input
                  style={st.depInput}
                  type="number"
                  placeholder="Введите сумму"
                  value={depAmount}
                  onChange={e => setDepAmount(e.target.value)}
                  min="0"
                  step="any"
                  autoFocus
                />
                {depError && <p style={{ color: '#ef4444', fontSize: 13, margin: '6px 0' }}>{depError}</p>}
                <button
                  onClick={handleDeposit}
                  disabled={depLoading}
                  style={{ ...st.payBtn, opacity: depLoading ? 0.6 : 1 }}
                >
                  {depLoading ? 'Создаём счёт...' : `Перейти к оплате`}
                </button>
                <button onClick={() => setDepAsset(null)} style={{ ...st.cancelBtn, marginTop: 8 }}>
                  ← Назад
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: '4px 20px 12px' }}>
                  <div style={st.sheetTitle}>Выберите валюту</div>
                </div>
                <div style={st.assetList}>
                  {DEPOSIT_ASSETS.map(({ asset, label, icon }) => (
                    <button key={asset} onClick={() => openDeposit(asset)} style={st.assetBtn}>
                      <span style={st.assetIcon}>{icon}</span>
                      <span style={st.assetLabel}>{label}</span>
                      <i className="ti ti-chevron-right" style={{ color: '#555', fontSize: 16, marginLeft: 'auto' }} />
                    </button>
                  ))}
                </div>
                <div style={{ padding: '0 20px 8px' }}>
                  <button onClick={() => setShowDepSheet(false)} style={st.cancelBtn}>Отмена</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const st = {
  page: { minHeight: '100vh', background: '#0f0f0f', fontFamily: 'inherit' },
  header: {
    padding: '20px 20px 12px',
    background: '#0f0f0f',
    borderBottom: '0.5px solid #1a1a1a',
  },
  headerTitle: { fontSize: 22, fontWeight: 700, color: '#e5e5e5' },

  center: { display: 'flex', justifyContent: 'center', padding: 32 },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '3px solid #2a2a2a', borderTopColor: '#a78bfa',
    animation: 'spin 0.8s linear infinite',
  },

  balanceSection: { padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 10 },

  balCard: {
    background: '#151515', borderRadius: 14, border: '0.5px solid #222',
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  balCardLeft:  { display: 'flex', alignItems: 'center', gap: 12 },
  balIcon:      { fontSize: 24, width: 32, textAlign: 'center' },
  balLabel:     { fontSize: 15, fontWeight: 600, color: '#e5e5e5' },
  balLocked:    { fontSize: 11, color: '#888', marginTop: 2 },
  balCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
  balAmount:    { fontSize: 20, fontWeight: 700 },
  depBtn: {
    padding: '5px 12px', background: '#1e1e1e',
    border: '0.5px solid #2a2a2a', borderRadius: 20,
    color: '#a78bfa', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  histSection: { padding: '16px 16px 0' },
  sectionTitle: {
    fontSize: 11, color: '#555', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '32px 0', textAlign: 'center',
  },
  txRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 0', borderBottom: '0.5px solid #1a1a1a',
  },
  txDot: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
  },
  txInfo:   { flex: 1, minWidth: 0 },
  txType:   { fontSize: 14, fontWeight: 500, color: '#e5e5e5' },
  txDate:   { fontSize: 11, color: '#555', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: 700, flexShrink: 0 },

  // Bottomsheet
  overlay: {
    position: 'fixed', inset: 0, background: '#000000bb',
    display: 'flex', alignItems: 'flex-end', zIndex: 200,
  },
  sheet: {
    width: '100%', maxWidth: 480, margin: '0 auto',
    background: '#1a1a1a', borderRadius: '20px 20px 0 0',
    paddingTop: 12, paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  sheetHandle: {
    width: 36, height: 4, background: '#333', borderRadius: 2,
    margin: '0 auto 16px',
  },
  sheetTitle: { fontSize: 17, fontWeight: 700, color: '#e5e5e5', marginBottom: 16 },
  assetList:  { display: 'flex', flexDirection: 'column', borderTop: '0.5px solid #222' },
  assetBtn: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
    background: 'none', border: 'none', borderBottom: '0.5px solid #222',
    cursor: 'pointer', fontFamily: 'inherit', color: '#e5e5e5',
  },
  assetIcon:  { fontSize: 22, width: 28, textAlign: 'center' },
  assetLabel: { fontSize: 16, fontWeight: 500, flex: 1, textAlign: 'left' },
  depInput: {
    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
    background: '#222', border: '0.5px solid #333', borderRadius: 12,
    color: '#e5e5e5', fontSize: 16, fontFamily: 'inherit', outline: 'none',
    marginBottom: 8,
  },
  payBtn: {
    width: '100%', padding: 13, background: '#a78bfa', color: '#0f0f0f',
    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  cancelBtn: {
    width: '100%', padding: 12, background: '#252525',
    border: '0.5px solid #2a2a2a', borderRadius: 12,
    color: '#888', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
  },
}
