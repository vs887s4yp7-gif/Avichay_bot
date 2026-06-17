// POST /api/avichai/resolve — אביחי סוגר שיחה
// מאובטח ב-AVICHAI_PIN
import { NextRequest, NextResponse } from "next/server"
import { resolveConversation } from "@/lib/conversation-store"

function checkPin(req: NextRequest): boolean {
  const pin = req.nextUrl.searchParams.get("pin") ?? req.headers.get("x-avichai-pin") ?? ""
  return pin === (process.env.AVICHAI_PIN ?? "1234")
}

export async function POST(req: NextRequest) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let from: string
  try {
    const body = await req.json()
    from = String(body.from ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!from) {
    return NextResponse.json({ error: "from is required" }, { status: 400 })
  }

  await resolveConversation(from)
  return NextResponse.json({ ok: true })
}
