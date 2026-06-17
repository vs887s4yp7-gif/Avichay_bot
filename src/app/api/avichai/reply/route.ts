// POST /api/avichai/reply — אביחי שולח תשובה ללקוח
// מאובטח ב-AVICHAI_PIN
import { NextRequest, NextResponse } from "next/server"
import { addMessage } from "@/lib/conversation-store"

function checkPin(req: NextRequest): boolean {
  const pin = req.nextUrl.searchParams.get("pin") ?? req.headers.get("x-avichai-pin") ?? ""
  return pin === (process.env.AVICHAI_PIN ?? "1234")
}

export async function POST(req: NextRequest) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let from: string
  let text: string
  try {
    const body = await req.json()
    from = String(body.from ?? "").trim()
    text = String(body.text ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!from || !text) {
    return NextResponse.json({ error: "from and text are required" }, { status: 400 })
  }

  await addMessage(from, {
    role: "avichai",
    text,
    ts: Date.now(),
  })

  return NextResponse.json({ ok: true })
}
