// ================================================================
// src/lib/test-with-catalog.ts
// ================================================================
// 🧪 הבדיקה האמיתית: 97 פניות אמיתיות + קטלוג אמיתי (366 מוצרים)
// דרך recognize() המלא - כולל searchCatalog + threshold + quantity.
//
// הרצה:  npx tsx src/lib/test-with-catalog.ts
// דרישה: data/catalog.json (או catalog.json ליד הסקריפט)
// פלט:   real-cases-catalog-report.csv
// ================================================================

import * as fs from "fs"
import * as path from "path"
import { recognize } from "./recognize"
import { REAL_CASES } from "./real-cases"
import type { Product } from "./types"

// ----------------------------------------------------------------
// טעינת קטלוג - תומך בשני הפורמטים (כמו normalizeProduct ב-route.ts)
// ----------------------------------------------------------------
function loadCatalog(): Product[] {
  const candidates = ["data/catalog.json", "catalog.json", path.join(__dirname, "catalog.json"), path.join(__dirname, "../../data/catalog.json")]
  let rawText: string | null = null
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      rawText = fs.readFileSync(p, "utf-8")
      console.log(`📂 קטלוג נטען מ: ${p}`)
      break
    }
  }
  if (!rawText) throw new Error("catalog.json לא נמצא!")

  const parsed = JSON.parse(rawText)
  const rawProducts: any[] = Array.isArray(parsed) ? parsed : parsed.products

  return rawProducts.map((raw) => {
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
}

// ----------------------------------------------------------------
// הרצה
// ----------------------------------------------------------------
function run() {
  const catalog = loadCatalog()
  console.log(`✅ ${catalog.length} מוצרים בקטלוג\n`)

  const rows: string[][] = [
    ["#", "customer", "date", "message", "intent", "score", "matched_product", "escalation", "bot_response", "avichai_actual"],
  ]

  const intentCounts: Record<string, number> = {}
  let escalations = 0
  let directAnswers = 0

  REAL_CASES.forEach((rc, idx) => {
    const result = recognize(rc.message, catalog)

    intentCounts[result.intent] = (intentCounts[result.intent] ?? 0) + 1
    if (result.escalate) escalations++
    else directAnswers++

    const topMatch = result.debug.topMatches[0]
    const matchStr = topMatch ? `${topMatch.id} (${topMatch.score})` : ""

    console.log(`\n[${idx + 1}] 💬 ${rc.customer}: "${rc.message.slice(0, 90)}${rc.message.length > 90 ? "..." : ""}"`)
    console.log(`    Intent: ${result.intent}${result.debug.category ? ` (${result.debug.category})` : ""} | match: ${matchStr || "-"} | strong: ${result.debug.hasStrongProduct ? "YES" : "no"} | escalate: ${result.escalate ? "YES" : "no"}`)
    console.log(`    🤖 "${result.response.slice(0, 130).replace(/\n/g, " / ")}"`)
    console.log(`    👤 "${rc.avichaiResponse.slice(0, 100)}"`)

    rows.push([
      String(idx + 1),
      rc.customer,
      rc.date,
      rc.message,
      result.intent,
      topMatch ? String(topMatch.score) : "",
      topMatch ? `${topMatch.id} ${topMatch.name}` : "",
      result.escalate ? "YES" : "no",
      result.response.replace(/\n/g, " / "),
      rc.avichaiResponse,
    ])
  })

  const csv = "\uFEFF" + rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  fs.writeFileSync("real-cases-catalog-report.csv", csv, "utf-8")

  console.log("\n\n=== התפלגות Intents (97 פניות, קטלוג אמיתי) ===")
  Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([intent, count]) => {
      console.log(`  ${intent}: ${count} (${((count / REAL_CASES.length) * 100).toFixed(0)}%)`)
    })

  console.log(`\n📊 תשובות ישירות (ללא אביחי): ${directAnswers} (${((directAnswers / REAL_CASES.length) * 100).toFixed(0)}%)`)
  console.log(`📊 אסקלציות לאביחי: ${escalations} (${((escalations / REAL_CASES.length) * 100).toFixed(0)}%)`)
  console.log(`\n📄 דוח: real-cases-catalog-report.csv`)
}

run()
