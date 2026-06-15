// ================================================================
// src/scripts/analyze-conversations.ts
// ================================================================
// 🔍 מנתח שבועי - קורא logs/conversations.jsonl ומייצר
// improvements.json עם המלצות מדויקות לשיפור.
//
// הרצה:  npx tsx src/scripts/analyze-conversations.ts
// פלט:   logs/improvements-YYYY-MM-DD.json
//
// מה הוא מנתח:
//   1. escalations מיותרים (intent=escalate_other, הודעה לא ריקה)
//   2. שיחות עם outcome=abandon (לקוח עזב ללא הזמנה)
//   3. keywords שחוזרים בהודעות לא-מזוהות
//   4. מוצרים שנשאלים הרבה אבל לא נמצאים (topScore<10)
//   5. שיחות עם outcome=order (מה עבד! לחזק)
//
// הפלט הוא JSON שאתה סוקר ואחר כך מחיל ידנית על intents.ts
// ================================================================

import fs from "fs"
import path from "path"
import Anthropic from "@anthropic-ai/sdk"
import type { ConversationTurn } from "../lib/conversation-logger"

const LOG_FILE = path.join(process.cwd(), "logs", "conversations.jsonl")
const IMPROVEMENTS_DIR = path.join(process.cwd(), "logs")

// ================================================================
// 1. טעינה + ניתוח סטטיסטי בסיסי (ללא API)
// ================================================================
function loadAndStats(days = 7): {
  turns: ConversationTurn[]
  stats: Record<string, number>
  problemTurns: ConversationTurn[]
  successTurns: ConversationTurn[]
  abandonTurns: ConversationTurn[]
} {
  if (!fs.existsSync(LOG_FILE)) {
    throw new Error(`לא נמצא קובץ לוג: ${LOG_FILE}`)
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean)
  const turns: ConversationTurn[] = lines
    .map((l) => { try { return JSON.parse(l) as ConversationTurn } catch { return null } })
    .filter((t): t is ConversationTurn => t !== null && t.ts >= cutoff)

  const stats: Record<string, number> = {}
  for (const t of turns) {
    stats[t.intent] = (stats[t.intent] ?? 0) + 1
    if (t.escalate) stats["total_escalate"] = (stats["total_escalate"] ?? 0) + 1
    if (t.outcome === "order") stats["outcome_order"] = (stats["outcome_order"] ?? 0) + 1
    if (t.outcome === "abandon") stats["outcome_abandon"] = (stats["outcome_abandon"] ?? 0) + 1
  }
  stats["total"] = turns.length

  // Turn-ים בעייתיים: escalate_other + הודעה לא ריקה + לא מסיבת חוב/הנחה
  const problemTurns = turns.filter(
    (t) => t.intent === "escalate_other" && t.message.length > 3 && t.topScore < 10
  )

  // הצלחות: הזמנות שהגיעו
  const successTurns = turns.filter((t) => t.outcome === "order")

  // נטישות: שיחות שנסגרו ב-escalate בלי הזמנה
  const abandonTurns = turns.filter(
    (t) => t.outcome === "abandon" && t.escalate
  )

  return { turns, stats, problemTurns, successTurns, abandonTurns }
}

// ================================================================
// 2. ניתוח Claude - שולח batch של הודעות בעייתיות
// ================================================================
async function analyzeWithClaude(
  problemTurns: ConversationTurn[],
  successTurns: ConversationTurn[],
  abandonTurns: ConversationTurn[],
  stats: Record<string, number>
): Promise<object> {
  const client = new Anthropic()

  // טען intents קיימים כדי ש-Claude לא ימליץ על דברים שכבר קיימים
  let existingIntents = ""
  try {
    const intentsPath = path.join(process.cwd(), "src/lib/intents.ts")
    if (fs.existsSync(intentsPath)) {
      const content = fs.readFileSync(intentsPath, "utf-8")
      // חלץ רק את ה-keywords (לא את כל הקוד)
      const keywordMatches = content.match(/keywords:\s*\[([^\]]+)\]/g) ?? []
      existingIntents = `\n## Intents וKeywords קיימים (אל תמליץ על משהו שכבר קיים!):\n${keywordMatches.slice(0, 20).join("\n")}\n`
    }
  } catch {}

  const prompt = `${existingIntents}
אתה מנתח ביצועים של חבצול 👽 - בוט WhatsApp סיטוני לצעצועים (שלי צעצועים).

## מטרות הבוט (לפי עדיפות):
1. **0 טעויות** - לעולם לא לתת מחיר שגוי / מוצר שגוי
2. **מינימום נטישות** - לקוח לא ייפסיק שיחה בגלל תשובה גרועה
3. **מקסימום הזמנות** - לנווט שיחות להזמנה

## נתוני השבוע:
${JSON.stringify(stats, null, 2)}

## הודעות שלא זוהו (escalate_other, ${problemTurns.length} במספר):
${problemTurns.slice(0, 30).map((t, i) => `${i + 1}. "${t.message}" (score=${t.topScore}, topMatch="${t.topMatch}")`).join("\n")}

## שיחות שהסתיימו בנטישה (${abandonTurns.length}):
${abandonTurns.slice(0, 15).map((t) => `- "${t.message}" → intent:${t.intent} escalate:${t.escalate}`).join("\n")}

## שיחות שהסתיימו בהזמנה (${successTurns.length}) - מה עבד:
${successTurns.slice(0, 10).map((t) => `- "${t.message}" → intent:${t.intent}`).join("\n")}

## המשימה שלך:
נתח ותחזיר JSON בדיוק בפורמט הזה (בלי markdown, רק JSON):
{
  "summary": "סיכום 2-3 משפטים על השבוע",
  "kpis": {
    "escalate_rate_pct": number,
    "order_rate_pct": number,
    "abandon_rate_pct": number
  },
  "new_keywords": [
    {
      "intent": "stock|price|order|category_browse|...",
      "keyword": "מילת מפתח חדשה",
      "reason": "למה",
      "examples": ["הודעה 1", "הודעה 2"]
    }
  ],
  "new_category_keywords": [
    {
      "category": "summer_pool|costumes_purim|...",
      "keyword": "מילת מפתח",
      "reason": "למה"
    }
  ],
  "missing_nicknames": [
    {
      "product_id": "P0xxx (אם ידוע)",
      "suggested_nickname": "כינוי חדש לקטלוג",
      "reason": "איזו הודעה גרמה להמלצה זו"
    }
  ],
  "flow_issues": [
    {
      "issue": "תיאור הבעיה",
      "example": "הודעה לדוגמה",
      "suggested_fix": "פתרון מוצע"
    }
  ],
  "wins": ["מה עבד טוב השבוע"]
}
`

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  })

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("")

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim())
  } catch {
    return { raw: text, parse_error: true }
  }
}

// ================================================================
// 3. הפעלה ראשית
// ================================================================
async function main() {
  const days = parseInt(process.argv[2] ?? "7", 10)
  console.log(`\n📊 מנתח ${days} ימים אחרונים מ-${LOG_FILE}...\n`)

  const { turns, stats, problemTurns, successTurns, abandonTurns } = loadAndStats(days)

  if (turns.length === 0) {
    console.log("⚠️  אין נתונים בלוג. האם חבצול כבר פעיל?")
    process.exit(0)
  }

  // סטטיסטיקה מיידית
  console.log("=== סטטיסטיקה בסיסית ===")
  console.log(`סה"כ turns: ${stats.total}`)
  console.log(`escalate_other: ${stats.escalate_other ?? 0} (${(((stats.escalate_other ?? 0) / stats.total) * 100).toFixed(0)}%)`)
  console.log(`הזמנות: ${stats.outcome_order ?? 0}`)
  console.log(`נטישות: ${stats.outcome_abandon ?? 0}`)
  console.log(`בעיות לניתוח: ${problemTurns.length}`)

  if (problemTurns.length === 0 && abandonTurns.length === 0) {
    console.log("\n🎉 אין בעיות לדיווח! כל ה-turns טופלו תקין.")
    process.exit(0)
  }

  console.log("\n🤖 שולח ל-Claude לניתוח עמוק...")
  const improvements = await analyzeWithClaude(problemTurns, successTurns, abandonTurns, stats)

  // שמירה
  const date = new Date().toISOString().slice(0, 10)
  const outFile = path.join(IMPROVEMENTS_DIR, `improvements-${date}.json`)
  fs.writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), stats, improvements }, null, 2), "utf-8")

  console.log(`\n✅ נשמר: ${outFile}`)
  console.log("\n=== תוצאות ===")
  const imp = improvements as any
  if (imp.summary) console.log("\nסיכום:", imp.summary)
  if (imp.kpis) console.log("\nKPIs:", JSON.stringify(imp.kpis, null, 2))
  if (imp.new_keywords?.length) {
    console.log(`\n🔑 Keywords חדשים מומלצים (${imp.new_keywords.length}):`)
    imp.new_keywords.forEach((k: any) => console.log(`  → [${k.intent}] "${k.keyword}" - ${k.reason}`))
  }
  if (imp.missing_nicknames?.length) {
    console.log(`\n📋 כינויים חסרים בקטלוג (${imp.missing_nicknames.length}):`)
    imp.missing_nicknames.forEach((n: any) => console.log(`  → ${n.product_id}: "${n.suggested_nickname}"`))
  }
  if (imp.flow_issues?.length) {
    console.log(`\n⚠️  בעיות זרימה (${imp.flow_issues.length}):`)
    imp.flow_issues.forEach((f: any) => console.log(`  → ${f.issue}\n     תיקון: ${f.suggested_fix}`))
  }
  if (imp.wins?.length) {
    console.log(`\n🏆 מה עבד:`)
    imp.wins.forEach((w: string) => console.log(`  ✓ ${w}`))
  }

  console.log(`\n📋 סקור את ${outFile} ואחלה את השינויים ב-intents.ts לפני deploy!`)
}

main().catch(console.error)
