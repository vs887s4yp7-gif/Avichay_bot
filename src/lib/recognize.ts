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

export const MIN_SCORE_THRESHOLD = 10
export const CONFIDENT_SCORE_THRESHOLD = 30
export const CONFIDENT_EVIDENCE_COUNT = 2

const STOPWORDS = new Set([
  "של", "את", "אם", "או", "גם", "כן", "לא", "יש", "אין", "זה", "זו",
  "על", "עם", "כל", "מה", "מי", "איך", "כמה", "האם", "אני", "אתה",
  "לי", "לך", "לנו", "לכם", "הוא", "היא", "הם", "אבל", "רק", "עוד",
  "כבר", "פה", "שם", "טוב", "בסדר", "אז", "וגם", "בבקשה", "תודה",
  "אחי", "אח", "שלי", "שלך", "סבבה",
])

const HEBREW_PREFIXES = ["ה", "ב", "ל", "מ", "ו", "כ", "ש"]

const GENERIC_TOKENS = new Set([
  "כחול", "אדום", "ירוק", "צהוב", "כתום", "ורוד", "שחור", "לבן", "סגול", "זהב", "כסף",
  "צבעוני", "צבעים", "צבע", "גדול", "גדולה", "גדולים", "קטן", "קטנה", "קטנים", "ענק",
  "סט", "חבילה", "חבילות", "יח", "יחידות", "קרטון", "זוג", "שקית", "קופסה", "מארז",
  "דגם", "חדש", "איכותי", "מעורב", "סמ", "מטר", "גרם",
])

export function tokenize(text: string): string[] {
  const raw = String(text ?? "")
    .toLowerCase()
    .replace(/[^֐-׿a-z0-9\s"']/g, " ")
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)

  const tokens = new Set<string>()
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue
    tokens.add(word)
    for (const prefix of HEBREW_PREFIXES) {
      if (word.startsWith(prefix) && word.length > 2) {
        const stripped = word.slice(1)
        if (!STOPWORDS.has(stripped)) tokens.add(stripped)
      }
    }
  }
  return [...tokens]
}

export type ScoredProduct = {
  product: Product
  score: number
  strongEvidence: string[]
}

const WEIGHT = { tag: 12, name: 10, subcategory: 5, category: 3, description: 1 }

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
      const deduped = strongEvidence
        .sort((a, b) => a.length - b.length)
        .filter((tok, i, arr) => !arr.slice(0, i).some((shorter) => tok.includes(shorter)))
      scored.push({ product, score, strongEvidence: deduped })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
}

export function extractQuantity(message: string): number | null {
  const cleaned = message.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, " ")
  const matches = cleaned.match(/(?<![\d-])(\d{1,4})(?![\d-])/g)
  if (!matches) return null
  const n = parseInt(matches[0], 10)
  if (n >= 1 && n <= 9999) return n
  return null
}

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

const WEAK_INTENTS: Intent[] = ["greeting", "thanks_closing", "identity"]
const WEAK_INTENT_MAX_LENGTH = 35

const YEH_STOCK_PATTERN = /^יש\s+\S/
const GENERAL_TOYS_PATTERN = /צעצועים|\btoys?\b|וטייגר|בריכ/i
const PERSONAL_GREETING_PHRASES = [
  "יום לא דברנו", "לא מצליח", "כאן שוב", "כמה יום", "לא מצליח להתחבר", "בעיה", "בעיות",
]

function matchIntentByKeywords(message: string): Intent | null {
  const normalized = message.toLowerCase().trim()

  if (YEH_STOCK_PATTERN.test(normalized) && normalized.length <= 40) {
    // "יש לך/יש לכם X?" = שאלת מלאי ישירה → stock תמיד.
    // recognize() יטעון categoryProducts לפי הקטגוריה מאוחר יותר.
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
      if (intent === "greeting" && PERSONAL_GREETING_PHRASES.some(p => normalized.includes(p))) {
        return null
      }
      return intent
    }
  }
  return null
}

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

const MORE_PATTERN = /^(תן לי |תראה לי |אפשר )?עוד( אפשרויות| אופציות| מהקטגוריה)?[!.?]*$|^(הבא|הבאים|more|next)[!.?]*$/i

export function recognizeMore(message: string): boolean {
  return MORE_PATTERN.test(message.trim().toLowerCase())
}

export function recognizeSelection(message: string, pendingOptions: Product[], offset = 0): Product | null {
  if (!pendingOptions || pendingOptions.length === 0) return null
  const cleaned = message.trim().toLowerCase()

  const PURE = /^(?:מספר|אפשרות|את ה|ה)?\s*([0-9][0-9]?)\.?\s*$/
  const PHRASE = /(?:תביא לי|קח|אני רוצה|תן לי|תביא את|את ה|מס['׳]?\s*|ומה עם\s*)(?:את\s+)?(?:מספר\s*)?([1-9][0-9]?)(?:\s|$|\.|[?!])/
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

  if (pendingOptions.length > 0 && recognizeMore(message)) {
    let nextOffset = pendingOffset + 5
    if (nextOffset >= pendingOptions.length) nextOffset = 0
    const context: IntentContext = {
      userMessage: message, product: null, matches: [], quantity: null, category: null,
      categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: nextOffset,
    }
    return {
      intent: "category_browse",  // "עוד" = pagination = category_browse
      context,
      response: formatOptions(pendingOptions, "עוד אפשרויות:", nextOffset),
      escalate: false,
      debug: { topMatches: [], hasStrongProduct: false, category: null },
    }
  }

  const selected = recognizeSelection(message, pendingOptions, pendingOffset)
  if (selected) {
    const wantsPhotoEarly = /תמונ|תמונות|שלח/.test(message) || /^ומה עם \d/.test(message.trim())
    const earlyIntent = wantsPhotoEarly ? "send_photo" : "stock"
    const context: IntentContext = {
      userMessage: message, product: selected, matches: [selected],
      quantity: extractQuantity(message), category: null, categoryProducts: [], needsConfirmation: false, options: [],
    }
    const ruleEarly = INTENT_RULES[earlyIntent]
    return {
      intent: earlyIntent,
      context,
      response: ruleEarly.template(context),
      escalate: ruleEarly.requiresEscalation(context),
      debug: { topMatches: [{ id: selected.id, name: selected.name, score: 999 }], hasStrongProduct: true, category: null },
    }
  }

  const matches = searchCatalog(message, catalog)
  const evidencedRaw = matches.filter((m) => m.strongEvidence.length >= 1)
  const evidenced = dedupeScoredByBaseName(evidencedRaw)
  const top = evidenced[0] ?? matches[0]
  const hasStrongProduct = !!top && top.score >= MIN_SCORE_THRESHOLD && top.strongEvidence.length >= 1
  const product = hasStrongProduct ? top.product : (hintProduct ?? null)

  const confidentCandidates = evidenced.filter(
    (m) => m.score >= CONFIDENT_SCORE_THRESHOLD || m.strongEvidence.length >= CONFIDENT_EVIDENCE_COUNT
  )
  const hasTie =
    (evidenced.length >= 2 && evidenced[1].score === top?.score) ||
    confidentCandidates.length >= 2

  const isConfident =
    hasStrongProduct &&
    !hasTie &&
    (top.score >= CONFIDENT_SCORE_THRESHOLD || top.strongEvidence.length >= CONFIDENT_EVIDENCE_COUNT)

  if (pendingOptions.length > 0) {
    const refSel = recognizeSelection(message, pendingOptions, pendingOffset)
    if (refSel) {
      const ctxRef: IntentContext = {
        userMessage: message, product: refSel, matches: [refSel],
        quantity: extractQuantity(message), category: null, categoryProducts: [], needsConfirmation: false, options: [],
      }
      const wantsPhoto = /תמונ|תמונות|שלח/.test(message)
      const useIntent = wantsPhoto ? "send_photo" : "stock"
      const ruleRef = INTENT_RULES[useIntent]
      return {
        intent: useIntent, context: ctxRef, response: ruleRef.template(ctxRef),
        escalate: ruleRef.requiresEscalation(ctxRef),
        debug: { topMatches: [{ id: refSel.id, name: refSel.name, score: 999 }], hasStrongProduct: true, category: null },
      }
    }
  }

  if (pendingOptions.length > 0 && recognizeMore(message)) {
    let nextOffset = pendingOffset + 5
    if (nextOffset >= pendingOptions.length) nextOffset = 0
    const ctxMore: IntentContext = {
      userMessage: message, product: null, matches: [], quantity: null, category: null,
      categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: nextOffset,
    }
    return {
      intent: "category_browse", context: ctxMore,
      response: formatOptions(pendingOptions, "עוד אפשרויות:", nextOffset),
      escalate: false,
      debug: { topMatches: [], hasStrongProduct: false, category: null },
    }
  }

  let intent = matchIntentByKeywords(message)
  const CONFIRM_PATTERN = /^(כן,?\s*)?זה בסדר[!.?]*$|^בסדר גמור[!.?]*$|^אוקיי?,?\s*זה בסדר[!.?]*$|^כן,?\s*זה בסדר[!.?]*$|^זה בסדר[!.?]*$/
  if (intent === null && CONFIRM_PATTERN.test(message.trim())) intent = "confirmation"
  if (intent === null && /^בסדר,?\s*קרטון/.test(message.trim())) intent = "order"

  const intentWasKeywordMatched = intent !== null
  let category: CategoryKey | null = null

  const quantityCount = (message.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, " ").match(/(?<![\d-])\d{1,4}(?![\d-])/g) ?? []).length
  if (quantityCount >= 3 && intent !== "debt") intent = "order"
  if (intent === null && quantityCount >= 1 && /\d+\s*קרטון|קרטון\s*אחד/.test(message)) intent = "order"

  const DELIVERY_FOLLOWUP = /משלוח|משלח|דליברי|יגיע המשלוח|המשלוח הבא|מתי יגיע|מתי מגיע|ומה עם משלוח|מתי יגיע המשלוח הבא|יגיע המשלוח הבא|מתי המשלוח/
  const ORDER_URGENT = /דחוק|הרגיל שלי|אני לוקח|תכין לי|תוסיף לי/
  // "מה יש לX?" / "מה יש לך לX?" = עיון בקטגוריה (only ל, not ב)
  // Negative lookahead prevents "לך"/"לכם" from being consumed by ל[^\s]
  // "יש סטים למסיבה?" = browsing context
  // "מה יש לך/לכם ב/ל..." (no ו prefix) = fresh browse
  // "ומה יש לך/לכם ל..." (with ו) = new category but still browse
  // "ומה יש לך ב..." (with ו) = continuation in context → stays as stock (not matched)
  const BROWSE_PATTERN = /^מה יש (לך |לכם )?[לב](?!ך|כם)|^ו?מה יש (לך |לכם )?ל(?!ך|כם)|^יש [^?]*למסיב/
  const PRICE_INQUIRY_OVERRIDE = /הנחה|מחיר טוב|כמה זה יורד|מחיר סיטוני|מחיר סיטונאי/
  if (PRICE_INQUIRY_OVERRIDE.test(message) && intent !== "debt") {
    intent = "price"
  } else if (ORDER_URGENT.test(message) && intent !== "debt") {
    intent = "order"
  } else if (DELIVERY_FOLLOWUP.test(message) && intent !== "order" && intent !== "debt") {
    // Early return — bypass the pendingOptions→category_browse override later in the function
    const escalCtx: IntentContext = { userMessage: message, product: null, matches: [], quantity: null, category: null, categoryProducts: [], needsConfirmation: false, options: [] }
    return { intent: "escalate_other", context: escalCtx, response: INTENT_RULES.escalate_other.template(escalCtx), escalate: true, debug: { topMatches: [], hasStrongProduct: false, category: null } }
  } else if (BROWSE_PATTERN.test(message.trim())) {
    const browseCategory = recognizeCategory(message)
    if (browseCategory) {
      // "מה יש לך לX?" = עיון בקטגוריה חדשה, גם אחרי רשימה קיימת
      intent = "category_browse"
      category = browseCategory
    }
  }

  if (intent === null && pendingOptions.length > 0) {
    const followCat = recognizeCategory(message)
    if (followCat) { intent = "stock"; category = followCat }
  }

  if (intent === null && pendingOptions.length > 0) {
    const m = message.trim()
    const isShortFollowup = m.length <= 25 && (/^ו/.test(m) || /^עוד/.test(m) || /\?$/.test(m))
    if (isShortFollowup) {
      // "ומה עם 5?" / "שלח תמונות של מס 2" - בדוק אם יש בקשת תמונה + מספר
      const wantsPhotoRef = /תמונ|שלח/.test(m) || /^ומה עם \d/.test(m)
      if (wantsPhotoRef) {
        const refSel = recognizeSelection(m, pendingOptions, pendingOffset)
        if (refSel) {
          const ctxPhoto: IntentContext = { userMessage: message, product: refSel, matches: [refSel], quantity: null, category: null, categoryProducts: [], needsConfirmation: false, options: [] }
          return { intent: "send_photo", context: ctxPhoto, response: INTENT_RULES.send_photo.template(ctxPhoto), escalate: INTENT_RULES.send_photo.requiresEscalation(ctxPhoto), debug: { topMatches: [{ id: refSel.id, name: refSel.name, score: 999 }], hasStrongProduct: true, category: null } }
        }
      }
      const context: IntentContext = {
        userMessage: message, product: null, matches: [], quantity: null, category: null,
        categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: pendingOffset,
      }
      return { intent: "stock", context, response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset), escalate: false, debug: { topMatches: [], hasStrongProduct: false, category: null } }
    }
  }

  if (intent === null && pendingOptions.length > 0) {
    const m = message.trim().toLowerCase()
    if (/^(אוקיי?,?\s*)?מה יש[?!.]*$|^נו[?!.]*$|^טוב,?\s*מה יש[?!.]*$/.test(m)) {
      const context: IntentContext = {
        userMessage: message, product: null, matches: [], quantity: null, category: null,
        categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: pendingOffset,
      }
      return { intent: "stock", context, response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset), escalate: false, debug: { topMatches: [], hasStrongProduct: false, category: null } }
    }
  }

  if (pendingOptions.length > 0) {
    const bareEarly = message.trim().match(/^([1-9][0-9]?)[.!?]*$/)
    if (bareEarly) {
      const nE = parseInt(bareEarly[1], 10)
      const idxE = nE - 1
      if (idxE >= 0 && idxE < pendingOptions.length) {
        const selE = pendingOptions[idxE]
        const ctxE: IntentContext = {
          userMessage: message, product: selE, matches: [selE], quantity: null, category: null,
          categoryProducts: [], needsConfirmation: false, options: [],
        }
        return { intent: "stock", context: ctxE, response: INTENT_RULES.stock.template(ctxE), escalate: false, debug: { topMatches: [{ id: selE.id, name: selE.name, score: 999 }], hasStrongProduct: true, category: null } }
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
          userMessage: message, product: sel, matches: [sel], quantity: null, category: null,
          categoryProducts: [], needsConfirmation: false, options: [],
        }
        return { intent: "stock", context: ctxN, response: INTENT_RULES.stock.template(ctxN), escalate: false, debug: { topMatches: [{ id: sel.id, name: sel.name, score: 999 }], hasStrongProduct: true, category: null } }
      }
    }
  }

  if (intent === null && pendingOptions.length > 0) {
    const numSel = recognizeSelection(message, pendingOptions, pendingOffset)
    if (numSel) {
      const ctx2: IntentContext = {
        userMessage: message, product: numSel, matches: [numSel],
        quantity: extractQuantity(message), category: null, categoryProducts: [], needsConfirmation: false, options: [],
      }
      const r2 = INTENT_RULES.stock
      return { intent: "stock", context: ctx2, response: r2.template(ctx2), escalate: false, debug: { topMatches: [{ id: numSel.id, name: numSel.name, score: 999 }], hasStrongProduct: true, category: null } }
    }
  }

  if (intent === null) {
    const implicitProductInquiry = hasStrongProduct && top.strongEvidence.length >= 2
    if (pendingOptions.length > 0) {
      const ctxP: IntentContext = {
        userMessage: message, product: null, matches: [], quantity: null, category: null,
        categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: pendingOffset,
      }
      return { intent: "stock", context: ctxP, response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset), escalate: false, debug: { topMatches: [], hasStrongProduct: false, category: null } }
    }
    if (implicitProductInquiry) {
      intent = "stock"
    } else {
      category = recognizeCategory(message)
      if (category) {
        intent = "category_browse"
      } else if (GENERAL_TOYS_PATTERN.test(message)) {
        intent = "category_browse"
        category = "games_puzzles"
      } else if (pendingOptions.length > 0) {
        intent = "stock"
        const ctxF: IntentContext = {
          userMessage: message, product: null, matches: [], quantity: null, category: null,
          categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: pendingOffset,
        }
        return { intent: "stock", context: ctxF, response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset), escalate: false, debug: { topMatches: [], hasStrongProduct: false, category: null } }
      } else {
        intent = "escalate_other"
      }
    }
  } else if (intent === "escalate_other" && pendingOptions.length > 0) {
    const ctxKeep: IntentContext = {
      userMessage: message, product: null, matches: [], quantity: null, category: null,
      categoryProducts: [], needsConfirmation: false, options: pendingOptions, optionsOffset: pendingOffset,
    }
    return { intent: "category_browse", context: ctxKeep, response: formatOptions(pendingOptions, "הנה האפשרויות:", pendingOffset), escalate: false, debug: { topMatches: [], hasStrongProduct: false, category: null } }
  } else if (intent === "send_photo") {
    // תמיד נטעון קטגוריה עבור send_photo - כך הרשימה נשמרת ב-session לבחירה הבאה
    category = recognizeCategory(message)
  } else if (intent === "stock" && !category) {
    // תמיד ננסה לזהות קטגוריה עבור stock - גם כשיש מוצר ספציפי
    const stockCat = recognizeCategory(message)
    if (stockCat) {
      category = stockCat
    } else if (GENERAL_TOYS_PATTERN.test(message)) {
      category = "games_puzzles"
    }
  } else if (PRODUCT_DEPENDENT_INTENTS.includes(intent) && !hasStrongProduct) {
    const stockCategory = category ?? recognizeCategory(message)
    if (stockCategory) category = stockCategory
  }

  let categoryProducts: Product[] = []
  if (category) {
    const catName = CATEGORY_RULES[category].catalogCategory
    categoryProducts = catalog.filter((p) => p.category === catName).slice(0, 15)
  }

  const optionsPool =
    intent === "category_browse" || intent === "send_photo"
      ? categoryProducts
      : (intent === "stock" && !product && categoryProducts.length > 0)
        ? categoryProducts
        : (intent === "stock" && !product && pendingOptions.length > 0)
          ? pendingOptions                                    // "יש לך?" עם הקשר קיים
          : (intent === "stock" && categoryProducts.length > 0 && evidenced.length <= 2)
            ? categoryProducts                               // מעט מוצרים → הראה קטגוריה לניווט
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
