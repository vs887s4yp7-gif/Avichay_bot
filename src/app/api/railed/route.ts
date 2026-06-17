// ================================================================
// src/app/api/railed/route.ts
// ================================================================
// 🚂 ה-endpoint של ה-Railed Bot (חבצול 👽)
//
// POST /api/railed
// Body: { from: string; message: string }  (from = מספר טלפון)
// Response: { response: string; escalate: boolean; intent: string; imageUrl?: string }
//
// Session per-customer: שומר { options: Product[], offset: number }
// בזיכרון (Map). מתאים ל-Vercel Serverless כל עוד אין cold-start ממושך;
// להחליף ב-Vercel KV / Redis לפרודקשן אמיתי (ראה הערה בתוך הקוד).
// ================================================================

import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { recognize } from "@/lib/recognize"
import { logTurn, markOutcome } from "@/lib/conversation-logger"
import type { Product } from "@/lib/types"

// ================================================================
// Session Store
// ================================================================
// 💡 לפרודקשן: החלף ב-Vercel KV:
//   import { kv } from "@vercel/kv"
//   const session = await kv.get<Session>(`railed:${from}`)
//   await kv.set(`railed:${from}`, newSession, { ex: 3600 })
//
// כרגע: Map בזיכרון (מתאפס ב-cold start, מספיק להדגמה/POC)
type Session = { options: Product[]; offset: number; lastProduct: Product | null }
const sessionStore = new Map<string, Session>()

function getSession(from: string): Session {
  return sessionStore.get(from) ?? { options: [], offset: 0, lastProduct: null }
}
function setSession(from: string, session: Session): void {
  sessionStore.set(from, session)
}
function clearSession(from: string): void {
  sessionStore.delete(from)
}

// ================================================================
// Catalog (טעינה חד-פעמית + cache)
// ================================================================
let _catalog: Product[] | null = null

function loadCatalog(): Product[] {
  if (_catalog) return _catalog

  const candidates = [
    path.join(process.cwd(), "data/catalog.json"),
    path.join(process.cwd(), "src/lib/catalog.json"),
  ]
  let rawText: string | null = null
  for (const p of candidates) {
    if (fs.existsSync(p)) { rawText = fs.readFileSync(p, "utf-8"); break }
  }
  if (!rawText) throw new Error("catalog.json לא נמצא!")

  const parsed = JSON.parse(rawText)
  const rawProducts: any[] = Array.isArray(parsed) ? parsed : parsed.products

  _catalog = rawProducts.map((raw) => {
    const noRealImage = raw.image_file === null || raw.image_available === false
    let image: string | null
    if (noRealImage) image = null
    else if (raw.image) image = raw.image
    else if (raw.image_file) image = `/catalog-images/${raw.image_file}`
    else image = `/catalog-images/${raw.id}.jpg`

    return {
      id: raw.id,
      name: raw.name ?? "",
      description: raw.description ?? null,
      category: raw.category ?? null,
      subcategory: raw.subcategory ?? null,
      tags: raw.tags ?? raw.nicknames ?? [],
      price: raw.price ?? raw.wholesale_price ?? null,
      cartonQty: raw.cartonQty ?? raw.carton_qty ?? null,
      stock: raw.stock ?? raw.stock_status ?? null,
      image,
    }
  })
  return _catalog
}

// ================================================================
// POST handler
// ================================================================
export async function POST(req: NextRequest) {
  let from: string
  let message: string

  try {
    const body = await req.json()
    from = String(body.from ?? "unknown").trim()
    message = String(body.message ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 })
  }

  // ----------------------------------------------------------------
  // קטלוג + session
  // ----------------------------------------------------------------
  let catalog: Product[]
  try {
    catalog = loadCatalog()
  } catch (e) {
    console.error("Catalog load error:", e)
    return NextResponse.json({ error: "catalog unavailable" }, { status: 500 })
  }

  const session = getSession(from)

  // ----------------------------------------------------------------
  // recognize
  // ----------------------------------------------------------------
  const t0 = Date.now()
  const result = recognize(message, catalog, session.options, session.offset, session.lastProduct)
  const elapsed = Date.now() - t0

  // ----------------------------------------------------------------
  // עדכון session + לוגינג
  // ----------------------------------------------------------------
  const newOptions = result.context.options ?? []
  const newOffset = result.context.optionsOffset ?? 0
  // If this turn resolved a product, remember it; otherwise keep previous lastProduct.
  const newLastProduct = result.context.product ?? session.lastProduct

  setSession(from, {
    options: newOptions.length >= 2 ? newOptions : [],
    offset: newOptions.length >= 2 ? newOffset : 0,
    lastProduct: newLastProduct,
  })

  // לוג כל turn
  logTurn(from, message, result, newOptions.length)

  // הזמנה הגיעה -> סמן outcome=order על כל השיחה הנוכחית
  if (result.intent === "order" && !result.escalate) {
    markOutcome(from, "order")
  }

  // ----------------------------------------------------------------
  // בניית תשובה
  // ----------------------------------------------------------------
  // הסרת ה-[[PRODUCT:Pxxxx]] placeholders מהטקסט הגולמי.
  // ב-WhatsApp שולחים טקסט בלבד (תמונות יישלחו בנפרד).
  const PRODUCT_PLACEHOLDER = /\[\[PRODUCT:([A-Z0-9]+)\]\]/g
  const productIds: string[] = []
  const cleanResponse = result.response.replace(PRODUCT_PLACEHOLDER, (_, id) => {
    productIds.push(id)
    return ""
  }).replace(/\s{2,}/g, " ").trim()

  // 🆕 כל התמונות של המוצרים שהוזכרו (carousel)
  // product IDs מגיעים מ-[[PRODUCT:xxx]] ב-response, או מה-options session
  const allIds = productIds.length > 0
    ? productIds
    : (result.context.options ?? []).slice(0, 5).map((p) => p.id)

  const images = allIds
    .map((id) => {
      const p = catalog.find((p) => p.id === id)
      if (!p || !p.image) return null
      return { id: p.id, url: p.image, name: p.name, price: p.price }
    })
    .filter((x): x is { id: string; url: string; name: string; price: number | null } => x !== null)

  // תאימות לאחור - imageUrl עדיין קיים לצורך WhatsApp (תמונה ראשונה בלבד)
  const imageUrl = images[0]?.url

  // ----------------------------------------------------------------
  // לוג (לדיבוג - אפשר להסיר בפרודקשן)
  // ----------------------------------------------------------------
  console.log(JSON.stringify({
    from,
    message: message.slice(0, 80),
    intent: result.intent,
    escalate: result.escalate,
    hasProduct: result.debug.hasStrongProduct,
    topScore: result.debug.topMatches[0]?.score ?? 0,
    sessionSize: newOptions.length,
    elapsed,
  }))

  return NextResponse.json({
    response: cleanResponse,
    escalate: result.escalate,
    intent: result.intent,
    imageUrl,
    images,  // 🆕 carousel - כל התמונות
    debug: {
      topMatch: result.debug.topMatches[0] ?? null,
      hasStrongProduct: result.debug.hasStrongProduct,
      sessionOptions: newOptions.length,
      elapsed,
    },
  })
}

// ================================================================
// GET /api/railed?from=XXX - ניקוי session ידני (לבדיקות)
// ================================================================
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from")
  if (!from) return NextResponse.json({ error: "from required" }, { status: 400 })
  clearSession(from)
  return NextResponse.json({ ok: true, cleared: from })
}
