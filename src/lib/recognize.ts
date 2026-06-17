// ================================================================
// src/lib/recognize.ts
// ================================================================
// 🧠 מנוע הזיהוי המלא של ה-Railed Bot:
//   1. tokenize - נרמול עברית (stopwords + קידומות ה/ב/ל/מ/ו/כ/ש)
//   2. searchCatalog - חיפוש משוקלל ב-366 מוצרים (כמו v3 route.ts)
//   3. extractQuantity - חילוץ כמות מההודעה
//   4. recognize - הניתוב הסופי: intent + context + template + escalation
//
// אפס קריאות API. דטרמיניסטי לחלוטין. <30ms.
// ================================================================

import {
  INTENT_RULES,
  INTENT_PRIORITY_ORDER,
  CATEGORY_RULES,
  formatOptions,
  type Intent,
  type IntentContext,
  type CategoryKey,
} from "./intents"
import type { Product } from "./types"

// ================================================================
// קבועים - מסונכרנים עם v3 route.ts
// ================================================================
export const MIN_SCORE_THRESHOLD = 10
// מעל MIN אבל מתחת ל-CONFIDENT: הבוט שואל "התכוונת ל...?" במקום לקבוע.
// ראיה אחת + score בינוני = ניחוש סביר, לא ודאות.
export const CONFIDENT_SCORE_THRESHOLD = 30
// ראיות חזקות מרובות (2+) = ביטחון גם בscore בינוני
export const CONFIDENT_EVIDENCE_COUNT = 2

const STOPWORDS = new Set([
  "של", "את", "אם", "או", "גם", "כן", "לא", "יש", "אין", "זה", "זו",
  "על", "עם", "כל", "מה", "מי", "איך", "כמה", "האם", "אני", "אתה",
  "לי", "לך", "לנו", "לכם", "הוא", "היא", "הם", "אבל", "רק", "עוד",
  "כבר", "פה", "שם", "טוב", "בסדר", "אז", "וגם", "בבקשה", "תודה",
  "אחי", "אח", "שלי", "שלך", "סבבה",
])

const HEBREW_PREFIXES = ["ה", "ב", "ל", "מ", "ו", "כ", "ש"]

// מילים שמופיעות במאות מוצרים - התאמה עליהן היא לא ראיה לזיהוי מוצר.
// (צבעים, גדלים, אריזות, יחידות)
const GENERIC_TOKENS = new Set([
  "כחול", "אדום", "ירוק", "צהוב", "כתום", "ורוד", "שחור", "לבן", "סגול", "זהב", "כסף",
  "צבעוני", "צבעים", "צבע", "גדול", "גדולה", "גדולים", "קטן", "קטנה", "קטנים", "ענק",
  "סט", "חבילה", "חבילות", "יח", "יחידות", "קרטון", "זוג", "שקית", "קופסה", "מארז",
  "דגם", "חדש", "איכותי", "מעורב", "סמ", "מטר", "גרם",
])

// ================================================================
// Tokenize - נרמול והכנת מילים לחיפוש
// ================================================================
export function tokenize(text: string): string[] {
  const raw = String(text ?? "")
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9\s"']/g, " ") // השאר עברית/אנגלית/מספרים
    .replace(/["']/g, "") // גרשיים (ס"מ -> סמ)
    .split(/\s+/)
    .filter((w) => w.length > 1)

  const tokens = new Set<string>()
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue
    tokens.add(word)
    // גרסה ללא קידומת: "הבלון" -> "בלון", "לתחפושת" -> "תחפושת"
    for (const prefix of HEBREW_PREFIXES) {
      if (word.startsWith(prefix) && word.length > 2) {
        const stripped = word.slice(1)
        if (!STOPWORDS.has(stripped)) tokens.add(stripped)
      }
    }
  }
  return [...tokens]
}

// ================================================================
// searchCatalog - חיפוש משוקלל (משקלים זהים ל-v3 route.ts)
// ================================================================
export type ScoredProduct = {
  product: Product
  score: number
  // 🆕 ראיות חזקות: טוקנים לא-גנריים (אורך>=3) שפגעו בשם או בכינוי.
  // בלעדיהן - ההתאמה היא "רעש" (צבעים/גדלים/מילים נפוצות).
  strongEvidence: string[]
}

const WEIGHT = {
  tag: 12,
  name: 10,
  subcategory: 5,
  category: 3,
  description: 1,
}

export function searchCatalog(message: string, products: Product[]): ScoredProduct[] {
  const tokens = tokenize(message)
  if (tokens.length === 0) return []

  const scored: ScoredProduct[] = []

  for (const product of products) {
    let score = 0
    const strongEvidence: string[] = []
    const nameLower = (product.name ?? "").toLowerCase()
    const descLower = (product.description ?? "").toLowerCase()
    const catLower = (product.category ?? "").toLowerCase()
    const subcatLower = (product.subcategory ?? "").toLowerCase()
    const tagsLower = (product.tags ?? []).map((t) => (t ?? "").toLowerCase())

    for (const token of tokens) {
      const tagHit = tagsLower.some((t) => t.includes(token) || token.includes(t))
      const nameHit = nameLower.includes(token)

      if (tagHit) score += WEIGHT.tag
      if (nameHit) score += WEIGHT.name
      if (subcatLower.includes(token)) score += WEIGHT.subcategory
      if (catLower.includes(token)) score += WEIGHT.category
      if (descLower.includes(token)) score += WEIGHT.description

      // ראיה חזקה: פגיעה בשם/כינוי עם טוקן משמעותי (לא צבע/גודל/אריזה).
      // נדרש שהטוקן יהיה מילה שלמה בשם/בכינוי (לא substring חלקי -
      // מונע "מעמ"⊂"מעמד") או substring ארוך (>=5).
      if ((tagHit || nameHit) && token.length >= 3 && !GENERIC_TOKENS.has(token)) {
        const nameWords = nameLower.split(/[\s\-/()]+/)
        const tagWords = tagsLower.flatMap((t) => t.split(/[\s\-/()]+/))
        const wholeWordHit = nameWords.includes(token) || tagWords.includes(token)
        if (wholeWordHit || token.length >= 5) {
          strongEvidence.push(token)
        }
      }
    }

    if (score > 0) {
      // דה-דופליקציה: "הבלון" ו"בלון" הן אותה ראיה (קידומת בלבד).
      // משאירים רק טוקנים שאינם מוכלים זה בזה.
      const deduped = strongEvidence
        .sort((a, b) => a.length - b.length)
        .filter((tok, i, arr) => !arr.slice(0, i).some((shorter) => tok.includes(shorter)))
      scored.push({ product, score, strongEvidence: deduped })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
}

// ================================================================
// extractQuantity - חילוץ כמות ("תכין לי 20 בלונים" -> 20)
// ================================================================
export function extractQuantity(message: string): number | null {
  // נמנעים ממספרים שנראים כמו תאריך
  const cleaned = message.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, " ")
  const matches = cleaned.match(/(?<![\d-])(\d{1,4})(?![\d-])/g)
  if (!matches) return null
  const n = parseInt(matches[0], 10)
  if (n >= 1 && n <= 9999) return n
  return null
}

// ================================================================
// recognizeCategory - זיהוי קטגוריה לפי CATEGORY_RULES
// ================================================================
export function recognizeCategory(message: string): CategoryKey | null {
  const normalized = String(message ?? "").toLowerCase()
  for (const [key, rule] of Object.entries(CATEGORY_RULES)) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return key as CategoryKey
      }
    }
  }
  return null
}

// ================================================================
// matchIntentByKeywords - שלב 1: keyword matching לפי priority
// ================================================================
// greeting/thanks הם intents "חלשים": תקפים רק אם ההודעה קצרה
// (שיחת נימוסין) או מתחילה במילת המפתח. אחרת "בוקר טוב" בתוך
// הזמנה ארוכה היה בולע את ההזמנה כולה.
const WEAK_INTENTS: Intent[] = ["greeting", "thanks_closing", "identity"]
const WEAK_INTENT_MAX_LENGTH = 35

// 🔧 2026-06-17: "יש X?" - הודעה קצרה שמתחילה ב"יש " = שאלת מלאי
const YEH_STOCK_PATTERN = /^יש\s+\S/

// קטגוריות/מוצרים שמילת "צעצועים"/"toys" כללית מתפרשת כשאלת מלאי כללית
const GENERAL_TOYS_PATTERN = /צעצועים|\btoys?\b|וטייגר|בריכ/i

// ביטויי ברכה אישית/חברתית שאמורים ללכת לאביחי, לא לבוט
const PERSONAL_GREETING_PHRASES = [
  "יום לא דברנו", "לא מצליח", "כאן שוב", "כמה יום", "לא מצליח להתחבר", "בעיה", "בעיות",
]

function matchIntentByKeywords(message: string): Intent | null {
  const normalized = message.toLowerCase().trim()

  // "יש X?" קצרה (עד 30 תווים) שמתחילה ב"יש":
  // אם זוהתה קטגוריה → category_browse (מציג אפשרויות, לא escalate, מאפשר בחירת מספר).
  // אחרת → stock.
  if (YEH_STOCK_PATTERN.test(normalized) && normalized.length <= 40) {
    return "stock"
  }

  for (const intent of INTENT_PRIORITY_ORDER) {
    const rule = INTENT_RULES[intent]
    if (rule.keywords.length === 0) continue
    for (const keyword of rule.keywords) {
      const kw = keyword.toLowerCase()
      if (!normalized.includes(kw)) continue
      if (WEAK_INTENTS.includes(intent)) {
        const isShort = normalized.length <= WEAK_INTENT_MAX_LENGTH
        const startsWith = normalized.startsWith(kw)
        if (!isShort && !startsWith) continue
      }
      // 🔧 greeting עם תוכן אישי → escalate_other במקום greeting
      if (intent === "greeting" && PERSONAL_GREETING_PHRASES.some(p => normalized.includes(p))) {
        return null // ייפול ל-escalate_other
      }
      return intent
    }
  }
  return null
}

// ================================================================
// dedupeByBaseName - מסיר כפילויות של אותו מוצר ("X" ו-"X (חזרה)")
// ================================================================
function dedupeScoredByBaseName(scored: ScoredProduct[]): ScoredProduct[] {
  const seen = new Set<string>()
  const out: ScoredProduct[] = []
  for (const m of scored) {
    const base = m.product.name.replace(/\s*\(חזרה ?\d*\)\s*/g, "").trim().toLowerCase()
    if (seen.has(base)) continue
    seen.add(base)
    out.push(m)
  }
  return out
}

// ================================================================
// 🆕 recognizeMore - "עוד" / "תן לי עוד" / "עוד אפשרויות" / "הבא" / "more"
// ================================================================
// מתאים רק כשההודעה היא "בעיקרה" בקשת-עוד, בלי תוכן משמעותי אחר
// (כדי שלא "תן לי עוד 20 בלונים" יתפרש כ"עוד אפשרויות").
const MORE_PATTERN = /^(תן לי |תראה לי |אפשר )?עוד( אפשרויות| אופציות| מהקטגוריה)?[!.?]*$|^(הבא|הבאים|more|next)[!.?]*$/i

export function recognizeMore(message: string): boolean {
  return MORE_PATTERN.test(message.trim().toLowerCase())
}

// ================================================================
// 🆕 recognizeSelection - "2" / "מספר 2" / "אפשרות 2" -> options[offset+1]
// ================================================================
// מתאים רק כש-pendingOptions קיים (השיחה הקודמת הציגה רשימה) וההודעה
// היא "בעיקרה" מספר - לא "תכין לי 2 בלונים" (יש עוד מילים משמעותיות).
// המספר מתייחס למספור המוצג ללקוח (offset+1..offset+5).
export function recognizeSelection(message: string, pendingOptions: Product[], offset = 0): Product | null {
  if (!pendingOptions || pendingOptions.length === 0) return null
  const cleaned = message.trim().toLowerCase()

  // 🔧 learning loop 2026-06-14: תופס גם "תביא לי מס׳ 4", "קח את ה-3",
  // "אני רוצה את מספר 2" - לא רק מספר נקי.
  // שני patterns: (א) מספר נקי אופציונלי עם prefix, (ב) משפט עם מספר בסוף
  const PURE = /^(?:מספר|אפשרות|את ה|ה)?\s*([0-9][0-9]?)\.?\s*$/
  const PHRASE = /(?:תביא לי|קח|אני רוצה|תן לי|תביא את|את ה|מס['׳]?\s*)(?:את\s+)?(?:מספר\s*)?([1-9][0-9]?)(?:\s|$|\.)/
  const SUFFIX = /(?:מספר|אפשרות)\s*([1-9][0-9]?)\s*$/

  const m = cleaned.match(PURE) ?? cleaned.match(PHRASE) ?? cleaned.match(SUFFIX)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (num < 1) return null
  const idx = num - 1
  const pageEnd = Math.min(offset + 5, pendingOptions.length)
  if (idx < 0 || idx >= pageEnd) return null
  return pendingOptions[idx]
}

// ================================================================
// recognize - הפונקציה הראשית: הודעה -> intent + context מלא
// ================================================================
const PRODUCT_DEPENDENT_INTENTS: Intent[] = ["price", "stock"]

export type RecognitionResult = {
  intent: Intent
  context: IntentContext
  response: string
  escalate: boolean
  debug: {
    topMatches: { id: string; name: string; score: number }[]
    hasStrongProduct: boolean
    category: CategoryKey | null
  }
}

export function recognize(
  message: string,
  catalog: Product[],
  pendingOptions: Product[] = [],
  pendingOffset = 0,
  hintProduct: Product | null = null
): RecognitionResult {
  message = String(message ?? "")
  catalog = Array.isArray(catalog) ? catalog : []
  pendingOptions = Array.isArray(pendingOptions) ? pendingOptions : []
  // -1. "עוד"? -> דף הבא מתוך אותו pool (pendingOptions), בלי לחשב מחדש
  if (pendingOptions.length > 0 && recognizeMore(message)) {
    let nextOffset = pendingOffset + 5
    if (nextOffset >= pendingOptions.length) nextOffset = 0
    {
      const context: IntentContext = {
        userMessage: message,
        product: null,
        matches: [],
        quantity: null,
        category: null,
        categoryProducts: [],
        needsConfirmation: false,
        options: pendingOptions,
        optionsOffset: nextOffset,
      }
      return {
        intent: "category_browse", // נדרש intent קיים כדי להריץ template; הטקסט עצמו גנרי
        context,
        response: formatOptions(pendingOptions, "עוד אפשרויות:", nextOffset),
        escalate: false,
        debug: { topMatches: [], hasStrongProduct: false, category: null },
      }
    }
  }

  // 0. בחירה ממוצרים שהוצעו בתור הקודם? ("2" -> options[offset+1])
  // אם כן - תשובה ישירה ובטוחה (אין צורך ב-isConfident, הלקוח בחר!)
  const selected = recognizeSelection(message, pendingOptions, pendingOffset)
  if (selected) {
    const context: IntentContext = {
      userMessage: message,
      product: selected,
      matches: [selected],
      quantity: extractQuantity(message),
      category: null,
      categoryProducts: [],
      needsConfirmation: false,
      options: [],
    }
    const rule = INTENT_RULES.stock
    return {
      intent: "stock",
      context,
      response: rule.template(context),
      escalate: false,
      debug: { topMatches: [{ id: selected.id, name: selected.name, score: 999 }], hasStrongProduct: true, category: null },
    }
  }

  // 1. חיפוש מוצר בקטלוג
  // התאמה "חזקה" = score מעל הסף וגם לפחות ראיה משמעותית אחת
  // (טוקן לא-גנרי שפגע בשם/כינוי). מונע false positives מהודעות
  // ארוכות שצוברות score ממילים נפוצות (צבעים, גדלים, "סט"...)
  const matches = searchCatalog(message, catalog)

  // 🔧 ראיות גוברות על score גולמי: מוצר עם ראיות חזקות ("קוביית פאזל"
  // שפגע בשם במדויק) עדיף על מוצר עם score גבוה יותר מרעש בלבד
  // (מילים גנריות/substring חלקי). לכן בוחרים את ההתאמה המובילה
  // מבין אלו שיש להן ראיות - לא את ה-score הגבוה בכל מחיר.
  const evidencedRaw = matches.filter((m) => m.strongEvidence.length >= 1)
  // דה-דופ לפני הכל: "X" ו-"X (חזרה)" הם אותו מוצר - לא מתחרים זה בזה
  const evidenced = dedupeScoredByBaseName(evidencedRaw)
  const top = evidenced[0] ?? matches[0]
  const hasStrongProduct =
    !!top && top.score >= MIN_SCORE_THRESHOLD && top.strongEvidence.length >= 1
  const product = hasStrongProduct ? top.product : (hintProduct ?? null)
  // תיקו בצמרת: 2+ מוצרים *שונים* עם ראיות באותו score = עמימות אמיתית
  // ("בלון" מתאים ל-3 מוצרי בלונים שונים) -> חובה לשאול
  //
  // 🔧 הרחבה: גם 2+ מוצרים *שונים* שכל אחד עומד בפני עצמו בסף-הביטחון
  // (למשל 46 ו-44) הם עמימות - "מתנפחים" מתאים לשני מזרוני-ים שונים,
  // ולא ידוע לאיזה מהם הלקוח התכוון. לא רק שוויון score מדויק.
  const confidentCandidates = evidenced.filter(
    (m) => m.score >= CONFIDENT_SCORE_THRESHOLD || m.strongEvidence.length >= CONFIDENT_EVIDENCE_COUNT
  )
  const hasTie =
    (evidenced.length >= 2 && evidenced[1].score === top?.score) ||
    confidentCandidates.length >= 2

  // ביטחון מלא: score גבוה או ראיות מרובות, ובלי תיקו. אחרת - לשאול, לא לקבוע.
  const isConfident =
    hasStrongProduct &&
    !hasTie &&
    (top.score >= CONFIDENT_SCORE_THRESHOLD ||
      top.strongEvidence.length >= CONFIDENT_EVIDENCE_COUNT)

  // 2. זיהוי intent ראשוני
  let intent = matchIntentByKeywords(message)
  // 🔧 confirmation קצר ("זה בסדר", "כן זה בסדר") אחרי הצעה = אישור, לא escalate
  const CONFIRM_PATTERN = /^(כן,?\s*)?זה בסדר[!.?]*$|^בסדר גמור[!.?]*$|^אוקיי?,?\s*זה בסדר[!.?]*$|^כן,?\s*זה בסדר[!.?]*$|^זה בסדר[!.?]*$/
  if (intent === null && CONFIRM_PATTERN.test(message.trim())) {
    intent = "confirmation"
  }
  // "בסדר, קרטון" / "בסדר, קרטון אחד" after an offer = order confirmation
  if (intent === null && /^בסדר,?\s*קרטון/.test(message.trim())) {
    intent = "order"
  }
  const intentWasKeywordMatched = intent !== null // האם intent זוהה דרך keyword מפורש
  let category: CategoryKey | null = null

  // היוריסטיקת רשימת הזמנה: 3+ מספרי כמות בהודעה = כמעט תמיד הזמנה
  const quantityCount = (message.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, " ").match(/(?<![\d-])\d{1,4}(?![\d-])/g) ?? []).length
  if (quantityCount >= 3 && intent !== "debt") {
    intent = "order"
  }

  // 🔧 2026-06-17: "בסדר, 5 קרטון" / "100 קרטון" - מספר + קרטון = הזמנה
  // (כמה קרטון? כבר מכוסה ב-price keywords ולא יגיע לכאן)
  if (intent === null && quantityCount >= 1 && /\d+\s*קרטון|קרטון\s*אחד/.test(message)) {
    intent = "order"
  }

  // 🔧 follow-up "ומה עם X" / "ומה יש לך בX" אחרי רשימה = stock (המשך שיחה).
  // אם אין pendingOptions ומדובר בקטגוריה -> category_browse.
  const DELIVERY_FOLLOWUP = /משלוח|משלח|דליברי|יגיע המשלוח|המשלוח הבא|מתי יגיע|מתי מגיע|ומה עם משלוח|מתי יגיע המשלוח הבא/
  const BROWSE_PATTERN = /^ו?מה יש (לך |לכם )?[לב]/
  if (DELIVERY_FOLLOWUP.test(message)) {
    // נשאיר ל-keyword matching של delivery לטפל; לא נחטוף לקטגוריה
    intent = "delivery"
  } else if (BROWSE_PATTERN.test(message.trim())) {
    const browseCategory = recognizeCategory(message)
    if (browseCategory) {
      // "מה יש לך לX" / "ומה יש לך בX" = browse the category (show options, no escalate)
      intent = "category_browse"
      category = browseCategory
    }
  }
  // follow-up like "וכחול?" / "ומה עם סלים?" after a stock list -> stock
  if (intent === null && pendingOptions.length > 0) {
    const followCat = recognizeCategory(message)
    if (followCat) {
      intent = "stock"
      category = followCat
    }
  }
  // 🔧 follow-up phrases after a list: "אוקיי, מה יש?", "מה יש?", "עוד" → stock
  if (intent === null && pendingOptions.length > 0) {
    const m = message.trim().toLowerCase()
    if (/^(אוקיי?,?\s*)?מה יש[?!.]*$|^נו[?!.]*$|^טוב,?\s*מה יש[?!.]*$/.test(m)) {
      const context: IntentContext = {
        userMessage: message,
        product: null,
        matches: [],
        quantity: null,
        category: null,
        categoryProducts: [],
        needsConfirmation: false,
        options: pendingOptions,
        optionsOffset: pendingOffset,
      }
      return {
        intent: "stock",
        context,
        response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset),
        escalate: false,
        debug: { topMatches: [], hasStrongProduct: false, category: null },
      }
    }
  }
  // 🔧 bare/loose number after a list that recognizeSelection missed (offset/format) → still treat as selection
  // moved earlier-style: handle even if a quantity heuristic set intent, when message is JUST a number
  if (pendingOptions.length > 0) {
    const bareEarly = message.trim().match(/^([1-9][0-9]?)[.!?]*$/)
    if (bareEarly) {
      const nE = parseInt(bareEarly[1], 10)
      const idxE = nE - 1
      if (idxE >= 0 && idxE < pendingOptions.length) {
        const selE = pendingOptions[idxE]
        const ctxE: IntentContext = {
          userMessage: message,
          product: selE,
          matches: [selE],
          quantity: null,
          category: null,
          categoryProducts: [],
          needsConfirmation: false,
          options: [],
        }
        return {
          intent: "stock",
          context: ctxE,
          response: INTENT_RULES.stock.template(ctxE),
          escalate: false,
          debug: { topMatches: [{ id: selE.id, name: selE.name, score: 999 }], hasStrongProduct: true, category: null },
        }
      }
    }
  }
  if (intent === null && pendingOptions.length > 0) {
    const bare = message.trim().match(/^([1-9][0-9]?)[.!?]*$/)
    if (bare) {
      const n = parseInt(bare[1], 10)
      const idx = n - 1
      if (idx >= 0 && idx < pendingOptions.length) {
        const sel = pendingOptions[idx]
        const ctxN: IntentContext = {
          userMessage: message,
          product: sel,
          matches: [sel],
          quantity: null,
          category: null,
          categoryProducts: [],
          needsConfirmation: false,
          options: [],
        }
        return {
          intent: "stock",
          context: ctxN,
          response: INTENT_RULES.stock.template(ctxN),
          escalate: false,
          debug: { topMatches: [{ id: sel.id, name: sel.name, score: 999 }], hasStrongProduct: true, category: null },
        }
      }
    }
  }
  // follow-up referencing a numbered option from prior list ("ומה עם 5?", "מס 2 מעניין")
  if (intent === null && pendingOptions.length > 0) {
    const numSel = recognizeSelection(message, pendingOptions, pendingOffset)
    if (numSel) {
      const ctx2: IntentContext = {
        userMessage: message,
        product: numSel,
        matches: [numSel],
        quantity: extractQuantity(message),
        category: null,
        categoryProducts: [],
        needsConfirmation: false,
        options: [],
      }
      const r2 = INTENT_RULES.stock
      return {
        intent: "stock",
        context: ctx2,
        response: r2.template(ctx2),
        escalate: false,
        debug: { topMatches: [{ id: numSel.id, name: numSel.name, score: 999 }], hasStrongProduct: true, category: null },
      }
    }
  }

  if (intent === null) {
    const implicitProductInquiry =
      hasStrongProduct && top.strongEvidence.length >= 2
    if (implicitProductInquiry) {
      intent = "stock"
    } else {
      category = recognizeCategory(message)
      if (category) {
        intent = "category_browse"
      } else if (GENERAL_TOYS_PATTERN.test(message)) {
        intent = "category_browse"
        category = "games_puzzles"
      } else {
        intent = "escalate_other"
      }
    }
  } else if (intent === "send_photo" && !hasStrongProduct) {
    category = recognizeCategory(message)
  } else if (intent === "stock" && !hasStrongProduct && !category) {
    // 🔧 stock query (יש X?) with no product: try category, else keep stock w/ category fallback
    const stockCat = recognizeCategory(message)
    if (stockCat) {
      category = stockCat
    } else if (GENERAL_TOYS_PATTERN.test(message)) {
      // "יש לך צעצועים חדשים?" / "יש וטייגר?" - general toy inquiry: answer as category browse w/ samples, do not escalate
      category = "games_puzzles"
    }
  } else if (PRODUCT_DEPENDENT_INTENTS.includes(intent) && !hasStrongProduct) {
    // 🔧 stock without a strong product but with a recognized category:
    // keep intent=stock and load category products so the bot answers
    // without escalating (tests expect stock + escalate=false).
    const stockCategory = category ?? recognizeCategory(message)
    if (stockCategory) category = stockCategory
  }

  // 3. מוצרי קטגוריה (אם זוהתה)
  let categoryProducts: Product[] = []
  if (category) {
    const catName = CATEGORY_RULES[category].catalogCategory
    categoryProducts = catalog.filter((p) => p.category === catName).slice(0, 15)
  }

  // 4. בניית context + הרצת template
  // ל-category_browse/send_photo: ctx.options = categoryProducts (כך
  // ש"עוד"/בחירה-במספר יעבדו על אותו pool דרך אותו מסלול קוד).
  // אחרת (price/stock): ctx.options = מועמדים עם ראיות (בלי "(חזרה)").
  const optionsPool =
    intent === "category_browse" || intent === "send_photo"
      ? categoryProducts
      : (intent === "stock" && !product && categoryProducts.length > 0)
        ? categoryProducts
        : evidenced.map((m) => m.product).slice(0, 10)

  const context: IntentContext = {
    userMessage: message,
    product,
    matches: matches.slice(0, 5).map((m) => m.product),
    quantity: extractQuantity(message),
    category,
    categoryProducts,
    needsConfirmation: hasStrongProduct && !isConfident,
    options: optionsPool,
    optionsOffset: 0,
  }

  const rule = INTENT_RULES[intent]
  const response = rule.template(context)
  const escalate = rule.requiresEscalation(context)

  return {
    intent,
    context,
    response,
    escalate,
    debug: {
      topMatches: matches.slice(0, 3).map((m) => ({ id: m.product.id, name: m.product.name, score: m.score })),
      hasStrongProduct,
      category,
    },
  }
}
