// ================================================================
// src/lib/test-interactive.ts
// ================================================================
// 🎮 מגרש משחקים אינטראקטיבי ללוגיקת הזיהוי.
// מקלידים הודעה כמו לקוח -> רואים את כל שרשרת ההחלטות:
// טוקנים, התאמות+scores+ראיות, רמת ביטחון, intent, תשובה, escalation.
//
// 🆕 הדגמת "session": כשהבוט מציג רשימה ממוספרת (1-5), השיחה זוכרת
// אותה - תגובה הבאה כמו "2" תיפתר ישירות לאותו מוצר (recognizeSelection).
//
// הרצה:  npx tsx src/lib/test-interactive.ts
// יציאה: exit / ctrl+C
//
// פקודות מיוחדות:
//   /top הודעה   -> מציג 10 התאמות במקום topN הנוכחי
//   /tok הודעה   -> מציג רק את הטוקנים אחרי נרמול
//   /n <מספר>    -> שינוי topN (1-50)
//   /reset       -> איפוס ה-session (אפשרויות ממתינות)
// ================================================================

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import { recognize, searchCatalog, tokenize, recognizeSelection, recognizeMore, MIN_SCORE_THRESHOLD, CONFIDENT_SCORE_THRESHOLD } from "./recognize"
import type { Product } from "./types"

// ----------------------------------------------------------------
// טעינת קטלוג (זהה ל-test-with-catalog.ts)
// ----------------------------------------------------------------
function loadCatalog(): Product[] {
  const candidates = [
    "data/catalog.json",
    "catalog.json",
    path.join(__dirname, "catalog.json"),
    path.join(__dirname, "../../data/catalog.json"),
  ]
  let rawText: string | null = null
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      rawText = fs.readFileSync(p, "utf-8")
      console.log(`📂 קטלוג: ${p}`)
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
// הדפסת ניתוח מלא של הודעה. מחזיר את "האפשרויות הממתינות" החדשות
// (אם הבוט הציג רשימה ממוספרת) - לשמירה ב-session לתור הבא.
// ----------------------------------------------------------------
type Session = { options: Product[]; offset: number }

function analyze(message: string, catalog: Product[], session: Session, topN: number): Session {
  const t0 = performance.now()

  // 🆕 הדגמת session: "2" מתוך הרשימה הקודמת? "עוד" -> עמוד הבא?
  const selected = recognizeSelection(message, session.options, session.offset)
  if (selected) {
    console.log("─".repeat(70))
    console.log(`🔢 בחירה מהרשימה: #${session.options.indexOf(selected) + 1} -> ${selected.id}`)
  } else if (session.options.length > 0 && recognizeMore(message)) {
    console.log("─".repeat(70))
    console.log(`➡️  "עוד" - עמוד הבא (offset ${session.offset} -> ${session.offset + 5})`)
  }

  const result = recognize(message, catalog, session.options, session.offset)
  const elapsed = (performance.now() - t0).toFixed(1)

  const tokens = tokenize(message)
  const matches = searchCatalog(message, catalog)

  console.log("─".repeat(70))
  console.log(`🔤 טוקנים (${tokens.length}): ${tokens.join(" | ")}`)
  console.log()

  if (matches.length === 0) {
    console.log("🔍 התאמות: אין")
  } else {
    console.log(`🔍 התאמות (top ${Math.min(topN, matches.length)} מתוך ${matches.length}):`)
    for (const m of matches.slice(0, topN)) {
      const conf =
        m.score >= CONFIDENT_SCORE_THRESHOLD || m.strongEvidence.length >= 2 ? "🟢" :
        m.score >= MIN_SCORE_THRESHOLD && m.strongEvidence.length >= 1 ? "🟡" : "🔴"
      console.log(`   ${conf} ${m.product.id} [${m.score}] ${m.product.name}`)
      console.log(`      ראיות: ${m.strongEvidence.length > 0 ? m.strongEvidence.join(", ") : "(אין - רעש בלבד)"} | מחיר: ${m.product.price ?? "❌"} | תמונה: ${m.product.image ? "✅" : "❌"}`)
    }
  }

  console.log()
  console.log(`🎯 Intent: ${result.intent}${result.debug.category ? ` | קטגוריה: ${result.debug.category}` : ""}`)
  console.log(`   מוצר חזק: ${result.debug.hasStrongProduct ? "כן" : "לא"} | אישור נדרש: ${result.context.needsConfirmation ? "כן 🟡" : "לא"} | כמות: ${result.context.quantity ?? "-"}`)
  console.log(`   Escalation: ${result.escalate ? "כן 🙏" : "לא ✅"} | ${elapsed}ms`)
  console.log()
  console.log(`🤖 ${result.response}`)
  console.log("─".repeat(70))

  // אפשרויות חדשות לשמירה ב-session: או "options" (התאמה מעורפלת)
  // או "categoryProducts" (category_browse / send_photo) - שתיהן
  // מוצגות ע"י formatOptions כרשימה ממוספרת.
  const newOptions = result.context.options ?? []
  const newOffset = result.context.optionsOffset ?? 0

  if (newOptions.length >= 2) {
    const pageEnd = Math.min(newOffset + 5, newOptions.length)
    console.log(`💾 [session] ${newOptions.length} אפשרויות בסה"כ | מוצג עד כה: 1-${pageEnd} | אפשר "1".."${pageEnd}"${newOptions.length > pageEnd ? ' או "עוד"' : ""}`)
    return { options: newOptions, offset: newOffset }
  }

  return { options: [], offset: 0 }
}

// ----------------------------------------------------------------
// REPL
// ----------------------------------------------------------------
function main() {
  const catalog = loadCatalog()

  // topN קונפיגורבילי בלי לערוך קוד:
  //   npx tsx src/lib/test-interactive.ts --top 10
  //   TOP_N=10 npx tsx src/lib/test-interactive.ts
  //   או בזמן ריצה: /n 10
  let topN = 10
  const argIdx = process.argv.indexOf("--top")
  if (argIdx !== -1 && process.argv[argIdx + 1]) topN = parseInt(process.argv[argIdx + 1], 10) || 10
  else if (process.env.TOP_N) topN = parseInt(process.env.TOP_N, 10) || 10

  console.log(`✅ ${catalog.length} מוצרים | ספים: זיהוי=${MIN_SCORE_THRESHOLD}, ביטחון=${CONFIDENT_SCORE_THRESHOLD} | top=${topN}`)
  console.log(`💬 הקלד הודעה כמו לקוח (exit, /top, /tok, /n <מס'>, /reset). השב "1".."5" לבחירה, "עוד" לעמוד הבא:\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "לקוח> " })
  let session: Session = { options: [], offset: 0 }
  rl.prompt()

  rl.on("line", (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }
    if (input === "exit" || input === "quit") { rl.close(); return }

    if (input === "/reset") {
      session = { options: [], offset: 0 }
      console.log("🔄 session אופס (אין אפשרויות ממתינות)")
    } else if (input.startsWith("/tok ")) {
      console.log("🔤", tokenize(input.slice(5)).join(" | "))
    } else if (input.startsWith("/n ")) {
      const n = parseInt(input.slice(3), 10)
      if (n >= 1 && n <= 50) { topN = n; console.log(`✅ top=${topN}`) }
      else console.log("❌ מספר בין 1 ל-50")
    } else if (input.startsWith("/top ")) {
      session = analyze(input.slice(5), catalog, session, 10)
    } else {
      session = analyze(input, catalog, session, topN)
    }
    rl.prompt()
  })

  rl.on("close", () => {
    console.log("\n👋 ביי!")
    process.exit(0)
  })
}

main()
