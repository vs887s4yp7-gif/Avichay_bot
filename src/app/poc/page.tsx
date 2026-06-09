'use client'

import { useState, useRef, useEffect } from 'react'

type Message = {
  from: 'user' | 'bot'
  text: string
  time: string
  isEscalation?: boolean
  product?: string
}

type Escalation = {
  id: number
  question: string
  time: string
  answered: boolean
  answer?: string
}

const PRODUCTS: Record<string, { name: string; emoji: string; price: string; stock: 1 | 2 | 3 }> = {
  ספיידרמן: { name: 'קוסטום ספיידרמן', emoji: '🕷', price: '₪25/יח', stock: 1 },
  אריה:     { name: 'קוסטום אריה',      emoji: '🦁', price: '₪18/יח', stock: 1 },
  נסיכה:    { name: 'קוסטום נסיכה',     emoji: '👸', price: '₪22/יח', stock: 1 },
  קפטן:     { name: 'קוסטום קפטן אמריקה', emoji: '🛡', price: '₪24/יח', stock: 2 },
  כלב:      { name: 'קוסטום כלב',       emoji: '🐶', price: '₪19/יח', stock: 2 },
  פרפר:     { name: 'קוסטום פרפר',      emoji: '🦋', price: '₪16/יח', stock: 1 },
  דרקון:    { name: 'קוסטום דרקון',     emoji: '🐉', price: '₪21/יח', stock: 1 },
  מגנט:     { name: 'מגנט תלת-ממד',    emoji: '🧲', price: '₪12/יח', stock: 1 },
  פאזל:     { name: 'פאזל ענק',         emoji: '🧩', price: '₪35/יח', stock: 1 },
  חרב:      { name: 'חרב שוברת',        emoji: '⚔️', price: '₪9/יח',  stock: 1 },
}

const SCENARIOS = [
  { label: 'רמה 1', text: 'מה יש לכם בקוסטומי ספיידרמן?' },
  { label: 'רמה 2', text: 'אחי יש לך 50 קוסטומי כלב גדל 6-8 שנים?' },
  { label: 'רמה 3', text: 'כמה עולה 200 קוסטומים מעורבים?' },
]

const WHOLESALERS = [
  { id: 'nir',   name: 'ניר שווקים',      initials: 'נ', debt: 'חוב: ₪3,200', color: '#E57373' },
  { id: 'moshe', name: 'משה ולנסיה',      initials: 'מ', debt: '',            color: '#81C784' },
  { id: 'dana',  name: 'דנה חנות כלבו',   initials: 'ד', debt: 'חוב: ₪800',  color: '#64B5F6' },
  { id: 'yossi', name: 'יוסי גרוס',       initials: 'י', debt: '',            color: '#FFB74D' },
  { id: 'sarah', name: 'שרה צוק',         initials: 'ש', debt: '',            color: '#BA68C8' },
  { id: 'rami',  name: 'רמי קיטים',       initials: 'ר', debt: 'חוב: ₪1,100', color: '#4DB6AC' },
]

function now() {
  return new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function detectProduct(text: string): string | undefined {
  return Object.keys(PRODUCTS).find((k) => text.includes(k))
}

export default function PocPage() {
  const [messages, setMessages] = useState<Message[]>([
    { from: 'bot', text: 'שלום נשמה! מה אפשר לעזור היום? 😊', time: now() },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<{ role: string; content: string }[]>([])
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [escInputs, setEscInputs] = useState<Record<number, string>>({})
  const [activeTab, setActiveTab] = useState<'esc' | 'stats' | 'kb'>('esc')
  const [stats, setStats] = useState({ handled: 0, escalated: 0, msgs: 0, timeSaved: 0 })
  const [activeWs, setActiveWs] = useState(WHOLESALERS[0])
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: Message = { from: 'user', text: msg, time: now() }
    setMessages((m) => [...m, userMsg])
    setStats((s) => ({ ...s, msgs: s.msgs + 1 }))
    setLoading(true)

    const newHistory = [...history, { role: 'user', content: msg }]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory }),
      })
      const data = await res.json()
      const botText: string = data.text ?? data.error ?? 'שגיאה — נסה שוב'
      const isEsc: boolean = data.isEscalation ?? false
      const product = detectProduct(msg)

      const botMsg: Message = { from: 'bot', text: botText, time: now(), isEscalation: isEsc, product }
      setMessages((m) => [...m, botMsg])
      setHistory([...newHistory, { role: 'assistant', content: botText }])

      if (isEsc) {
        const newEsc: Escalation = { id: Date.now(), question: msg, time: now(), answered: false }
        setEscalations((e) => [newEsc, ...e])
        setStats((s) => ({ ...s, escalated: s.escalated + 1 }))
      } else {
        setStats((s) => ({ ...s, handled: s.handled + 1, timeSaved: s.timeSaved + 2 }))
      }
    } catch {
      setMessages((m) => [...m, { from: 'bot', text: 'שגיאת חיבור — נסה שוב', time: now() }])
    }

    setLoading(false)
  }

  function answerEsc(id: number) {
    const ans = escInputs[id]?.trim()
    if (!ans) return
    setEscalations((es) => es.map((e) => (e.id === id ? { ...e, answered: true, answer: ans } : e)))
    const botReply: Message = {
      from: 'bot',
      text: `אחי, ${ans} — שאל עוד אם צריך 🙏`,
      time: now(),
    }
    setMessages((m) => [...m, botReply])
    setHistory((h) => [...h, { role: 'assistant', content: botReply.text }])
    setStats((s) => ({ ...s, handled: s.handled + 1, timeSaved: s.timeSaved + 3 }))
  }

  const openEscalations = escalations.filter((e) => !e.answered)

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>

      {/* ══════════ LEFT — WhatsApp ══════════ */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #ddd', background: '#fff' }}>

        {/* WA Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#128C7E', color: 'white', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: activeWs.color + '55', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: activeWs.color, flexShrink: 0 }}>
            {activeWs.initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{activeWs.name}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              מחובר {activeWs.debt && `· ${activeWs.debt}`}
            </div>
          </div>
          <div style={{ marginRight: 'auto', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '2px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            ✦ AI פעיל
          </div>
        </div>

        {/* Wholesaler selector */}
        <div style={{ display: 'flex', gap: 6, padding: '7px 10px', overflowX: 'auto', borderBottom: '1px solid #eee', background: '#f9f9f9', flexShrink: 0 }}>
          {WHOLESALERS.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setActiveWs(ws)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                border: ws.id === activeWs.id ? `1px solid #128C7E` : '1px solid #ddd',
                background: ws.id === activeWs.id ? '#128C7E' : '#fff',
                color: ws.id === activeWs.id ? 'white' : '#555',
              }}
            >
              {ws.name}
            </button>
          ))}
        </div>

        {/* Scenario buttons */}
        <div style={{ padding: '8px 12px', background: '#f0faf7', borderBottom: '1px solid #d4edda', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: '#666', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            נסה עכשיו — משפטים מניר האמיתי
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {SCENARIOS.map((sc, i) => (
              <button
                key={i}
                onClick={() => send(sc.text)}
                disabled={loading}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: '1px solid #a8d5c2',
                  background: '#fff', color: '#1a1a1a', fontSize: 12, cursor: 'pointer',
                  textAlign: 'right', fontFamily: 'inherit', transition: 'background 0.15s',
                }}
              >
                <span style={{ color: '#128C7E', fontWeight: 600 }}>{sc.label} — </span>{sc.text}
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div
          ref={chatRef}
          style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#ECE5DD', display: 'flex', flexDirection: 'column', gap: 7 }}
        >
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '78%', padding: '7px 10px 4px', borderRadius: m.from === 'user' ? '8px 8px 0 8px' : '8px 8px 8px 0',
                background: m.from === 'user' ? '#fff' : m.isEscalation ? '#FFF8E1' : '#DCF8C6',
                border: m.isEscalation ? '1px solid #FFE082' : 'none',
                fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap',
              }}>
                {m.text}
                {m.product && PRODUCTS[m.product] && (() => {
                  const p = PRODUCTS[m.product!]
                  const stockInfo = [
                    { bg: '#DCF8C6', color: '#1D9E75', label: '✅ יש במלאי' },
                    { bg: '#FFF8E1', color: '#B8860B', label: '⚠️ מלאי נמוך' },
                    { bg: '#FFEBEE', color: '#C62828', label: '❌ נגמר' },
                  ][p.stock - 1]
                  return (
                    <div style={{ background: '#fff', borderRadius: 8, marginTop: 6, overflow: 'hidden', border: '0.5px solid #ddd', maxWidth: 200 }}>
                      <div style={{ background: '#f5f5f5', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                        {p.emoji}
                      </div>
                      <div style={{ padding: '7px 9px' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#128C7E', marginTop: 2 }}>{p.price} | מינ׳ 10 יח׳</div>
                        <span style={{ fontSize: 10, background: stockInfo.bg, color: stockInfo.color, padding: '1px 6px', borderRadius: 10, marginTop: 4, display: 'inline-block' }}>
                          {stockInfo.label}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{m.time}</div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#DCF8C6', padding: '7px 12px', borderRadius: '8px 8px 8px 0', fontSize: 13, color: '#888' }}>
                מקליד...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px', background: '#f0f0f0', flexShrink: 0 }}>
          <button
            onClick={() => send()}
            disabled={loading}
            style={{
              width: 36, height: 36, borderRadius: '50%', background: loading ? '#aaa' : '#128C7E',
              border: 'none', cursor: loading ? 'default' : 'pointer', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            ➤
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="כתוב כמו סיטונאי אמיתי..."
            disabled={loading}
            style={{
              flex: 1, padding: '7px 12px', borderRadius: 22, border: 'none',
              background: 'white', fontSize: 13, outline: 'none', direction: 'rtl', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* ══════════ RIGHT — Avihai Dashboard ══════════ */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', background: '#f8f8f8' }}>

        {/* Header */}
        <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #e0e0e0', background: '#fff', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>לוח אביחי</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>אתה שולט — הבוט רק עוזר</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', background: '#fff', flexShrink: 0 }}>
          {(['esc', 'stats', 'kb'] as const).map((tab) => {
            const labels = { esc: 'שאלות פתוחות', stats: 'סיכום', kb: 'בסיס ידע' }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '9px 4px', fontSize: 12, textAlign: 'center',
                  cursor: 'pointer', border: 'none', background: 'none',
                  color: activeTab === tab ? '#128C7E' : '#888',
                  borderBottom: activeTab === tab ? '2px solid #128C7E' : '2px solid transparent',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: 'inherit',
                }}
              >
                {tab === 'esc' && openEscalations.length > 0 && (
                  <span style={{
                    display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                    background: '#E53935', color: 'white', fontSize: 9, textAlign: 'center',
                    lineHeight: '16px', marginLeft: 4,
                  }}>
                    {openEscalations.length}
                  </span>
                )}
                {labels[tab]}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', direction: 'rtl' }}>

          {/* ── ESC TAB ── */}
          {activeTab === 'esc' && (
            <>
              {openEscalations.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  אין שאלות פתוחות<br />
                  <span style={{ fontSize: 11 }}>הבוט מטפל בהכל</span>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    ממתינות לך
                  </div>
                  {openEscalations.map((esc) => (
                    <div key={esc.id} style={{
                      background: '#fff', border: '0.5px solid #e0e0e0', borderRight: '3px solid #F59E0B',
                      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{activeWs.name}</span>
                        <span style={{ fontSize: 10, color: '#aaa' }}>{esc.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#555', background: '#f9f9f9', padding: '5px 8px', borderRadius: 6, marginBottom: 8, direction: 'rtl' }}>
                        "{esc.question}"
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                        {['יש במלאי', 'אין כרגע', 'נדבר אישית'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setEscInputs((e) => ({ ...e, [esc.id]: opt }))}
                            style={{
                              padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
                              border: '0.5px solid #ccc', background: '#fff', fontFamily: 'inherit',
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <input
                        value={escInputs[esc.id] ?? ''}
                        onChange={(e) => setEscInputs((prev) => ({ ...prev, [esc.id]: e.target.value }))}
                        placeholder="תשובה חופשית..."
                        style={{
                          width: '100%', padding: '5px 8px', borderRadius: 6, border: '0.5px solid #ccc',
                          fontSize: 12, fontFamily: 'inherit', direction: 'rtl', marginBottom: 6,
                          background: '#fff', outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => answerEsc(esc.id)}
                        style={{
                          padding: '4px 14px', background: '#128C7E', color: 'white', border: 'none',
                          borderRadius: 12, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        שלח ✓
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── STATS TAB ── */}
          {activeTab === 'stats' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { n: stats.handled,   label: 'שאלות שהבוט ענה' },
                  { n: stats.escalated, label: 'הגיעו אליך' },
                  { n: `~${stats.timeSaved}`, label: 'דקות שחסכת' },
                  { n: stats.msgs,      label: 'הודעות סה"כ' },
                ].map((s, i) => (
                  <div key={i} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 600, color: '#1a1a1a' }}>{s.n}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                מה זה אומר ביום שלם
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>
                אם ניר שולח 20 הודעות ביום, ויש לך 6 סיטונאים —<br />
                זה <strong>~120 הודעות</strong> שהבוט מטפל ב-80% מהן.<br />
                <span style={{ color: '#128C7E', fontWeight: 600 }}>4–6 שעות שבועיות שחוזרות אליך.</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                מה הבוט לא עושה
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                לא סוגר עסקאות&nbsp;·&nbsp;לא נותן הנחות&nbsp;·&nbsp;לא מחליט בשמך<br />
                כל מה שמעל רמה 1 — מגיע אליך
              </div>
            </>
          )}

          {/* ── KB TAB ── */}
          {activeTab === 'kb' && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                מה הבוט יודע
              </div>
              {[
                { color: '#1D9E75', name: 'קטלוג מחירים — 11 מוצרים', tag: 'רמה 1', pct: 100 },
                { color: '#1D9E75', name: 'מינ׳ הזמנה 10 יחידות',       tag: 'רמה 1', pct: 100 },
                { color: '#F59E0B', name: 'מלאי ספציפי לפי גודל',       tag: 'רמה 2', pct: 60  },
                { color: '#F59E0B', name: 'מחיר ריבוי כמויות',          tag: 'רמה 2', pct: 0   },
                { color: '#7F77DD', name: 'הנחת ניר 5%',                 tag: 'מאביחי', pct: 100 },
                { color: '#7F77DD', name: 'מינ׳ הזמנת קיץ',              tag: 'נלמד',  pct: 0   },
              ].map((k, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fff', borderRadius: 8, marginBottom: 5, border: '0.5px solid #e0e0e0' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: k.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>{k.name}</div>
                    <div style={{ height: 3, background: '#eee', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${k.pct}%`, height: '100%', background: k.color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{k.tag}</div>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff', borderRadius: 8, border: '0.5px solid #e0e0e0', fontSize: 11, color: '#888' }}>
                <span style={{ color: '#1D9E75' }}>●</span> בטוח &nbsp;
                <span style={{ color: '#F59E0B' }}>●</span> בודק &nbsp;
                <span style={{ color: '#7F77DD' }}>●</span> נלמד מאביחי
              </div>
            </>
          )}
        </div>

        {/* Pilot CTA — appears after 2 handled */}
        {stats.handled >= 2 && (
          <div style={{
            padding: '10px 14px', background: '#E8F5E9', borderTop: '1px solid #A5D6A7',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: '#2E7D32' }}>
              הבוט טיפל ב-{stats.handled} שאלות — מוכן ל-Pilot?
            </div>
            <button
              onClick={() => window.open('https://wa.me/', '_blank')}
              style={{
                padding: '5px 14px', background: '#2E7D32', color: 'white', border: 'none',
                borderRadius: 12, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              כן, נתחיל ↗
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
