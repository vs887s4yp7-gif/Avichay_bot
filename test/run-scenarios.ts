// ================================================================
// test/run-scenarios.ts - 50 תרחישי בדיקה אוטומטיים
// הרצה מקומית:  npx tsx test/run-scenarios.ts
// הרצה ב-Vercel: npx tsx test/run-scenarios.ts --url https://avichay-bot.vercel.app
// ================================================================

const BASE_URL = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:3000"

const FROM_BASE = "test_" + Date.now()
const SESSION_FROM = "test_session_" + Date.now()

type Scenario = {
  id: number
  message: string
  expectedIntent: string
  shouldEscalate: boolean
  description: string
  session?: boolean
}

const SCENARIOS: Scenario[] = [
  // ── א': מחיר ────────────────────────────────────────────────
  { id: 1,  message: "כמה עולה אקדח מים?",           expectedIntent: "price",           shouldEscalate: false, description: "מחיר - אקדח מים" },
  { id: 2,  message: "מה המחיר על רובוט לגו?",        expectedIntent: "price",           shouldEscalate: false, description: "מחיר - רובוט לגו" },
  { id: 3,  message: "כמה הכדור המעופף?",             expectedIntent: "price",           shouldEscalate: false, description: "מחיר - כדור מעופף" },
  { id: 4,  message: "כמה עולה פיקאצ'ו?",            expectedIntent: "price",           shouldEscalate: false, description: "מחיר - פיקאצ'ו" },
  { id: 5,  message: "מה המחיר על חרב לייזר?",       expectedIntent: "price",           shouldEscalate: false, description: "מחיר - חרב לייזר" },
  { id: 6,  message: "כמה זה הגלואו סטיק?",           expectedIntent: "price",           shouldEscalate: false, description: "מחיר - גלואו סטיק" },
  { id: 7,  message: "כמה עולים הבלונים?",            expectedIntent: "price",           shouldEscalate: false, description: "מחיר - בלונים" },
  { id: 8,  message: "מה המחיר על מזרון ים?",         expectedIntent: "price",           shouldEscalate: false, description: "מחיר - מזרון ים" },
  { id: 9,  message: "כמה עולה כדורי קצף?",           expectedIntent: "price",           shouldEscalate: false, description: "מחיר - כדורי קצף" },
  { id: 10, message: "כמה הסליים?",                   expectedIntent: "price",           shouldEscalate: false, description: "מחיר - סליים" },

  // ── ב': מלאי ────────────────────────────────────────────────
  { id: 11, message: "יש לך זוהרים?",                 expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - זוהרים" },
  { id: 12, message: "יש מתנפחים?",                   expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - מתנפחים" },
  { id: 13, message: "יש לך בלונים?",                 expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - בלונים" },
  { id: 14, message: "יש סלים?",                      expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - סלים" },
  { id: 15, message: "יש אקדחי מים?",                 expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - אקדחי מים" },
  { id: 16, message: "יש רובוטים?",                   expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - רובוטים" },
  { id: 17, message: "יש לך כדורי כדורגל?",           expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - כדורגל" },
  { id: 18, message: "יש מאוורר יד?",                 expectedIntent: "stock",           shouldEscalate: false, description: "מלאי - מאוורר יד" },
  { id: 19, message: "יש תחפושות?",                   expectedIntent: "category_browse", shouldEscalate: false, description: "מלאי - תחפושות (category)" },
  { id: 20, message: "יש פאזל?",                      expectedIntent: "category_browse", shouldEscalate: false, description: "מלאי - פאזל (category)" },

  // ── ג': הזמנות ──────────────────────────────────────────────
  { id: 21, message: "תכין לי 20 אקדחי מים",          expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - אקדחי מים" },
  { id: 22, message: "תוסיף לי 50 בלונים",            expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - בלונים" },
  { id: 23, message: "אני צריך 10 רובוטים לגו",       expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - רובוטים" },
  { id: 24, message: "תכין קרטון גלואו סטיק",         expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - גלואו סטיק" },
  { id: 25, message: "שולח הזמנה: 30 מזרוני ים",      expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה מפורטת" },
  { id: 26, message: "תביא לי 100 בלוני מים",         expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - בלוני מים" },
  { id: 27, message: "תארגן לי 5 קרטון זוהרים",       expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה - זוהרים" },
  { id: 28, message: "תכין לי: 20 אקדח 10 כדור",     expectedIntent: "order",           shouldEscalate: true,  description: "הזמנה מרובת פריטים" },

  // ── ד': תמונות ──────────────────────────────────────────────
  { id: 29, message: "תשלח לי תמונה של אקדח מים",     expectedIntent: "send_photo",      shouldEscalate: false, description: "תמונה - אקדח מים" },
  { id: 30, message: "שלח תמונות של הזוהרים",         expectedIntent: "send_photo",      shouldEscalate: false, description: "תמונות - זוהרים" },
  { id: 31, message: "יש תמונה של הרובוט?",           expectedIntent: "send_photo",      shouldEscalate: false, description: "תמונה - רובוט" },
  { id: 32, message: "תראה לי תמונות של תחפושות",     expectedIntent: "send_photo",      shouldEscalate: false, description: "תמונות - תחפושות" },
  { id: 33, message: "שלח תמונה של מזרון ים",         expectedIntent: "send_photo",      shouldEscalate: false, description: "תמונה - מזרון" },

  // ── ה': עיון בקטגוריה ───────────────────────────────────────
  { id: 34, message: "מה יש לך לבריכה?",              expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - בריכה" },
  { id: 35, message: "מה יש לך למסיבות?",             expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - מסיבות" },
  { id: 36, message: "מה יש לך לפורים?",              expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - פורים" },
  { id: 37, message: "תראה לי מה יש בספורט",          expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - ספורט" },
  { id: 38, message: "מה יש לך לקיץ?",               expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - קיץ" },

  // ── ו': session ─────────────────────────────────────────────
  { id: 39, message: "יש לך זוהרים?",    expectedIntent: "stock",           shouldEscalate: false, description: "session - פותח רשימה",   session: true },
  { id: 40, message: "2",                 expectedIntent: "stock",           shouldEscalate: false, description: "session - בוחר #2",       session: true },
  { id: 41, message: "מה יש לבריכה?",    expectedIntent: "category_browse", shouldEscalate: false, description: "session - קטגוריה",       session: true },
  { id: 42, message: "עוד",              expectedIntent: "category_browse", shouldEscalate: false, description: "session - עמוד הבא",      session: true },
  { id: 43, message: "יש מתנפחים?",      expectedIntent: "stock",           shouldEscalate: false, description: "session - מתנפחים",       session: true },
  { id: 44, message: "תביא לי את מס 3",  expectedIntent: "stock",           shouldEscalate: false, description: "session - בחירה מורכבת",  session: true },

  // ── ז': ברכות וזהות ─────────────────────────────────────────
  { id: 45, message: "היי",              expectedIntent: "greeting",        shouldEscalate: false, description: "ברכה" },
  { id: 46, message: "מי אתה?",          expectedIntent: "identity",        shouldEscalate: false, description: "זהות - מי אתה" },
  { id: 47, message: "את בוט?",          expectedIntent: "identity",        shouldEscalate: false, description: "זהות - בוט?" },

  // ── ח': חוב ─────────────────────────────────────────────────
  { id: 48, message: "כמה אני חייב?",    expectedIntent: "debt",            shouldEscalate: true,  description: "חוב - יתרה" },
  { id: 49, message: "תעשה לי חשבון",    expectedIntent: "debt",            shouldEscalate: true,  description: "חוב - חשבון" },
  { id: 50, message: "נשאר פתוח 500?",   expectedIntent: "debt",            shouldEscalate: true,  description: "חוב - יתרה פתוחה" },
]

async function run(scenario: Scenario): Promise<{ pass: boolean; actualIntent: string; actualEscalate: boolean; response: string; hasImage: boolean }> {
  const from = scenario.session ? SESSION_FROM : `${FROM_BASE}_${scenario.id}`
  try {
    const res = await fetch(`${BASE_URL}/api/railed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, message: scenario.message }),
    })
    const d = await res.json()
    const intentMatch = d.intent === scenario.expectedIntent
    const escalateMatch = d.escalate === scenario.shouldEscalate
    return {
      pass: intentMatch && escalateMatch,
      actualIntent: d.intent,
      actualEscalate: d.escalate,
      response: (d.response ?? "").slice(0, 70),
      hasImage: !!(d.images?.length || d.imageUrl),
    }
  } catch (e) {
    return { pass: false, actualIntent: "ERROR", actualEscalate: false, response: String(e), hasImage: false }
  }
}

async function main() {
  console.log(`\n👽 חבצול - ${SCENARIOS.length} תרחישי בדיקה | ${BASE_URL}\n${"─".repeat(80)}`)
  let passed = 0
  let failed = 0
  const failures: string[] = []

  for (const s of SCENARIOS) {
    const r = await run(s)
    if (r.pass) {
      passed++
      console.log(`✅ [${s.id}] ${s.description}`)
      console.log(`   "${r.response}"${r.hasImage ? " 🖼️" : ""}`)
    } else {
      failed++
      const line = `[${s.id}] "${s.message}" → ${r.actualIntent} (צפוי: ${s.expectedIntent}) | escalate: ${r.actualEscalate} (צפוי: ${s.shouldEscalate})`
      failures.push(line)
      console.log(`❌ [${s.id}] ${s.description}`)
      console.log(`   ${line}`)
      console.log(`   תשובה: "${r.response}"`)
    }
    await new Promise(r => setTimeout(r, 200))
  }

  const total = passed + failed
  const pct = Math.round(passed / total * 100)
  console.log(`\n${"─".repeat(80)}`)
  console.log(`📊 תוצאות: ${total} תרחישים | ✅ ${passed} עברו | ❌ ${failed} נכשלו`)
  if (failures.length) {
    console.log(`\n🔧 דורשים תיקון (${failures.length}):`)
    failures.forEach(f => console.log(`   ${f}`))
  }
  const emoji = pct >= 80 ? "🟢" : pct >= 60 ? "🟡" : "🔴"
  const label = pct >= 80 ? "מוכן לאביחי!" : pct >= 60 ? "עוד קצת עבודה" : "דורש שיפור"
  console.log(`\n${emoji} ציון: ${pct}% - ${label}\n`)
}

main().catch(console.error)
