// GET /api/avichai/conversation?pin=XXX&from=YYY
// מחזיר שיחה מלאה כולל כל ההודעות, וסומן כנקרא ע"י אביחי
import { NextRequest, NextResponse } from "next/server"
import { getConversation, markReadByAvichai } from "@/lib/conversation-store"

function checkPin(req: NextRequest): boolean {
  const pin = req.nextUrl.searchParams.get("pin") ?? req.headers.get("x-avichai-pin") ?? ""
  return pin === (process.env.AVICHAI_PIN ?? "1234")
}

export async function GET(req: NextRequest) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const from = req.nextUrl.searchParams.get("from")
  if (!from) return NextResponse.json({ error: "from required" }, { status: 400 })

  const conv = await getConversation(from)
  if (!conv) return NextResponse.json({ conversation: null })

  // סמן כנקרא
  markReadByAvichai(from).catch(() => {})

  return NextResponse.json({ conversation: conv })
}
