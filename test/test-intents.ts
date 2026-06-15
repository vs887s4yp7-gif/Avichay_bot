// ================================================================
// src/lib/test-intents.ts
// ================================================================
// 🧪 סקריפט בדיקה עצמאי - בודק זיהוי Intent + Template, בלי Next.js
// כלל ולא endpoint!
//
// הרצה:
//   npx tsx src/lib/test-intents.ts
//   (או: npm install -D tsx   אם עדיין לא מותקן)
//
// מה הוא עושה:
// 1. לוקח רשימת הודעות-דוגמה (מהשיחות האמיתיות)
// 2. עבור כל הודעה - מזהה Intent (לפי INTENT_RULES + priority)
// 3. בונה context מינימלי (מוצר מדומה / ללא מוצר)
// 4. מריץ את ה-template ומדפיס את התשובה + escalation
//
// 💡 זו לא הלוגיקה הסופית (recognize.ts/searchCatalog יבואו בהמשך) -
// זה כלי לבדוק שה-keywords/templates/priority ב-intents.ts
// "מתנהגים" כמו שאתה מצפה, לפני שמחברים את כל המכונה.
// ================================================================

import { INTENT_RULES, INTENT_PRIORITY_ORDER, CATEGORY_RULES, type Intent, type IntentContext, type CategoryKey } from "./intents"
import type { Product } from "./types"

// ----------------------------------------------------------------
// "מוצרים מדומים" - כדי לבדוק templates עם/בלי מוצר, עם/בלי מחיר
// ----------------------------------------------------------------
const MOCK_PRODUCTS: Record<string, Product> = {
  water_gun: {
    id: "P0034",
    name: "אקדח מים כריש/דולפין 35 ס\"מ",
    description: null,
    category: "קיץ ובריכה",
    subcategory: "צעצועי מים ובריכה",
    tags: ["אקדח", "אקדח מים"],
    price: 15,
    cartonQty: 24,
    stock: null,
    image: "/catalog-images/P0034.jpg",
  },
  no_price_product: {
    id: "P0169",
    name: "נרות עוגה ארוכים צבעוניים - סט",
    description: null,
    category: "מסיבות ואירועים",
    subcategory: "בלונים וקישוטי מסיבה",
    tags: ["נרות"],
    price: null, // 🚨 מוצר בלי מחיר - אמור לגרום ל-escalation
    cartonQty: null,
    stock: null,
    image: null,
  },
}

// 🆕 מוצרים מדומים לקטגוריית "תחפושות ופורים" - ל-category_browse
const MOCK_COSTUMES: Product[] = [
  { id: "P0070", name: "כובע קאובוי שחור", description: null, category: "תחפושות ופורים", subcategory: "אביזרי תחפושת ונשק צעצוע", tags: [], price: 8, cartonQty: 48, stock: null, image: null },
  { id: "P0114", name: "סט חרבות סמוראי שחורות - 3 יח'", description: null, category: "תחפושות ופורים", subcategory: "אביזרי תחפושת ונשק צעצוע", tags: [], price: 12, cartonQty: 24, stock: null, image: null },
  { id: "P0023", name: "סט חרבות אור (לייטסייבר) - 3 צבעים", description: null, category: "תחפושות ופורים", subcategory: "אביזרי תחפושת ונשק צעצוע", tags: [], price: 14, cartonQty: 24, stock: null, image: null },
]

// ----------------------------------------------------------------
// Tokenizer בסיסי (פשוט יותר מ-route.ts - לצורך הבדיקה הזו)
// ----------------------------------------------------------------
function normalize(text: string): string {
  return text.toLowerCase().trim()
}

// ----------------------------------------------------------------
// זיהוי קטגוריה - בודק את CATEGORY_RULES
// 🆕 אם מתאימות כמה קטגוריות -> בחר את זו עם priority הגבוה ביותר
// ----------------------------------------------------------------
function recognizeCategory(message: string): CategoryKey | null {
  const normalized = normalize(message)
  
  // אסוף את כל הקטגוריות המתאימות + priority שלהן
  const matches: Array<{ key: CategoryKey; priority: number }> = []
  
  for (const [key, rule] of Object.entries(CATEGORY_RULES)) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        matches.push({ key: key as CategoryKey, priority: rule.priority ?? 0 })
        break // כל קטגוריה מופיעה פעם אחת בלבד
      }
    }
  }
  
  if (matches.length === 0) return null
  
  // בחר את הקטגוריה עם priority הגבוה ביותר
  return matches.sort((a, b) => b.priority - a.priority)[0].key
}

// ----------------------------------------------------------------
// Intent Recognition - keyword substring + priority
// סדר: 1) intents פונקציונליים (debt/price/stock/...)
//      2) אם אין match -> category_browse (לפי CATEGORY_RULES)
//      3) אם גם זה לא -> escalate_other
// (גרסת "טעימה" - recognize.ts המלא יבוא בהמשך)
// ----------------------------------------------------------------
function recognizeIntent(message: string): { intent: Intent; category: CategoryKey | null } {
  const normalized = normalize(message)

  // שלב 1: intents פונקציונליים (לפי סדר עדיפויות, ללא category_browse/escalate_other)
  for (const intent of INTENT_PRIORITY_ORDER) {
    const rule = INTENT_RULES[intent]
    if (rule.keywords.length === 0) continue // category_browse + escalate_other - לא בשלב זה

    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return { intent, category: null }
      }
    }
  }

  // שלב 2: קטגוריה?
  const category = recognizeCategory(message)
  if (category) {
    return { intent: "category_browse", category }
  }

  // שלב 3: catch-all
  return { intent: "escalate_other", category: null }
}

// ----------------------------------------------------------------
// 🆕 Fallback Chain - "אם לא מצא מוצר ספציפי -> עבור לקטגוריות"
// ----------------------------------------------------------------
// אינטנטים "תלויי-מוצר" - אם ה-product search נכשל (ctx.product=null),
// במקום ליפול ישר ל-escalation, ננסה לזהות קטגוריה ולהציע רשימה.
// רק אם גם זה נכשל - escalation (כרגיל, ע"י template של category_browse
// כש-categoryProducts ריק).
// 🔧 תיקון מבדיקת 97 המקרים האמיתיים: "order" הוסר!
// הזמנה ("תכין לי 12 תנין... 1 מאוורר...") חייבת להישאר order גם אם
// מוזכרת בה מילת קטגוריה - אחרת ההזמנה "נבלעת" ב-category_browse.
const PRODUCT_DEPENDENT_INTENTS: Intent[] = ["price", "stock"]

function applyFallbackChain(
  message: string,
  initial: { intent: Intent; category: CategoryKey | null },
  hasProduct: boolean
): { intent: Intent; category: CategoryKey | null } {
  // send_photo מיוחד: שומר על ה-intent שלו ("רוצה תמונה של אחד מהם?")
  // אבל מקבל את הקטגוריה כ-context אם אין מוצר ספציפי
  if (initial.intent === "send_photo" && !hasProduct) {
    return { intent: "send_photo", category: recognizeCategory(message) }
  }
  if (!PRODUCT_DEPENDENT_INTENTS.includes(initial.intent)) return initial
  if (hasProduct) return initial // יש מוצר ספציפי - אין צורך בfallback

  const category = recognizeCategory(message)
  if (category) {
    return { intent: "category_browse", category }
  }

  return initial // אין גם קטגוריה - יישאר כ-price/stock, ה-template שלהם יעשה escalate
}

// ================================================================
// תרחישי בדיקה - מבוססים על השיחות האמיתיות שניתחנו
// ================================================================
type TestCase = {
  message: string
  mockProduct?: Product | null // undefined = לא רלוונטי, null = "לא נמצא מוצר"
  mockCategoryProducts?: Product[] // 🆕 ל-category_browse
  quantity?: number | null
  expectedIntent?: Intent // אופציונלי - לבדיקה אוטומטית
  expectedCategory?: CategoryKey | null // 🆕
}

const TEST_CASES: TestCase[] = [
  // ברכות
  { message: "היי", mockProduct: null, expectedIntent: "greeting" },
  { message: "בוקר טוב, מה המצב", mockProduct: null, expectedIntent: "greeting" },

  // 🆕 זהות - חבצול
  { message: "מי אתה?", mockProduct: null, expectedIntent: "identity" },
  { message: "את בוט?", mockProduct: null, expectedIntent: "identity" },
  { message: "איך קוראים לך", mockProduct: null, expectedIntent: "identity" },

  // מחיר - עם מוצר תקף
  {
    message: "כמה עולה אקדח מים?",
    mockProduct: MOCK_PRODUCTS.water_gun,
    expectedIntent: "price",
  },
  // מחיר - מוצר לא נמצא, אבל "קוסטיום" מזוהה כקטגוריה -> fallback ל-category_browse
  {
    message: "כמה עולה קוסטיום ספיידרמן?",
    mockProduct: null,
    mockCategoryProducts: MOCK_COSTUMES,
    expectedIntent: "category_browse",
    expectedCategory: "costumes_purim",
  },
  // מחיר - מוצר נמצא אבל אין לו מחיר (12 ה"חורים" בקטלוג)
  {
    message: "כמה עולים הנרות לעוגה?",
    mockProduct: MOCK_PRODUCTS.no_price_product,
    expectedIntent: "price",
  },

  // מלאי
  {
    message: "יש לכם אקדח מים?",
    mockProduct: MOCK_PRODUCTS.water_gun,
    expectedIntent: "stock",
  },
  {
    // "סלים" מזוהה גם כ-keyword קטגוריה (sensory) -> fallback ל-category_browse
    message: "יש סלים?",
    mockProduct: null,
    mockCategoryProducts: [
      { id: "P0156", name: "בוץ קסם - סליים", description: null, category: "צעצועי חישה (Sensory)", subcategory: "סלים ובוצי קסם", tags: ["סלים", "סליים"], price: 6, cartonQty: 48, stock: null, image: null },
    ],
    expectedIntent: "category_browse",
    expectedCategory: "sensory",
  },

  // הזמנה
  {
    message: "תכין לי 20 אקדחי מים",
    mockProduct: MOCK_PRODUCTS.water_gun,
    quantity: 20,
    expectedIntent: "order",
  },
  {
    message: "אני רוצה להזמין 50 קוסטיומי כלב גדל 6-8 שנים",
    mockProduct: null,
    quantity: 50,
    expectedIntent: "order",
  },

  // חוב - חייב escalation תמיד, גם אם יש "מספרים"
  { message: "כמה אני חייב?", mockProduct: null, expectedIntent: "debt" },
  { message: "סה\"כ נשאר פתוח 17925?", mockProduct: null, expectedIntent: "debt" },
  { message: "סגור אחי, אין חוב", mockProduct: null, expectedIntent: "debt" },

  // הנחות
  { message: "כמה עם הנחה ל-200 קוסטיומים מעורבים?", mockProduct: null, expectedIntent: "discount" },

  // משלוח
  { message: "כמה זמן לוקח דליברי?", mockProduct: null, expectedIntent: "delivery" },

  // תודה
  { message: "תודה רבה, פרנסה בשפע", mockProduct: null, expectedIntent: "thanks_closing" },

  // קאטצ'-ALL - שאלה לא מוכרת
  { message: "אתה יכול לעשות לי קפה?", mockProduct: null, expectedIntent: "escalate_other" },

  // ──────────────────────────────────────────────────────────
  // 🆕 category_browse - לקוח שואל על תחום שלם, לא מוצר ספציפי
  // ──────────────────────────────────────────────────────────
  {
    message: "תראה לי אפשרויות לתחפושות לפורים",
    mockProduct: null,
    mockCategoryProducts: MOCK_COSTUMES,
    expectedIntent: "category_browse",
    expectedCategory: "costumes_purim",
  },
  {
    message: "מה האפשרויות שיש לכם לבריכה?",
    // 🆕 "יש לכם" -> stock, אבל אין מוצר ספציפי -> fallback ל-category_browse
    mockProduct: null,
    mockCategoryProducts: [
      { id: "P0034", name: "אקדח מים כריש/דולפין 35 ס\"מ", description: null, category: "קיץ ובריכה", subcategory: "צעצועי מים ובריכה", tags: [], price: 15, cartonQty: 24, stock: null, image: null },
      { id: "P0086", name: "אקדח מים בעיצוב חלל", description: null, category: "קיץ ובריכה", subcategory: "צעצועי מים ובריכה", tags: [], price: 16, cartonQty: 24, stock: null, image: null },
    ],
    expectedIntent: "category_browse",
    expectedCategory: "summer_pool",
  },
  {
    message: "מתאים למסיבת יום הולדת?",
    mockProduct: null,
    mockCategoryProducts: [],
    expectedIntent: "category_browse",
    expectedCategory: "party_events",
  },
  {
    message: "אהלן, יש לכם משהו לחישה / פידג'ט?",
    // 🆕 גם כאן: "יש לכם" -> stock, אין מוצר -> fallback ל-category_browse (sensory)
    mockProduct: null,
    mockCategoryProducts: [
      { id: "P0156", name: "בוץ קסם - סליים", description: null, category: "צעצועי חישה (Sensory)", subcategory: "סלים ובוצי קסם", tags: ["סלים", "סליים"], price: 6, cartonQty: 48, stock: null, image: null },
    ],
    expectedIntent: "category_browse",
    expectedCategory: "sensory",
  },
  {
    // 🆕 בדיקת priority - "מתנפח" יכול להיות summer_pool או sensory
    // priority של sensory (100) > summer_pool (50) -> sensory מנצח
    message: "איזה מתנפחים יש לכם?",
    mockProduct: null,
    mockCategoryProducts: [
      { id: "P0156", name: "בוץ קסם - סליים", description: null, category: "צעצועי חישה (Sensory)", subcategory: "סלים ובוצי קסם", tags: ["סלים", "מתנפח"], price: 6, cartonQty: 48, stock: null, image: null },
    ],
    expectedIntent: "category_browse",
    expectedCategory: "sensory",
  },
  {
    message: "מחפש מתנות קטנות וזולות",
    mockProduct: null,
    mockCategoryProducts: [],
    expectedIntent: "category_browse",
    expectedCategory: "small_gifts",
  },
  {
    // "מה יש לכם למסיבות?" - "יש לכם" -> stock, אין מוצר ספציפי ("מסיבות" אינו
    // מוצר), "מסיבות" מזוהה כקטגוריה -> fallback ל-category_browse.
    //
    // ⚠️ חשוב ל-recognize.ts האמיתי: hasProduct לא יכול להיות
    // "סתם לא-null" - חייב לבדוק MIN_SCORE_THRESHOLD (כמו ב-v3 route.ts,
    // ערך=10). אחרת searchCatalog עלול להחזיר התאמה חלשה/לא-רלוונטית
    // (למשל "אקדח מים" עם score נמוך) ולחסום את ה-fallback לקטגוריה.
    message: "מה יש לכם למסיבות?",
    mockProduct: null,
    mockCategoryProducts: [
      { id: "P0166", name: "שרשרת אורות LED קישוטי מטבעות זהב", description: null, category: "מסיבות ואירועים", subcategory: "בלונים וקישוטי מסיבה", tags: [], price: 9, cartonQty: 36, stock: null, image: null },
      { id: "P0056", name: "סט בלוני מים על מקלות (Magic Balloons)", description: null, category: "מסיבות ואירועים", subcategory: "בלונים וקישוטי מסיבה", tags: [], price: 11, cartonQty: 24, stock: null, image: null },
    ],
    expectedIntent: "category_browse",
    expectedCategory: "party_events",
  },
  {
    // רשת הביטחון האחרונה: stock + אין מוצר + אין קטגוריה -> escalate כרגיל
    message: "יש לכם פיל כחול מדבר?",
    mockProduct: null,
    expectedIntent: "stock",
  },

  // ──────────────────────────────────────────────────────────
  // 🆕 send_photo - בקשות תמונה (מבוסס על [25],[26],[22] מהשיחות)
  // ──────────────────────────────────────────────────────────
  {
    // מוצר נמצא + יש תמונה -> שולח מיד! (היתרון של הבוט על אביחי)
    message: "תשלח לי תמונה של אקדח המים",
    mockProduct: MOCK_PRODUCTS.water_gun,
    expectedIntent: "send_photo",
  },
  {
    // מוצר נמצא אבל בלי תמונה אמיתית (39 ה-SKUs מהאאודיט) -> escalation מנומק
    message: "שלח תמונה של הנרות לעוגה",
    mockProduct: MOCK_PRODUCTS.no_price_product, // image: null
    expectedIntent: "send_photo",
  },
  {
    // אין מוצר ספציפי אבל יש קטגוריה -> מציג רשימה ושואל איזה לצלם
    message: "תשלח לי תמונות של התחפושות שיש לך",
    mockProduct: null,
    mockCategoryProducts: MOCK_COSTUMES,
    expectedIntent: "send_photo",
    expectedCategory: "costumes_purim",
  },
  {
    // אין מוצר ואין קטגוריה -> escalation
    message: "שלח לי תמונות של הנידו שיש לך",
    mockProduct: null,
    expectedIntent: "send_photo",
  },
]

// ================================================================
// הרצה
// ================================================================
function run() {
  let pass = 0
  let fail = 0

  for (const tc of TEST_CASES) {
    const initial = recognizeIntent(tc.message)
    const hasProduct = !!tc.mockProduct
    const { intent, category } = applyFallbackChain(tc.message, initial, hasProduct)
    const rule = INTENT_RULES[intent]

    const ctx: IntentContext = {
      userMessage: tc.message,
      product: tc.mockProduct ?? null,
      quantity: tc.quantity ?? null,
      category,
      categoryProducts: tc.mockCategoryProducts ?? [],
    }

    const response = rule.template(ctx)
    const escalate = rule.requiresEscalation(ctx)

    const intentOk = !tc.expectedIntent || tc.expectedIntent === intent
    const categoryOk = tc.expectedCategory === undefined || tc.expectedCategory === category
    const ok = intentOk && categoryOk
    if (ok) pass++
    else fail++

    console.log(`\n💬 "${tc.message}"`)
    console.log(`   Intent: ${intent}${tc.expectedIntent ? (intentOk ? " ✅" : ` ❌ (expected: ${tc.expectedIntent})`) : ""}`)
    if (intent === "category_browse" || tc.expectedCategory !== undefined) {
      console.log(`   Category: ${category}${tc.expectedCategory !== undefined ? (categoryOk ? " ✅" : ` ❌ (expected: ${tc.expectedCategory})`) : ""}`)
    }
    console.log(`   Escalation: ${escalate ? "YES 🙏" : "no"}`)
    console.log(`   Response: "${response}"`)
  }

  console.log(`\n\n=== סיכום: ${pass} עברו, ${fail} נכשלו (מתוך ${TEST_CASES.length}) ===`)
}

run()
