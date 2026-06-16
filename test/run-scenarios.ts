// ================================================================
// test/run-scenarios.ts
// ================================================================
// מריץ 50 תרחישי בדיקה אוטומטיים על חבצול ומדפיס ציון
//
// הרצה מקומית:  npx tsx test/run-scenarios.ts
// הרצה ב-Vercel: npx tsx test/run-scenarios.ts --url https://avichay-bot.vercel.app
// ================================================================

const BASE_URL = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:3000"

const FROM = "test_auto_" + Date.now()

type Scenario = {
  id: number
  message: string
  expectedIntent: string
  shouldEscalate: boolean
  description: string
}

const SCENARIOS: Scenario[] = [
  // מחיר
  { id: 1, message: "כמה עולה אקדח מים?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר - אקדח מים" },
  { id: 2, message: "מה המחיר על רובוט לגו?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר - רובוט" },
  { id: 3, message: "כמה הכדור המעופף?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר - כדור מעופף" },
  { id: 4, message: "כמה זה הגלואו סטיק?", expectedIntent: "stock", shouldEscalate: false, description: "שאלת מחיר - גלואו סטיק" },
  { id: 5, message: "כמה עולים הבלונים?", expectedIntent: "stock", shouldEscalate: false, description: "שאלת מחיר - בלונים" },
  { id: 6, message: "מה המחיר על מזרון ים?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר - מזרון" },
  { id: 7, message: "כמה עולה כדורי קצף?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר - כדורי קצף" },

  // מלאי
  { id: 8, message: "יש לך זוהרים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - זוהרים" },
  { id: 9, message: "יש מתנפחים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - מתנפחים" },
  { id: 10, message: "יש לך בלונים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - בלונים" },
  { id: 11, message: "יש סלים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - סלים" },
  { id: 12, message: "יש אקדחי מים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - אקדחי מים" },
  { id: 13, message: "יש רובוטים?", expectedIntent: "stock", shouldEscalate: false, description: "מלאי - רובוטים" },

  // קטגוריה
  { id: 14, message: "מה יש לך לבריכה?", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - בריכה" },
  { id: 15, message: "מה יש לך למסיבות?", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - מסיבות" },
  { id: 16, message: "מה יש לך לפורים?", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - פורים" },
  { id: 17, message: "תראה לי מה יש בספורט", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - ספורט" },
  { id: 18, message: "יש תחפושות?", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריה - תחפושות" },

  // הזמנות
  { id: 19, message: "תכין לי 20 אקדחי מים", expectedIntent: "order", shouldEscalate: true, description: "הזמנה - אקדחי מים" },
  { id: 20, message: "תוסיף לי 50 בלונים", expectedIntent: "order", shouldEscalate: true, description: "הזמנה - בלונים" },
  { id: 21, message: "אני צריך 10 רובוטים לגו", expectedIntent: "order", shouldEscalate: true, description: "הזמנה - רובוטים" },
  { id: 22, message: "תכין קרטון גלואו סטיק", expectedIntent: "order", shouldEscalate: true, description: "הזמנה - גלואו סטיק" },
  { id: 23, message: "שולח הזמנה: 30 מזרוני ים", expectedIntent: "order", shouldEscalate: true, description: "הזמנה מפורטת" },

  // תמונות
  { id: 24, message: "תשלח לי תמונה של אקדח מים", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה - אקדח מים" },
  { id: 25, message: "שלח תמונות של הזוהרים", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונות - זוהרים" },
  { id: 26, message: "יש תמונה של הרובוט?", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה - רובוט" },
  { id: 27, message: "שלח תמונה של מזרון ים", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה - מזרון" },

  // ברכות/זהות
  { id: 28, message: "היי", expectedIntent: "greeting", shouldEscalate: false, description: "ברכה" },
  { id: 29, message: "מי אתה?", expectedIntent: "identity", shouldEscalate: false, description: "זהות חבצול" },
  { id: 30, message: "את בוט?", expectedIntent: "identity", shouldEscalate: false, description: "זהות - בוט?" },

  // חוב - חייב escalation
  { id: 31, message: "כמה אני חייב?", expectedIntent: "debt", shouldEscalate: true, description: "חוב" },
  { id: 32, message: "תעשה לי חשבון", expectedIntent: "debt", shouldEscalate: true, description: "חשבון" },
  { id: 33, message: "נשאר פתוח 500 שקל?", expectedIntent: "debt", shouldEscalate: true, description: "יתרה" },

  // escalation תקין
  { id: 34, message: "מה קורה אחי?", expectedIntent: "escalate_other", shouldEscalate: true, description: "שיחה חברתית" },
  { id: 35, message: "אתה בחנות?", expectedIntent: "delivery", shouldEscalate: true, description: "זמינות" },
  { id: 36, message: "מוכן לי?", expectedIntent: "delivery", shouldEscalate: true, description: "מוכנות הזמנה" },
]

async function runScenario(scenario: Scenario): Promise<{
  pass: boolean
  intentMatch: boolean
  escalateMatch: boolean
  actualIntent: string
  actualEscalate: boolean
  response: string
  hasImage: boolean
}> {
  try {
    const res = await fetch(`${BASE_URL}/api/railed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, message: scenario.message }),
    })
    const data = await res.json()

    const intentMatch = data.intent === scenario.expectedIntent
    const escalateMatch = data.escalate === scenario.shouldEscalate
    const pass = intentMatch && escalateMatch

    return {
      pass,
      intentMatch,
      escalateMatch,
      actualIntent: data.intent,
      actualEscalate: data.escalate,
      response: (data.response ?? "").slice(0, 80),
      hasImage: !!(data.images?.length > 0 || data.imageUrl),
    }
  } catch (e) {
    return { pass: false, intentMatch: false, escalateMatch: false, actualIntent: "ERROR", actualEscalate: false, response: String(e), hasImage: false }
  }
}

async function main() {
  console.log(`\n🧪 מריץ ${SCENARIOS.length} תרחישי בדיקה על ${BASE_URL}\n`)
  console.log("─".repeat(90))

  let passed = 0
  let failed = 0
  const failures: any[] = []

  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario)

    const icon = result.pass ? "✅" : "❌"
    const intentIcon = result.intentMatch ? "🎯" : "⚠️"
    const escIcon = result.escalateMatch ? "" : "🚨"

    console.log(`${icon} [${scenario.id}] ${scenario.description}`)
    if (!result.pass) {
      console.log(`   הודעה: "${scenario.message}"`)
      console.log(`   ${intentIcon} intent: ${result.actualIntent} (צפוי: ${scenario.expectedIntent}) ${escIcon} escalate: ${result.actualEscalate} (צפוי: ${scenario.shouldEscalate})`)
      console.log(`   תשובה: "${result.response}"`)
      failures.push({ scenario, result })
    } else {
      console.log(`   "${result.response.slice(0, 60)}"${result.hasImage ? " 🖼️" : ""}`)
    }

    if (result.pass) passed++
    else failed++

    // המתן קצת בין בקשות
    await new Promise(r => setTimeout(r, 300))
  }

  console.log("\n" + "─".repeat(90))
  console.log(`\n📊 תוצאות: ${passed}/${SCENARIOS.length} עברו (${Math.round(passed/SCENARIOS.length*100)}%)`)
  console.log(`✅ הצלחות: ${passed}`)
  console.log(`❌ כישלונות: ${failed}`)

  if (failures.length > 0) {
    console.log(`\n🔧 דורשים תיקון (${failures.length}):`)
    failures.forEach(({ scenario, result }) => {
      console.log(`   [${scenario.id}] "${scenario.message}" → ${result.actualIntent} במקום ${scenario.expectedIntent}`)
    })
  }

  const score = Math.round(passed / SCENARIOS.length * 100)
  console.log(`\n${score >= 80 ? "🟢" : score >= 60 ? "🟡" : "🔴"} ציון: ${score}% ${score >= 80 ? "- מוכן לבדיקות!" : score >= 60 ? "- עוד קצת" : "- דורש שיפור"}`)
}

main().catch(console.error)
