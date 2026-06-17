import type { Product } from "./types"

export type Intent =
  | "greeting"
  | "identity"
  | "price"
  | "stock"
  | "order"
  | "debt"
  | "discount"
  | "delivery"
  | "send_photo"
  | "category_browse"
  | "thanks_closing"
  | "confirmation"
  | "escalate_other"

export type IntentContext = {
  userMessage: string
  product?: Product | null
  matches?: Product[]
  quantity?: number | null
  category?: CategoryKey | null
  categoryProducts?: Product[]
  needsConfirmation?: boolean
  optionsOffset?: number
  options?: Product[]
}

export type IntentRule = {
  intent: Intent
  keywords: string[]
  priority?: number
  template: (ctx: IntentContext) => string
  requiresEscalation: (ctx: IntentContext) => boolean
}

export type CategoryKey =
  | "summer_pool"
  | "summer_decor"
  | "costumes_purim"
  | "light_toys"
  | "party_events"
  | "outdoor_sports"
  | "building_vehicles"
  | "games_puzzles"
  | "small_gifts"
  | "sensory"

export const CATEGORY_RULES: Record<CategoryKey, { displayName: string; catalogCategory: string; keywords: string[]; priority?: number }> = {
  sensory: { displayName: "צעצועי חישה", catalogCategory: "צעצועי חישה (Sensory)", keywords: ["סלים", "סליים", "בוץ קסם", "חישה", "סנסורי", "פופ איט", "פידג'ט"], priority: 100 },
  building_vehicles: { displayName: "צעצועי בנייה ורכבים", catalogCategory: "צעצועי בנייה ורכבים", keywords: ["לגו", "קוביות", "הרכבה", "מכונית", "רכב", "מסוק"], priority: 100 },
  summer_pool: { displayName: "קיץ ובריכה", catalogCategory: "קיץ ובריכה", keywords: ["בריכה", "צעצועי מים", "אקדחי מים", "מזרון ים"], priority: 50 },
  summer_decor: { displayName: "קיץ וקישוט", catalogCategory: "קיץ וקישוט", keywords: ["מאוורר", "מניפה", "טחנת רוח", "קישוטי גינה", "לקיץ וקישוט"], priority: 50 },
  costumes_purim: { displayName: "תחפושות ופורים", catalogCategory: "תחפושות ופורים", keywords: ["תחפושת", "תחפושות", "פורים", "קוסטיום", "קוסטיומים", "מסכה", "מסכות", "פאה", "כירוגי", "כירורגי"], priority: 80 },
  light_toys: { displayName: "צעצועים מאירים", catalogCategory: "צעצועים מאירים", keywords: ["מאיר", "מאירים", "זוהר", "זוהרים", "גלואו", "led", "נורות", "מקל זוהר", "צמיד זוהר"], priority: 60 },
  party_events: { displayName: "מסיבות ואירועים", catalogCategory: "מסיבות ואירועים", keywords: ["מסיבה", "מסיבות", "למסיבות", "בלון", "בלונים", "יום הולדת", "קישוטי מסיבה", "קישוטי"], priority: 70 },
  outdoor_sports: { displayName: "ספורט ומשחקי חוץ", catalogCategory: "ספורט ומשחקי חוץ", keywords: ["כדור", "כדורגל", "כדורסל", "ספורט", "משחק חוץ", "עפיפון", "רחפן"], priority: 60 },
  games_puzzles: { displayName: "צעצועים ומשחקים", catalogCategory: "צעצועים ומשחקים", keywords: ["פאזל", "פאזלים", "קלפים", "חידה", "חידות", "משחק שולחן", "4 בשורה", "ארבע בשורה", "פוקימון", "סביבון", "סביבונים"], priority: 70 },
  small_gifts: { displayName: "צעצועים ומתנות קטנות", catalogCategory: "צעצועים ומתנות קטנות", keywords: ["מתנה", "מתנות", "מחזיק מפתחות", "גאדג'ט", "גאדג'טים"], priority: 50 },
}

export function formatOptions(options: Product[], opener = "מצאתי כמה אפשרויות מתאימות:", offset = 0): string {
  const page = options.slice(offset, offset + 5)
  const list = page.map((p, i) => {
    const price = p.price !== null ? ` - ₪${p.price}` : ""
    const qty = p.cartonQty !== null ? ` (${p.cartonQty} בקרטון)` : ""
    return `${offset + i + 1}. ${p.name} [[PRODUCT:${p.id}]]${price}${qty}`
  }).join("\n")
  const lastNum = offset + page.length
  const remaining = options.length - lastNum
  const selectHint = `השב במספר (1-${lastNum})`
  const footer = remaining > 0
    ? `${selectHint}, כתוב "עוד" ל-${Math.min(remaining, 5)} אפשרויות נוספות, או תדייק את השם 🙏`
    : `${selectHint}, או תדייק את השם ואבדוק שוב 🙏`
  return `${opener}\n\n${list}\n\n${footer}`
}

export const INTENT_RULES: Record<Intent, IntentRule> = {
  greeting: {
    intent: "greeting",
    keywords: ["היי", "שלום", "בוקר טוב", "ערב טוב", "צהריים טובים", "לילה טוב"],
    priority: 1,
    template: () => "היי! 👽 שמי חבצול, הבוט של אביחי מ\"שלי צעצועים\" - תכלס תותח קטלוג, פחות תותח בבדיחות.\nאפשר לשאול אותי על מחיר, מלאי, או להזין הזמנה. דברים כספיים (חובות/הנחות) - אני מעביר ישר לאביחי 🙏",
    requiresEscalation: (ctx) => {
      const PERSONAL = ["יום לא דברנו", "לא מצליח", "כאן שוב", "כמה יום", "מה שלומך", "מה נשמע", "לא מצליח להתחבר", "בעיה", "בעיות"]
      return PERSONAL.some(p => ctx.userMessage.includes(p))
    },
  },
  identity: {
    intent: "identity",
    keywords: ["מי אתה", "מי זה", "את מי מדברת", "אתה בוט", "את בוט", "אתה רובוט", "מה השם שלך", "איך קוראים לך", "בינה מלאכותית", "אתה אדם", "מה אתה"],
    priority: 2,
    template: () => "חבצול שמי 👽 - בוט (כן, רובוט, לא אביחי בתחפושת) שעוזר עם מחירים, מלאי והזמנות מתוך הקטלוג של שלי צעצועים.\nבעניינים כספיים/חוב/הנחות - מעביר ישר לבוס האמיתי 🙏",
    requiresEscalation: () => false,
  },
  price: {
    intent: "price",
    keywords: ["מחיר", "כמה עולה", "כמה עולים", "עולה", "עולים", "עלות", "₪", "כמה זה", "מחיר טוב", "הנחה",
      "כמה הגלואו", "כמה הבלון", "כמה עולים הבלון", "כמה זה הגלואו",
      "כמה הפשוט", "כמה ה", "כמה זה עולה", "כמה הסלים", "כמה הסליים",
      "כמה בקרטון", "כמה קרטון", "כמות בקרטון", "כמה יח בקרטון", "כמה יש בקרטון", "כמה יה בקרטון",
      "כמה עכשיו", "זה יקר",
      "מחיר סיטונאי", "מחיר סיטוני", "כמה מחיר סיטוני", "כמה זה יורד", "לוקח הרבה", "מחיר טוב", "יש מחיר טוב", "מחיר טוב יותר"],
    priority: 10,
    template: (ctx) => {
      if (!ctx.product) {
        const GENERAL_PRICE = ["מחיר סיטוני", "מחיר סיטונאי", "כמה זה יורד", "מחיר טוב", "הנחה", "לוקח הרבה"]
        if (GENERAL_PRICE.some(p => ctx.userMessage.includes(p))) {
          return "המחירים שלנו מ-₪1 לפריט - כולם מחירי סיטונאות. על כמויות גדולות / הנחות מיוחדות - מעביר לאביחי 🙏"
        }
        return "לא מצאתי את המוצר הזה בקטלוג שלי, מעביר לאביחי לבדיקה 🙏"
      }
      const p = ctx.product
      if (p.price === null || p.cartonQty === null) {
        return `${p.name} - צריך לבדוק מחיר עדכני מול אביחי, מעביר אליו 🙏`
      }
      if (ctx.needsConfirmation) {
        const opts = ctx.options ?? []
        if (opts.length >= 2) return formatOptions(opts, "מצאתי כמה אפשרויות מתאימות:", ctx.optionsOffset ?? 0)
        return `אולי התכוונת ל${p.name} [[PRODUCT:${p.id}]]? אם כן - ₪${p.price}, כמות בקרטון: ${p.cartonQty} יח'. אם לא - כתוב לי שוב את שם המוצר ואבדוק 🙏`
      }
      return `${p.name} [[PRODUCT:${p.id}]] - ₪${p.price}, כמות בקרטון: ${p.cartonQty} יח'`
    },
    requiresEscalation: (ctx) => {
      const GENERAL_PRICE = ["מחיר סיטוני", "מחיר סיטונאי", "כמה זה יורד", "מחיר טוב", "הנחה", "לוקח הרבה"]
      if (!ctx.product && GENERAL_PRICE.some(p => ctx.userMessage.includes(p))) return false
      return !ctx.product || ctx.product.price === null || ctx.product.cartonQty === null
    },
  },
  stock: {
    intent: "stock",
    keywords: ["יש לך", "יש לכם", "יש במלאי", "במלאי", "יש עוד", "נשאר לך", "יש אצלך",
      "סטים למסיבה", "סט למסיבה", "סטים", "יש סטים", "בסלים", "על תחפושות", "תחפושות בעיקר",
      "צעצועים כלליים", "כלליים",
      "יש כלבים", "יש תנינ", "יש מטוסים", "יש פיקנ",
      "יש מתנפחים", "יש סלים", "יש רובוטים", "יש כדורי",
      "יש כריש", "יש סביבון", "יש קונפטי", "יש בריכ", "יש זוהר",
      "יש צעצועים", "יש מסכות", "יש תחפושות", "יש וטייגר",
      "הגיעו", "הגיעה סדרה"],
    priority: 8,
    template: (ctx) => {
      const catProducts = ctx.categoryProducts ?? []
      if (!ctx.product && catProducts.length > 0) {
        return formatOptions(catProducts, `יש לנו כמה אפשרויות${ctx.category ? ` ב${CATEGORY_RULES[ctx.category].displayName}` : ""}:`, ctx.optionsOffset ?? 0)
      }
      if (!ctx.product) {
        // אם יש options (למשל מ-pendingOptions) - הראה אותם
        const opts = ctx.options ?? []
        if (opts.length > 0) return formatOptions(opts, "הנה מה שיש:", ctx.optionsOffset ?? 0)
        return "לא מצאתי את זה בקטלוג שלי, מעביר לאביחי לבדיקה 🙏"
      }
      const p = ctx.product
      if (p.price === null || p.cartonQty === null) {
        // אם אין מחיר/כמות אבל יש קטגוריה - הראה רשימת קטגוריה
        if (catProducts.length > 0) return formatOptions(catProducts, `יש לנו כמה אפשרויות${ctx.category ? ` ב${CATEGORY_RULES[ctx.category].displayName}` : ""}:`, ctx.optionsOffset ?? 0)
        return `${p.name} - יש לנו, אבל צריך לבדוק מחיר/כמות עדכניים מול אביחי 🙏`
      }
      if (ctx.needsConfirmation) {
        const opts = ctx.options ?? []
        if (opts.length >= 2) return formatOptions(opts, "מצאתי כמה אפשרויות מתאימות:", ctx.optionsOffset ?? 0)
        return `1. ${p.name} [[PRODUCT:${p.id}]] - ₪${p.price} (${p.cartonQty} בקרטון)\n\nהשב 1 לבחירה, או דייק את שם המוצר 🙏`
      }
      return `כן, יש! ${p.name} [[PRODUCT:${p.id}]] - ₪${p.price}, כמות בקרטון: ${p.cartonQty} יח'`
    },
    requiresEscalation: (ctx) => {
      if (!ctx.product && (ctx.categoryProducts ?? []).length > 0) return false
      if (!ctx.product && (ctx.options ?? []).length > 0) return false
      if (ctx.product && ctx.product.price !== null && ctx.product.cartonQty !== null) return false
      if (ctx.product && (ctx.categoryProducts ?? []).length > 0) return false  // null price but has category list
      if (ctx.product) return false
      return true
    },
  },
  order: {
    intent: "order",
    keywords: ["תכין לי", "תכין", "הכן לי", "תן לי", "אני רוצה להזמין", "הזמנה", "אני צריך", "תוסיף לי", "תוסיף", "שולח הזמנה", "תארגן לי", "תביא לי",
      "אני לוקח", "שים", "הרגיל שלי", "הרגיל", "צריך היום", "דחוק", "צריך דחוק", "הרבה מכל סוג", "הרבה מכל"],
    priority: 10.5,
    template: (ctx) => {
      if (!ctx.product) {
        return "קיבלתי, אבל לא מצאתי את המוצר המדויק בקטלוג - מעביר לאביחי שיבדוק ויחזור אליך 🙏"
      }
      const p = ctx.product
      if (ctx.quantity) {
        return `קיבלתי: ${ctx.quantity} יח' של ${p.name} [[PRODUCT:${p.id}]]\nמעביר לאביחי לאישור והכנה 🙏`
      }
      return `קיבלתי בקשה ל-${p.name} [[PRODUCT:${p.id}]] - מעביר לאביחי לאישור הכמות והפרטים 🙏`
    },
    requiresEscalation: () => true,
  },
  debt: {
    intent: "debt",
    keywords: ["חוב", "יתרה", "כמה אני חייב", "כמה חייב", "נשאר פתוח", "סגרנו חשבון",
      "תשלום", "צ'ק", "העברה", "חשבון פתוח", "סגור אחי", "סגור חשבון",
      "פרטי חשבון", "מספר חשבון", "פרטי העברה", "העברתי",
      "תעשה חשבון", "עשית חשבון", "חשבון כללי", "החשבון שלנו", "כמה יצא", "כמה מגיע",
      "תעשה לי חשבון", "עשה לי חשבון", "תסכם לי",
      "אני חייב לך", "חייב לך", "אני חייב"],
    priority: 15,
    template: () => "רגע, בודק את החשבון שלך מול אביחי ומעדכן אותך 🙏",
    requiresEscalation: () => true,
  },
  discount: {
    intent: "discount",
    keywords: ["מחיר טוב יותר", "אפשר זול יותר", "VIP"],
    priority: 13,
    template: () => "על הנחות/כמויות גדולות אביחי מתאם אישית - מעביר אליו 🙏",
    requiresEscalation: () => true,
  },
  delivery: {
    intent: "delivery",
    keywords: ["דליברי", "משלוח", "המשלוח", "ומה עם משלוח", "מתי יגיע המשלוח", "מתי יגיע המשלוח הבא", "המשלוח הבא", "ומתי יגיע המשלוח", "מתי המשלוח הבא", "מתי מגיע", "מתי יגיע", "כמה זמן לוקח", "שליח", "איסוף",
      "מוכן לי", "מוכן?", "הגיע הקונטיינר", "אתה בחנות", "אפשר לבוא", "אני בדרך"],
    priority: 7,
    template: () => "בדרך כלל 2-3 ימי עבודה. לתאום מדויק / איסוף - מעביר לאביחי 🙏",
    requiresEscalation: () => true,
  },
  thanks_closing: {
    intent: "thanks_closing",
    keywords: ["תודה", "סבבה", "מעולה", "יאללה", "פרנסה", "תודה רבה", "10x", "thx"],
    priority: 6,
    template: () => "סבבה אחי 🙏 פרנסה בשפע!",
    requiresEscalation: () => false,
  },
  send_photo: {
    intent: "send_photo",
    keywords: [
      "תשלח לי תמונה", "תשלח תמונה", "שלח לי תמונה", "שלח תמונה",
      "תשלח לי תמונות", "תשלח תמונות", "שלח לי תמונות", "שלח תמונות",
      "תמונה של", "תמונות של", "יש תמונה", "יש לך תמונה", "תראה לי תמונה",
      "שלח זוהרים", "שלח בלונים", "שלח תחפושות", "שלח מוצרים",
      "<המדיה לא נכללה>", "המדיה לא נכללה",
    ],
    priority: 11,
    template: (ctx) => {
      if (ctx.product && ctx.product.image) {
        return `הנה ${ctx.product.name} [[PRODUCT:${ctx.product.id}]] 📸${ctx.product.price !== null ? `\n₪${ctx.product.price}${ctx.product.cartonQty !== null ? `, כמות בקרטון: ${ctx.product.cartonQty} יח'` : ""}` : ""}`
      }
      if (ctx.product && !ctx.product.image) {
        return `מצאתי את ${ctx.product.name} [[PRODUCT:${ctx.product.id}]] אבל אין לי תמונה עדכנית שלו - מעביר לאביחי שישלח 🙏`
      }
      const catProducts = ctx.categoryProducts ?? []
      if (catProducts.length > 0) {
        return formatOptions(catProducts, `הנה מה שיש לנו${ctx.category ? ` ב${CATEGORY_RULES[ctx.category].displayName}` : ""}:`, ctx.optionsOffset ?? 0)
      }
      return "לא מצאתי את זה בקטלוג שלי - מעביר לאביחי שישלח לך תמונות 🙏"
    },
    requiresEscalation: (ctx) => {
      const hasProductPhoto = !!(ctx.product && ctx.product.image)
      const hasCategoryList = (ctx.categoryProducts ?? []).length > 0
      return !hasProductPhoto && !hasCategoryList
    },
  },
  category_browse: {
    intent: "category_browse",
    keywords: [],
    priority: 4,
    template: (ctx) => {
      const products = ctx.categoryProducts ?? []
      if (products.length === 0) {
        return "לא מצאתי מוצרים בקטגוריה הזו, מעביר לאביחי 🙏"
      }
      return formatOptions(products, `יש לנו כמה אפשרויות ב${ctx.category ? CATEGORY_RULES[ctx.category].displayName : "קטגוריה הזו"}:`, ctx.optionsOffset ?? 0)
    },
    requiresEscalation: (ctx) => (ctx.categoryProducts ?? []).length === 0,
  },
  confirmation: {
    intent: "confirmation",
    keywords: [],
    priority: 5,
    template: () => "בסדר 🙏 ממשיכים!",
    requiresEscalation: () => false,
  },
  escalate_other: {
    intent: "escalate_other",
    keywords: [],
    priority: 0,
    template: () => "קיבלתי, בודק את זה ומעדכן אותך - תן לי רגע 🙏",
    requiresEscalation: () => true,
  },
}

export const INTENT_PRIORITY_ORDER: Intent[] = Object.values(INTENT_RULES)
  .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  .map((rule) => rule.intent)
