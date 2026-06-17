// GET /api/avichai/sessions — רשימת כל השיחות הפעילות
// מאובטח ב-AVICHAI_PIN
import { NextRequest, NextResponse } from "next/server"
import { getAllConversations, markReadByAvichai } from "@/lib/conversation-store"

function checkPin(req: NextRequest): boolean {
  const pin = req.nextUrl.searchParams.get("pin") ?? req.headers.get("x-avichai-pin") ?? ""
  return pin === (process.env.AVICHAI_PIN ?? "1234")
}

export async function GET(req: NextRequest) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const from = req.nextUrl.searchParams.get("from")

  // אם נשלח from — סמן כנקרא ע"י אביחי
  if (from) {
    markReadByAvichai(from).catch(() => {})
  }

  const convs = await getAllConversations()

  return NextResponse.json({
    sessions: convs.map(c => ({
      from: c.from,
      status: c.status,
      lastActivity: c.lastActivity,
      unreadByAvichai: c.unreadByAvichai,
      lastMessage: c.messages.at(-1) ?? null,
      messageCount: c.messages.length,
    }))
  })
}
