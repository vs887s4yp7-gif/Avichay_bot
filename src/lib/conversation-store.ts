// ================================================================
// src/lib/conversation-store.ts
// ניהול שיחות ב-Vercel KV (persistent across cold starts)
// ================================================================

import type { Product } from "./types"

export type MessageRole = "user" | "bot" | "avichai"

export type StoredMessage = {
  role: MessageRole
  text: string
  ts: number
  intent?: string
  escalate?: boolean
}

export type ConversationStatus = "active" | "escalated" | "resolved"

export type ConversationRecord = {
  from: string
  status: ConversationStatus
  lastActivity: number
  session: { options: string[]; offset: number; lastProductId: string | null }
  messages: StoredMessage[]
  unreadByAvichai: number   // כמה הודעות אביחי לא ראה עדיין
  unreadByUser: number      // כמה תשובות של אביחי הלקוח לא קיבל עדיין
}

// ── KV client (lazy) ──────────────────────────────────────────
let _kv: any = null

async function getKV() {
  if (_kv) return _kv
  try {
    const mod = await import("@vercel/kv")
    _kv = mod.kv
  } catch {
    // fallback: in-memory (dev/test without KV configured)
    _kv = new InMemoryKV()
  }
  return _kv
}

// ── In-memory fallback (dev) ──────────────────────────────────
class InMemoryKV {
  private store = new Map<string, string>()
  async get(key: string) {
    const v = this.store.get(key)
    return v ? JSON.parse(v) : null
  }
  async set(key: string, value: any, opts?: { ex?: number }) {
    this.store.set(key, JSON.stringify(value))
  }
  async keys(pattern: string) {
    const prefix = pattern.replace("*", "")
    return [...this.store.keys()].filter(k => k.startsWith(prefix))
  }
}

const KEY = (from: string) => `conv:${from}`
const TTL = 60 * 60 * 24  // 24 שעות

// ── Public API ────────────────────────────────────────────────

export async function getConversation(from: string): Promise<ConversationRecord | null> {
  const kv = await getKV()
  return await kv.get(KEY(from))
}

export async function saveConversation(conv: ConversationRecord): Promise<void> {
  const kv = await getKV()
  await kv.set(KEY(conv.from), conv, { ex: TTL })
}

export async function addMessage(
  from: string,
  msg: StoredMessage,
  sessionSnapshot?: ConversationRecord["session"],
  status?: ConversationStatus
): Promise<void> {
  const kv = await getKV()
  const existing: ConversationRecord | null = await kv.get(KEY(from))

  const conv: ConversationRecord = existing ?? {
    from,
    status: "active",
    lastActivity: Date.now(),
    session: { options: [], offset: 0, lastProductId: null },
    messages: [],
    unreadByAvichai: 0,
    unreadByUser: 0,
  }

  conv.messages = [...conv.messages.slice(-49), msg]  // שמור עד 50 הודעות
  conv.lastActivity = Date.now()

  if (sessionSnapshot) conv.session = sessionSnapshot
  if (status) conv.status = status
  if (msg.role === "user") conv.unreadByAvichai++
  if (msg.role === "avichai") conv.unreadByUser++

  await kv.set(KEY(from), conv, { ex: TTL })
}

export async function getAllConversations(): Promise<ConversationRecord[]> {
  const kv = await getKV()
  const keys: string[] = await kv.keys("conv:*")
  if (!keys.length) return []

  const results = await Promise.all(keys.map(k => kv.get(k)))
  return (results.filter(Boolean) as ConversationRecord[])
    .sort((a, b) => b.lastActivity - a.lastActivity)
}

export async function markReadByAvichai(from: string): Promise<void> {
  const kv = await getKV()
  const conv: ConversationRecord | null = await kv.get(KEY(from))
  if (!conv) return
  conv.unreadByAvichai = 0
  await kv.set(KEY(from), conv, { ex: TTL })
}

export async function markReadByUser(from: string): Promise<void> {
  const kv = await getKV()
  const conv: ConversationRecord | null = await kv.get(KEY(from))
  if (!conv) return
  conv.unreadByUser = 0
  await kv.set(KEY(from), conv, { ex: TTL })
}

export async function resolveConversation(from: string): Promise<void> {
  const kv = await getKV()
  const conv: ConversationRecord | null = await kv.get(KEY(from))
  if (!conv) return
  conv.status = "resolved"
  await kv.set(KEY(from), conv, { ex: TTL })
}
