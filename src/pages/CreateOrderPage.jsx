import { useState } from 'react'
import { ordersAPI } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'

const CATEGORIES = ['Дизайн', 'Логотипы', 'Аватарки', 'Соцсети', 'Стикеры', 'Другое']
const CURRENCIES = ['USDT', 'TON', 'STARS']
const DEADLINES  = [1, 2, 3, 5, 7, 14, 30]

const CURRENCY_LABEL = { RUB: '₽', USDT: '$', TON: 'TON', STARS: '⭐' }

export default function CreateOrderPage({ onBack, onSuccess }) {
  const { haptic } = useTelegram()
  const [step, setStep]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [form, setForm] = useState({
    category:     '',
    title:        '',
    description:  '',
    budget:       '',
    currency:     'USDT',
    deadline_days: 3,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // ── Валидация по шагам ─────────────────────────────
  const canNext = {
    1: form.category && form.title.trim().length >= 5 && form.description.trim().length >= 10,
    2: form.budget > 0,
  }

  const next = () => {
    haptic('light')
    setStep(s => s + 1)
  }
  const back = () => {
    haptic('light')
    if (step === 1) onBack?.()
    else setStep(s => s - 1)
  }

  const submit = async () => {
    haptic('medium')
    setLoading(true)
    setError('')
    try {
      await ordersAPI.create({
        title:        form.title.trim(),
        description:  form.description.trim(),
        category:     form.category,
        budget:       parseFloat(form.budget),
        currency:     form.currency,
        deadline_days: form.deadline_days,
      })
      haptic('heavy')
      setSubmitted(true)
    } catch (e) {
      setError(e?.response?.data?.error || 'Не удалось создать заказ')
    } finally {
      setLoading(false)
    }
  }

  // ── Экран "на модерации" ──────────────────────────────
  if (submitted) {
    return (
      <div style={s.page}>
        <div style={{ ...s.body, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>⏳</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 20, marginBottom: 10 }}>
            Заказ отправлен на модерацию
          </div>
          <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6, maxWidth: 280 }}>
            Обычно проверка занимает до 10 минут. После одобрения вы получите уведомление, и заказ появится в ленте.
          </div>
          <button style={{ ...s.btn, marginTop: 32 }} onClick={() => onSuccess?.()}>
            Вернуться в ленту
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Хедер */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={back}>
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </button>
        <span style={s.headerTitle}>Новый заказ</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Прогресс */}
      <div style={s.progress}>
        {[1, 2, 3].map(n => (
          <div key={n} style={s.progressRow}>
            <div style={{
              ...s.progressDot,
              background: step >= n ? '#a78bfa' : '#2a2a2a',
              border: step === n ? '2px solid #7c5cce' : '2px solid transparent',
            }}>
              {step > n
                ? <i className="ti ti-check" style={{ fontSize: 11, color: '#fff' }} />
                : <span style={{ fontSize: 11, color: step >= n ? '#fff' : '#555' }}>{n}</span>
              }
            </div>
            {n < 3 && <div style={{ ...s.progressLine, background: step > n ? '#a78bfa' : '#2a2a2a' }} />}
          </div>
        ))}
      </div>

      <div style={s.body}>
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} />}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Кнопка действия */}
      <div style={s.footer}>
        {step < 3 ? (
          <button
            style={{ ...s.btn, opacity: canNext[step] ? 1 : 0.4 }}
            disabled={!canNext[step]}
            onClick={next}
          >
            Далее
          </button>
        ) : (
          <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={submit}>
            {loading ? 'Отправляю...' : '📨 Отправить на модерацию'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Шаг 1: Категория, название, описание ──────────────
function Step1({ form, set }) {
  return (
    <div>
      <div style={s.label}>Категория</div>
      <div style={s.chips}>
        {CATEGORIES.map(cat => (
          <div
            key={cat}
            style={{
              ...s.chip,
              background: form.category === cat ? '#a78bfa' : '#1a1a1a',
              color:      form.category === cat ? '#fff'    : '#666',
              border:     form.category === cat ? 'none'    : '0.5px solid #2a2a2a',
            }}
            onClick={() => set('category', cat)}
          >
            {cat}
          </div>
        ))}
      </div>

      <div style={s.label}>Название заказа</div>
      <input
        style={s.input}
        placeholder="Например: Логотип для кофейни"
        value={form.title}
        maxLength={100}
        onChange={e => set('title', e.target.value)}
      />
      <div style={s.hint}>{form.title.length}/100</div>

      <div style={s.label}>Описание</div>
      <textarea
        style={{ ...s.input, height: 110, resize: 'none' }}
        placeholder="Опишите что нужно сделать, стиль, требования к файлам..."
        value={form.description}
        maxLength={1000}
        onChange={e => set('description', e.target.value)}
      />
      <div style={s.hint}>{form.description.length}/1000</div>
    </div>
  )
}

// ── Шаг 2: Бюджет, валюта, дедлайн ───────────────────
function Step2({ form, set }) {
  return (
    <div>
      <div style={s.label}>Бюджет</div>
      <div style={s.budgetRow}>
        <input
          style={{ ...s.input, flex: 1, marginBottom: 0 }}
          type="number"
          placeholder="0"
          min="0"
          value={form.budget}
          onChange={e => set('budget', e.target.value)}
        />
        <div style={s.currencyBadge}>{CURRENCY_LABEL[form.currency]}</div>
      </div>

      <div style={s.label}>Валюта</div>
      <div style={s.chips}>
        {CURRENCIES.map(cur => (
          <div
            key={cur}
            style={{
              ...s.chip,
              background: form.currency === cur ? '#a78bfa' : '#1a1a1a',
              color:      form.currency === cur ? '#fff'    : '#666',
              border:     form.currency === cur ? 'none'    : '0.5px solid #2a2a2a',
            }}
            onClick={() => set('currency', cur)}
          >
            {cur} {CURRENCY_LABEL[cur]}
          </div>
        ))}
      </div>

      <div style={s.label}>Дедлайн (дней)</div>
      <div style={s.chips}>
        {DEADLINES.map(d => (
          <div
            key={d}
            style={{
              ...s.chip,
              background: form.deadline_days === d ? '#a78bfa' : '#1a1a1a',
              color:      form.deadline_days === d ? '#fff'    : '#666',
              border:     form.deadline_days === d ? 'none'    : '0.5px solid #2a2a2a',
            }}
            onClick={() => set('deadline_days', d)}
          >
            {d === 1 ? '1 день' : d < 5 ? `${d} дня` : `${d} дней`}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Шаг 3: Превью ─────────────────────────────────────
function Step3({ form }) {
  return (
    <div>
      <div style={s.label}>Проверь перед публикацией</div>
      <div style={s.preview}>
        <div style={s.previewRow}>
          <span style={s.previewKey}>Категория</span>
          <span style={s.previewVal}>{form.category}</span>
        </div>
        <div style={s.divider} />
        <div style={s.previewRow}>
          <span style={s.previewKey}>Название</span>
          <span style={{ ...s.previewVal, flex: 1, textAlign: 'right' }}>{form.title}</span>
        </div>
        <div style={s.divider} />
        <div style={{ padding: '12px 16px' }}>
          <div style={s.previewKey}>Описание</div>
          <div style={{ ...s.previewVal, marginTop: 6, lineHeight: 1.5 }}>{form.description}</div>
        </div>
        <div style={s.divider} />
        <div style={s.previewRow}>
          <span style={s.previewKey}>Бюджет</span>
          <span style={{ ...s.previewVal, color: '#a78bfa', fontWeight: 500 }}>
            {parseFloat(form.budget).toLocaleString('ru')} {CURRENCY_LABEL[form.currency]}
          </span>
        </div>
        <div style={s.divider} />
        <div style={s.previewRow}>
          <span style={s.previewKey}>Дедлайн</span>
          <span style={s.previewVal}>
            {form.deadline_days === 1 ? '1 день'
              : form.deadline_days < 5 ? `${form.deadline_days} дня`
              : `${form.deadline_days} дней`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Стили ─────────────────────────────────────────────
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
  progress: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px 20px', gap: 0,
  },
  progressRow:  { display: 'flex', alignItems: 'center' },
  progressDot:  {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.2s',
  },
  progressLine: { width: 48, height: 2, transition: 'background 0.2s' },
  body:   { flex: 1, padding: '4px 20px 20px', overflowY: 'auto' },
  label:  { fontSize: 12, color: '#666', fontWeight: 500, marginBottom: 8, marginTop: 20,
            textTransform: 'uppercase', letterSpacing: '0.06em' },
  chips:  { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip:   {
    padding: '7px 14px', borderRadius: 20, fontSize: 13,
    fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s',
  },
  input:  {
    width: '100%', background: '#1a1a1a', border: '0.5px solid #2a2a2a',
    borderRadius: 12, padding: '12px 14px', color: '#e5e5e5',
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', marginBottom: 4,
  },
  hint:       { fontSize: 11, color: '#444', textAlign: 'right', marginBottom: 4 },
  budgetRow:  { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 },
  currencyBadge: {
    background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 12,
    padding: '12px 16px', fontSize: 16, color: '#a78bfa', fontWeight: 500, whiteSpace: 'nowrap',
  },
  preview: {
    background: '#171717', border: '0.5px solid #262626',
    borderRadius: 16, overflow: 'hidden', marginTop: 8,
  },
  previewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' },
  previewKey: { fontSize: 13, color: '#555' },
  previewVal: { fontSize: 13, color: '#e5e5e5' },
  divider:    { height: '0.5px', background: '#222' },
  error:  { padding: '0 20px 8px', fontSize: 13, color: '#f87171', textAlign: 'center' },
  footer: { padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            borderTop: '0.5px solid #1a1a1a', background: '#0f0f0f' },
  btn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: '#a78bfa', border: 'none', color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
}
