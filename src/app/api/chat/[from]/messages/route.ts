// GET /api/chat/[from]/messages
// לקוח מבצע polling כל 2s — מקבל הודעות חדשות מאביחי
import { NextRequest, NextResponse } from "next/server"
import { getConversation, markReadByUser } from "@/lib/conversation-store"

export async function GET(
  req: NextRequest,
  { params }: { params: { from: string } }
) {
  const from = params.from
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0)

  const conv = await getConversation(from)
  if (!conv) return NextResponse.json({ messages: [], status: "active" })

  // החזר רק הודעות של אביחי שהגיעו אחרי `since`
  const newMessages = conv.messages.filter(
    m => m.role === "avichai" && m.ts > since
  )

  if (newMessages.length > 0) {
    markReadByUser(from).catch(() => {})
  }

  return NextResponse.json({
    messages: newMessages,
    status: conv.status,
    unreadByUser: conv.unreadByUser,
  })
}
