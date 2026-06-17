// ================================================================
// src/app/railed-ui/page.tsx
// ================================================================
// 🎮 UI בדיקה ל-Railed Bot (חבצול 👽)
// חלון שיחה עם:
//   - הודעת פתיחה של חבצול
//   - תמיכה בתמונות (imageUrl מה-API)
//   - Escalation badge
//   - ניקוי session ("/reset")
// ================================================================

"use client"

import { useState, useRef, useEffect } from "react"

type Message = {
  role: "user" | "bot" | "avichai"
  text: string
  escalate?: boolean
  intent?: string
  imageUrl?: string
  images?: { id: string; url: string; name: string; price: number | null }[]  // 🆕 carousel
  ts: number
}

const OPENING: Message = {
  role: "bot",
  text: "היי! שמי חבצול 👽 - הבוט של אביחי מ\"שלי צעצועים\".\nתכלס תותח קטלוג, פחות תותח בבדיחות.\nשאל אותי על מחיר, מלאי, תמונות - או הזן הזמנה.",
  ts: Date.now(),
}

export default function RailedUI() {
  const [messages, setMessages] = useState<Message[]>([OPENING])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [from] = useState(() => `test_${Math.random().toString(36).slice(2, 7)}`)
  const sessionStateRef = useRef<Record<string, unknown> | null>(null)
  const lastAvichaiTsRef = useRef<number>(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Polling for Avichai replies ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/chat/${encodeURIComponent(from)}/messages?since=${lastAvichaiTsRef.current}`
        )
        if (!res.ok) return
        const data = await res.json()
        const newMsgs: { text: string; ts: number }[] = data.messages ?? []
        if (newMsgs.length > 0) {
          const latest = Math.max(...newMsgs.map((m) => m.ts))
          lastAvichaiTsRef.current = latest
          setMessages((prev) => [
            ...prev,
            ...newMsgs.map((m) => ({
              role: "avichai" as const,
              text: m.text,
              ts: m.ts,
            })),
          ])
        }
      } catch {}
    }, 2500)
    return () => clearInterval(interval)
  }, [from])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // פקודת reset
    if (trimmed === "/reset") {
      await fetch(`/api/railed?from=${from}`)
      setMessages([{ ...OPENING, ts: Date.now() }])
      sessionStateRef.current = null
      setInput("")
      return
    }

    setMessages((prev) => [...prev, { role: "user", text: trimmed, ts: Date.now() }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/railed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, message: trimmed, sessionState: sessionStateRef.current }),
      })
      const data = await res.json()

      // שמור session state לבקשה הבאה (fallback לcold start)
      if (data.sessionState) sessionStateRef.current = data.sessionState

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.response ?? "שגיאה בתשובה",
          escalate: data.escalate,
          intent: data.intent,
          imageUrl: data.imageUrl,
          images: data.images ?? [],
          ts: Date.now(),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "שגיאת תקשורת - נסה שוב 🙏", escalate: true, ts: Date.now() },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div style={{ minHeight: "100svh", background: "#0f1117", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px" }}>
      {/* header */}
      <div style={{ width: "100%", maxWidth: 480, background: "#1a1f2e", borderRadius: 16, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 28 }}>👽</span>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>חבצול - בוט שלי צעצועים</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>Railed Bot · session: {from}</div>
        </div>
        <button
          onClick={() => { setMessages([{ ...OPENING, ts: Date.now() }]); fetch(`/api/railed?from=${from}`) }}
          style={{ marginLeft: "auto", background: "#2d3748", border: "none", borderRadius: 8, color: "#94a3b8", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
        >
          איפוס
        </button>
      </div>

      {/* messages */}
      <div style={{ width: "100%", maxWidth: 480, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "avichai" && (
              <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 2, paddingLeft: 4 }}>
                👨‍💼 אביחי
              </div>
            )}
            {m.role === "bot" && m.intent && (
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 2, paddingRight: 4, direction: "ltr" }}>
                {m.intent}{m.escalate ? " · escalate 🙏" : ""}
              </div>
            )}
            {/* 🆕 Carousel - תמונות מוצרים */}
            {m.images && m.images.length > 0 && (
              <div style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                maxWidth: "90vw",
                marginBottom: 4,
                scrollbarWidth: "none",
              }}>
                {m.images.map((img) => (
                  <div key={img.id} style={{ flexShrink: 0, textAlign: "center" }}>
                    <img
                      src={img.url}
                      alt={img.name}
                      style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 10, display: "block" }}
                      onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }}
                    />
                    {img.price !== null && (
                      <div style={{ fontSize: 11, color: "#6ee7b7", marginTop: 3 }}>₪{img.price}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* תמונה בודדת - fallback אם אין carousel */}
            {(!m.images || m.images.length === 0) && m.imageUrl && (
              <img
                src={m.imageUrl}
                alt="product"
                style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 12, marginBottom: 4 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
            )}
            <div style={{
              maxWidth: "85%",
              background: m.role === "user" ? "#2563eb" : m.role === "avichai" ? "#1e3a5f" : m.escalate ? "#3d2a1e" : "#1e2a1e",
              color: m.role === "user" ? "#fff" : m.role === "avichai" ? "#93c5fd" : m.escalate ? "#fcd34d" : "#a7f3d0",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              padding: "10px 14px",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              direction: "rtl",
              textAlign: "right",
              border: m.role === "avichai" ? "1px solid #3b82f6" : m.escalate && m.role === "bot" ? "1px solid #92400e" : "none",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", background: "#1e2a1e", color: "#6ee7b7", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: 13 }}>
            חבצול מחשב... 👽
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div style={{ width: "100%", maxWidth: 480, display: "flex", gap: 8, marginTop: 8 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
          placeholder="כתוב הודעה... (1-5 לבחירה, 'עוד' לרשימה הבאה)"
          style={{
            flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
            color: "#e2e8f0", padding: "10px 14px", fontSize: 14, direction: "rtl",
            outline: "none",
          }}
          autoFocus
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? "#334155" : "#2563eb",
            border: "none", borderRadius: 12, color: "#fff",
            padding: "10px 16px", cursor: loading ? "not-allowed" : "pointer", fontSize: 14,
          }}
        >
          שלח
        </button>
      </div>
      <div style={{ color: "#334155", fontSize: 11, marginTop: 6 }}>
        /reset לאיפוס session · תמונות ב-public/catalog-images/
      </div>
    </div>
  )
}
