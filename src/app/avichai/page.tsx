"use client"
// ================================================================
// /avichai — דשבורד לאביחי
// ================================================================
// גישה: ?pin=XXXX  (או session storage)
// ================================================================

import { useEffect, useRef, useState, useCallback } from "react"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
type MsgRole = "user" | "bot" | "avichai"

type Msg = {
  role: MsgRole
  text: string
  ts: number
  intent?: string
  escalate?: boolean
}

type Session = {
  from: string
  status: "active" | "escalated" | "resolved"
  lastActivity: number
  unreadByAvichai: number
  lastMessage: Msg | null
  messageCount: number
}

type FullConv = {
  from: string
  status: string
  messages: Msg[]
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return "עכשיו"
  if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`
  if (diff < 86_400_000) return `לפני ${Math.floor(diff / 3_600_000)} שע׳`
  return new Date(ts).toLocaleDateString("he-IL")
}

// ────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────
export default function AvichaiDashboard() {
  const [pin, setPin] = useState("")
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState(false)

  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null)
  const [conv, setConv] = useState<FullConv | null>(null)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── PIN logic ──────────────────────────────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem("avichai_pin")
    if (saved) setPin(saved)
  }, [])

  function submitPin() {
    sessionStorage.setItem("avichai_pin", pinInput)
    setPin(pinInput)
    setPinError(false)
  }

  // ── Fetch sessions list ────────────────────────────────────────
  const fetchSessions = useCallback(async (p = pin) => {
    if (!p) return
    try {
      const res = await fetch(`/api/avichai/sessions?pin=${encodeURIComponent(p)}`)
      if (res.status === 401) { setPinError(true); setPin(""); sessionStorage.removeItem("avichai_pin"); return }
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {}
  }, [pin])

  // ── Fetch full conversation (+ mark read) ───────────────────────
  const fetchConv = useCallback(async (from: string, p = pin) => {
    if (!p) return
    try {
      const res = await fetch(`/api/avichai/sessions?pin=${encodeURIComponent(p)}&from=${encodeURIComponent(from)}`)
      if (!res.ok) return
      const data = await res.json()
      const found = data.sessions?.find((s: any) => s.from === from)
      // We need full messages — fetch via a separate internal endpoint or reconstruct
      // Actually sessions endpoint only gives lastMessage. We need all messages.
      // Use a dedicated full-conv endpoint.
    } catch {}
  }, [pin])

  const fetchFullConv = useCallback(async (from: string) => {
    if (!pin) return
    try {
      const res = await fetch(`/api/avichai/conversation?pin=${encodeURIComponent(pin)}&from=${encodeURIComponent(from)}`)
      if (!res.ok) return
      const data = await res.json()
      setConv(data.conversation)
    } catch {}
  }, [pin])

  // ── Polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pin) return
    fetchSessions()
    pollRef.current = setInterval(() => fetchSessions(), 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pin, fetchSessions])

  useEffect(() => {
    if (!selectedFrom || !pin) return
    fetchFullConv(selectedFrom)
    convPollRef.current = setInterval(() => fetchFullConv(selectedFrom), 2500)
    return () => { if (convPollRef.current) clearInterval(convPollRef.current) }
  }, [selectedFrom, pin, fetchFullConv])

  // ── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conv?.messages.length])

  // ── Actions ────────────────────────────────────────────────────
  async function sendReply() {
    if (!replyText.trim() || !selectedFrom || sending) return
    setSending(true)
    try {
      await fetch(`/api/avichai/reply?pin=${encodeURIComponent(pin)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selectedFrom, text: replyText.trim() }),
      })
      setReplyText("")
      await fetchFullConv(selectedFrom)
      await fetchSessions()
    } finally {
      setSending(false)
    }
  }

  async function resolveConv() {
    if (!selectedFrom || resolving) return
    setResolving(true)
    try {
      await fetch(`/api/avichai/resolve?pin=${encodeURIComponent(pin)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selectedFrom }),
      })
      await fetchSessions()
      await fetchFullConv(selectedFrom)
    } finally {
      setResolving(false)
    }
  }

  function selectSession(from: string) {
    setSelectedFrom(from)
    setConv(null)
    // Mark read in sessions list optimistically
    setSessions(prev => prev.map(s => s.from === from ? { ...s, unreadByAvichai: 0 } : s))
  }

  // ── PIN Screen ─────────────────────────────────────────────────
  if (!pin) {
    return (
      <div style={styles.pinScreen}>
        <div style={styles.pinBox}>
          <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>🔐 כניסה לדשבורד</h2>
          {pinError && <p style={{ color: "#ef4444", marginBottom: 12 }}>PIN שגוי</p>}
          <input
            style={styles.pinInput}
            type="password"
            placeholder="הכנס PIN"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitPin()}
            autoFocus
          />
          <button style={styles.pinBtn} onClick={submitPin}>כניסה</button>
        </div>
      </div>
    )
  }

  // ── Main Dashboard ─────────────────────────────────────────────
  const escalatedCount = sessions.filter(s => s.status === "escalated").length
  const unreadTotal = sessions.reduce((n, s) => n + s.unreadByAvichai, 0)

  return (
    <div style={styles.root} dir="rtl">
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>💬 שיחות</span>
          <div style={{ display: "flex", gap: 6 }}>
            {escalatedCount > 0 && (
              <span style={styles.badgeRed}>{escalatedCount} 🆘</span>
            )}
            {unreadTotal > 0 && (
              <span style={styles.badgeBlue}>{unreadTotal} חדש</span>
            )}
          </div>
        </div>

        <div style={styles.sessionList}>
          {sessions.length === 0 && (
            <p style={{ padding: 16, color: "#9ca3af", textAlign: "center", fontSize: 13 }}>
              אין שיחות עדיין
            </p>
          )}
          {sessions.map(s => (
            <div
              key={s.from}
              onClick={() => selectSession(s.from)}
              style={{
                ...styles.sessionRow,
                background: selectedFrom === s.from ? "#eff6ff" : s.status === "escalated" ? "#fff1f2" : "#fff",
                borderRight: s.status === "escalated" ? "3px solid #ef4444" : selectedFrom === s.from ? "3px solid #3b82f6" : "3px solid transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, direction: "ltr" }}>{s.from}</span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(s.lastActivity)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {s.lastMessage?.text?.slice(0, 50) ?? "—"}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {s.status === "escalated" && <span style={styles.tagRed}>🆘</span>}
                  {s.status === "resolved" && <span style={styles.tagGreen}>✓</span>}
                  {s.unreadByAvichai > 0 && <span style={styles.badgeBlue}>{s.unreadByAvichai}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat Pane */}
      <main style={styles.chatPane}>
        {!selectedFrom ? (
          <div style={styles.emptyState}>
            <p>בחר שיחה מהרשימה משמאל</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 600, direction: "ltr" }}>{selectedFrom}</span>
              {conv && (
                <span style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 9999,
                  background: conv.status === "escalated" ? "#fee2e2" : conv.status === "resolved" ? "#d1fae5" : "#e0e7ff",
                  color: conv.status === "escalated" ? "#b91c1c" : conv.status === "resolved" ? "#065f46" : "#3730a3",
                }}>
                  {conv.status === "escalated" ? "🆘 דרוש מענה" : conv.status === "resolved" ? "✓ נסגר" : "פעיל"}
                </span>
              )}
              {conv?.status !== "resolved" && (
                <button onClick={resolveConv} disabled={resolving} style={styles.resolveBtn}>
                  {resolving ? "..." : "סגור שיחה ✓"}
                </button>
              )}
            </div>

            {/* Messages */}
            <div style={styles.messages}>
              {!conv ? (
                <p style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>טוען...</p>
              ) : conv.messages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>אין הודעות</p>
              ) : (
                conv.messages.map((m, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    marginBottom: 8,
                  }}>
                    <div style={{
                      maxWidth: "70%",
                      padding: "8px 12px",
                      borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      background: m.role === "user" ? "#dcfce7" : m.role === "avichai" ? "#dbeafe" : "#f3f4f6",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}>
                      {m.role === "avichai" && (
                        <span style={{ fontSize: 11, color: "#3b82f6", display: "block", marginBottom: 2 }}>👨‍💼 אביחי</span>
                      )}
                      {m.role === "bot" && (
                        <span style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>🤖 בוט{m.escalate ? " • 🆘" : ""}</span>
                      )}
                      <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af", display: "block", marginTop: 2, textAlign: "left", direction: "ltr" }}>
                        {new Date(m.ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Box */}
            {conv?.status !== "resolved" && (
              <div style={styles.replyBox}>
                <textarea
                  style={styles.replyInput}
                  placeholder="כתוב תשובה..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply() }
                  }}
                  rows={2}
                />
                <button onClick={sendReply} disabled={sending || !replyText.trim()} style={styles.sendBtn}>
                  {sending ? "..." : "שלח ↵"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#f9fafb" },
  sidebar: { width: 280, borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#fff" },
  sidebarHeader: { padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" },
  sessionList: { flex: 1, overflowY: "auto" },
  sessionRow: { padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", transition: "background 0.15s" },
  chatPane: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  chatHeader: { padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10, background: "#fff" },
  messages: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column" },
  replyBox: { padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, background: "#fff" },
  replyInput: { flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, resize: "none", fontFamily: "inherit", direction: "rtl" },
  sendBtn: { padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  resolveBtn: { marginRight: "auto", padding: "4px 12px", background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  emptyState: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" },
  badgeRed: { background: "#fee2e2", color: "#b91c1c", borderRadius: 9999, padding: "1px 7px", fontSize: 11, fontWeight: 600 },
  badgeBlue: { background: "#dbeafe", color: "#1d4ed8", borderRadius: 9999, padding: "1px 7px", fontSize: 11, fontWeight: 600 },
  tagRed: { fontSize: 13 },
  tagGreen: { fontSize: 12, color: "#059669" },
  pinScreen: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f9fafb" },
  pinBox: { background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 280 },
  pinInput: { width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 16, marginBottom: 12, textAlign: "center", boxSizing: "border-box" },
  pinBtn: { width: "100%", padding: "10px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
}
