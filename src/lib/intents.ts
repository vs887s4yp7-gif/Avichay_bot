// ================================================================
// src/lib/intents.ts
// ================================================================
// "ספר החוקים" של ה-Railed Bot. כל intent מוגדר עם:
//   - keywords: מילות מפתח לזיהוי (regex פשוט/substring)
//   - template: פונקציה שמייצרת את התשובה הסופית
//   - requiresEscalation: מתי להעביר לאביחי
//
// 📌 הטמפלטים נבנו מתוך הדוגמאות האמיתיות שניתחנו בשיחות WhatsApp
// (ניר/יבגני/רותם/פרדי) - ראו הערות "מבוסס על:" בכל intent.
//
// אפשר לעדכן keywords/templates בלי לגעת בשום קוד אחר -
// זה הקובץ היחיד שאביחי (או אתה) צריך לערוך לשינויי תוכן.
// ================================================================

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
  | "escalate_other"

// ================================================================
// Context - מה שעוברים ל-template, נבנה ע"י recognize.ts
// ================================================================
export type IntentContext = {
  userMessage: string
  product?: Product | null
  matches?: Product[]        // אם נמצאו כמה מוצרים מתאימים
  quantity?: number | null
  category?: CategoryKey | null     // 🆕 קטגוריה שזוהתה (אם בוטל)
  categoryProducts?: Product[]      // 🆕 מוצרים מהקטגוריה (להצגה כ"דוגמאות")
  // 🆕 התאמה בינונית (סף תחתון עבר, סף ביטחון לא) - לשאול במקום לקבוע.
  // "יש לך מפות שולחן?" עם התאמה ל"טניס שולחן" -> "התכוונת ל...?" במקום "כן, יש!"
  needsConfirmation?: boolean
  // 🆕 איפה בתוך ctx.options/categoryProducts ה"עמוד" הנוכחי מתחיל
  // (pagination - "עוד" מקדם ב-5)
  optionsOffset?: number
  // 🆕 כל המועמדים עם ראיות (לא רעש) - להצגת "תפריט אפשרויות" במצב עמימות.
  // שאלה פתוחה ("יש לך זוהרים?") -> מציגים את כולם; מוצר ספציפי -> אחד.
  options?: Product[]
}

export type IntentRule = {
  intent: Intent
  // מילות מפתח - substring match (אחרי tokenize+נרמול)
  keywords: string[]
  // משקל בסיס - מאפשר ל-intents "ספציפיים" לנצח "כלליים" כשיש חפיפה
  priority?: number
  template: (ctx: IntentContext) => string
  requiresEscalation: (ctx: IntentContext) => boolean
}

// ================================================================
// CATEGORY_RULES - מיפוי 12 הקטגוריות האמיתיות בקטלוג (366 מוצרים)
// למילות מפתח שלקוחות עשויים להשתמש בהן.
//
// 📌 נכלל: 10 קטגוריות "פונות-לקוח". הוחרגו:
//   - "כללי" ו-"לסיווג ידני" - קטגוריות ניהוליות פנימיות,
//     לא משהו שלקוח "מבקש" בשם הזה.
//
// recognize.ts (בהמשך) יבדוק: אם userMessage מכיל אחת ממילות
// המפתח, ואין כבר product/intent ספציפי יותר -> category_browse.
// ================================================================
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

export const CATEGORY_RULES: Record<
  CategoryKey,
  {
    displayName: string
    catalogCategory: string
    keywords: string[]
    priority?: number // 🆕 priority - קטגוריות ספציפיות יותר מנצחות כלליות
  }
> = {
  // priority גבוה יותר = מנצח בעריכת חפיפות
  sensory: {
    displayName: "צעצועי חישה",
    catalogCategory: "צעצועי חישה (Sensory)",
    keywords: ["סלים", "סליים", "בוץ קסם", "חישה", "סנסורי", "פופ איט", "פידג'ט", "מתנפח"],
    priority: 100, // 🔝 ספציפי מאוד - מנצח
  },

  building_vehicles: {
    displayName: "צעצועי בנייה ורכבים",
    catalogCategory: "צעצועי בנייה ורכבים",
    keywords: ["לגו", "קוביות", "הרכבה", "מכונית", "רכב", "מסוק"],
    // "רובוט"/"רובוטים" הוצא - "יש רובוטים?" הוא stock, לא עיון קטגוריה
    priority: 100,
  },

  summer_pool: {
    displayName: "קיץ ובריכה",
    catalogCategory: "קיץ ובריכה",
    keywords: ["בריכה", "צעצועי מים", "אקדחי מים", "מזרון ים"], // הסרנו "מתנפח"
    priority: 50,
  },

  summer_decor: {
    displayName: "קיץ וקישוט",
    catalogCategory: "קיץ וקישוט",
    keywords: ["מאוורר", "מניפה", "טחנת רוח", "קישוטי גינה", "לקיץ וקישוט"],
    priority: 50,
  },

  costumes_purim: {
    displayName: "תחפושות ופורים",
    catalogCategory: "תחפושות ופורים",
    keywords: ["תחפושת", "תחפושות", "פורים", "קוסטיום", "קוסטיומים", "מסכה", "מסכות", "פאה"],
    priority: 80,
  },

  light_toys: {
    displayName: "צעצועים מאירים",
    catalogCategory: "צעצועים מאירים",
    keywords: ["מאיר", "מאירים", "זוהר", "גלואו", "led", "נורות", "מקל זוהר", "צמיד זוהר"],
    priority: 60,
  },

  party_events: {
    displayName: "מסיבות ואירועים",
    catalogCategory: "מסיבות ואירועים",
    keywords: ["מסיבה", "מסיבות", "בלון", "בלונים", "יום הולדת", "קישוטי מסיבה"],
    priority: 70,
  },

  outdoor_sports: {
    displayName: "ספורט ומשחקי חוץ",
    catalogCategory: "ספורט ומשחקי חוץ",
    keywords: ["כדור", "כדורגל", "כדורסל", "ספורט", "משחק חוץ", "עפיפון", "רחפן"],
    priority: 60,
  },

  games_puzzles: {
    displayName: "צעצועים ומשחקים",
    catalogCategory: "צעצועים ומשחקים",
    keywords: ["פאזל", "פאזלים", "קלפים", "חידה", "חידות", "משחק שולחן", "4 בשורה", "ארבע בשורה", "פוקימון"],
    priority: 70,
  },

  small_gifts: {
    displayName: "צעצועים ומתנות קטנות",
    catalogCategory: "צעצועים ומתנות קטנות",
    keywords: ["מתנה", "מתנות", "מחזיק מפתחות", "גאדג'ט", "גאדג'טים"],
    priority: 50,
  },
}


// ================================================================
// עזר: רשימת אפשרויות במצב עמימות (2+ מועמדים עם ראיות)
// ================================================================
// 🆕 רשימה ממוספרת - הלקוח יכול להגיב פשוט "2" במקום להקליד שם מוצר
// מדויק. recognize() (עם pendingOptions מה-session) יפענח את הבחירה
// ב-recognizeSelection().
export function formatOptions(options: Product[], opener = "מצאתי כמה אפשרויות מתאימות:", offset = 0): string {
  const page = options.slice(offset, offset + 5)
  const list = page
    .map((p, i) => {
      const price = p.price !== null ? ` - ₪${p.price}` : ""
      const qty = p.cartonQty !== null ? ` (${p.cartonQty} בקרטון)` : ""
      return `${offset + i + 1}. ${p.name} [[PRODUCT:${p.id}]]${price}${qty}`
    })
    .join("\n")
  const lastNum = offset + page.length
  const remaining = options.length - lastNum
  const selectHint = `השב במספר (1-${lastNum})`
  const footer =
    remaining > 0
      ? `${selectHint}, כתוב "עוד" ל-${Math.min(remaining, 5)} אפשרויות נוספות, או תדייק את השם 🙏`
      : `${selectHint}, או תדייק את השם ואבדוק שוב 🙏`
  return `${opener}\n\n${list}\n\n${footer}`
}

export const INTENT_RULES: Record<Intent, IntentRule> = {
  // ──────────────────────────────────────────────────────────
  // ברכות / פתיחת שיחה
  // מבוסס על: "היי", "בוקר טוב", "שלום" - פתיחות נפוצות בשיחות
  // ──────────────────────────────────────────────────────────
  greeting: {
    intent: "greeting",
    keywords: ["היי", "שלום", "בוקר טוב", "ערב טוב", "צהריים טובים", "לילה טוב"],
    // הוצאנו "מה קורה" / "מה המצב" - שיחה חברתית → escalation (אביחי עונה אישית)
    priority: 1,
    template: () =>
      "היי! 👽 שמי חבצול, הבוט של אביחי מ\"שלי צעצועים\" - תכלס תותח קטלוג, פחות תותח בבדיחות.\nאפשר לשאול אותי על מחיר, מלאי, או להזין הזמנה. דברים כספיים (חובות/הנחות) - אני מעביר ישר לאביחי 🙏",
    requiresEscalation: () => false,
  },

  // ──────────────────────────────────────────────────────────
  // זהות הבוט - "מי אתה?", "אתה בוט?", "מה השם שלך?"
  // ──────────────────────────────────────────────────────────
  identity: {
    intent: "identity",
    keywords: ["מי אתה", "מי זה", "את מי מדברת", "אתה בוט", "את בוט", "אתה רובוט", "מה השם שלך", "איך קוראים לך", "בינה מלאכותית", "אתה אדם", "מה אתה"],
    // הוצאנו "רובוט" בלבד - "יש רובוטים?" התפרש כ-identity בטעות
    priority: 2,
    template: () =>
      "חבצול שמי 👽 - בוט (כן, רובוט, לא אביחי בתחפושת) שעוזר עם מחירים, מלאי והזמנות מתוך הקטלוג של שלי צעצועים.\nבעניינים כספיים/חוב/הנחות - מעביר ישר לבוס האמיתי 🙏",
    requiresEscalation: () => false,
  },

  // ──────────────────────────────────────────────────────────
  // מחיר
  // מבוסס על: "מה המחיר?", "כמה עולה?", "כמה עולה X גדול?"
  // ──────────────────────────────────────────────────────────
  price: {
    intent: "price",
    keywords: ["מחיר", "כמה עולה", "כמה עולים", "עולה", "עולים", "עלות", "₪", "כמה זה",
      "כמה הגלואו", "כמה הבלון", "כמה עולים הבלון", "כמה זה הגלואו",
      // 🔧 learning loop: שאלות מחיר ללא שם מוצר מלא (הלקוח רואה תמונה)
      "כמה הפשוט", "כמה ה", "כמה זה עולה", "כמה הסלים", "כמה הסליים"],
    priority: 10,
    template: (ctx) => {
      if (!ctx.product) {
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
    requiresEscalation: (ctx) =>
      !ctx.product || ctx.product.price === null || ctx.product.cartonQty === null,
  },

  // ──────────────────────────────────────────────────────────
  // מלאי / קיום
  // מבוסס על: "יש לכם X?", "יש X בקוסטיומי ספיידרמן?", "יש סלים?"
  // ──────────────────────────────────────────────────────────
  stock: {
    intent: "stock",
    // "יש" לבד הוסר - גנרי מדי ("יש לי", ברכות חג עם "יש"...) - false positives
    keywords: ["יש לך", "יש לכם", "יש במלאי", "במלאי", "יש עוד", "נשאר לך", "יש אצלך",
      // ⚠️ "מה יש לך לX" → category_browse (ב-recognize.ts)
      // 🔧 learning loop 2026-06-14: מוצרים ספציפיים שנשאלים לעיתים
      "יש כלבים", "יש תנינ", "יש מטוסים", "יש פיקנ",
      // 🔧 tests: מוצרים שנופלים ל-category_browse בטעות  
      "יש מתנפחים", "יש סלים", "יש רובוטים", "יש כדורי"],
    priority: 8,
    template: (ctx) => {
      if (!ctx.product) {
        return "לא מצאתי את זה בקטלוג שלי, מעביר לאביחי לבדיקה 🙏"
      }
      const p = ctx.product
      if (p.price === null || p.cartonQty === null) {
        return `${p.name} - יש לנו, אבל צריך לבדוק מחיר/כמות עדכניים מול אביחי 🙏`
      }
      if (ctx.needsConfirmation) {
        const opts = ctx.options ?? []
        if (opts.length >= 2) return formatOptions(opts, "מצאתי כמה אפשרויות מתאימות:", ctx.optionsOffset ?? 0)
        return `הכי קרוב שמצאתי: ${p.name} [[PRODUCT:${p.id}]] - ₪${p.price}, כמות בקרטון: ${p.cartonQty} יח'. לזה התכוונת? אם לא - מעביר לאביחי 🙏`
      }
      return `כן, יש! ${p.name} [[PRODUCT:${p.id}]] - ₪${p.price}, כמות בקרטון: ${p.cartonQty} יח'`
    },
    requiresEscalation: (ctx) =>
      !ctx.product || ctx.product.price === null || ctx.product.cartonQty === null,
  },

  // ──────────────────────────────────────────────────────────
  // הזמנה
  // מבוסס על: "תכין לי 20 מטוסים קלקר, 3 מגשים מכונית"
  //           "תכין לי 50 קוסטיומי כלב גדל 6-8 שנים"
  // הערה: Railed Bot לא "מבצע" הזמנות - תמיד מאשר קבלה ומעביר לאביחי
  // ──────────────────────────────────────────────────────────
  order: {
    intent: "order",
    keywords: ["תכין לי", "תכין", "הכן לי", "תן לי", "אני רוצה להזמין", "הזמנה", "אני צריך", "תוסיף לי", "תוסיף", "שולח הזמנה", "תארגן לי", "תביא לי"],
    // הועלה מ-9 ל-10.5: "תוסיף 60 סביבונים תראה מה אפשר לעשות לגבי המחיר"
    // = הזמנה (שמזכירה מחיר), לא שאלת מחיר. order גובר על price.
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
    // הזמנה = תמיד escalation (אביחי צריך לאשר ולבדוק מלאי בפועל)
    requiresEscalation: () => true,
  },

  // ──────────────────────────────────────────────────────────
  // חוב / יתרה / תשלומים
  // מבוסס על: "סה״כ נשאר פתוח 17925", "אין בינינו חוב", "סגור אחי"
  // 🚨 לעולם לא Railed Bot "מחשב" חוב - תמיד escalation
  // ──────────────────────────────────────────────────────────
  debt: {
    intent: "debt",
    keywords: [
      "חוב", "יתרה", "כמה אני חייב", "כמה חייב", "נשאר פתוח", "סגרנו חשבון",
      "תשלום", "צ'ק", "העברה", "חשבון פתוח", "סגור אחי", "סגור חשבון",
      "פרטי חשבון", "מספר חשבון", "פרטי העברה", "העברתי",
      "תעשה חשבון", "עשית חשבון", "חשבון כללי", "החשבון שלנו", "כמה יצא", "כמה מגיע",
      "תעשה לי חשבון", "עשה לי חשבון", "תסכם לי",
    ],
    priority: 15, // הכי גבוה - חובה לתפוס לפני intents אחרים
    template: () => "רגע, בודק את החשבון שלך מול אביחי ומעדכן אותך 🙏",
    requiresEscalation: () => true,
  },

  // ──────────────────────────────────────────────────────────
  // הנחות / כמויות גדולות
  // מבוסס על: "כמה עם הנחה ל-500 יח'?", "מחיר סיטונאי?"
  // ──────────────────────────────────────────────────────────
  discount: {
    intent: "discount",
    keywords: ["הנחה", "הנחות", "מחיר סיטונאי", "מחיר טוב יותר", "אפשר זול יותר", "VIP"],
    priority: 12,
    template: () => "על הנחות/כמויות גדולות אביחי מתאם אישית - מעביר אליו 🙏",
    requiresEscalation: () => true,
  },

  // ──────────────────────────────────────────────────────────
  // משלוח / זמני אספקה
  // מבוסס על: "כמה זמן לוקח דליברי", "מתי זה מגיע"
  // ──────────────────────────────────────────────────────────
  delivery: {
    intent: "delivery",
    keywords: ["דליברי", "משלוח", "מתי מגיע", "מתי יגיע", "כמה זמן לוקח", "שליח", "איסוף",
      // 🔧 learning loop 2026-06-14: לקוחות בודקים מוכנות הזמנה ואיסוף
      "מוכן לי", "מוכן?", "הגיע הקונטיינר", "הגיעו", "אתה בחנות", "אפשר לבוא", "אני בדרך"],
    priority: 7,
    template: () => "בדרך כלל 2-3 ימי עבודה. לתאום מדויק / איסוף - מעביר לאביחי 🙏",
    requiresEscalation: () => true, // שמרני - שלא נבטיח זמן ונכזיב
  },

  // ──────────────────────────────────────────────────────────
  // תודה / סיום שיחה
  // מבוסס על: "סבבה", "תודה רבה", "פרנסה בשפע", "יאללה תודה אחי"
  // ──────────────────────────────────────────────────────────
  thanks_closing: {
    intent: "thanks_closing",
    keywords: ["תודה", "סבבה", "מעולה", "יאללה", "פרנסה", "תודה רבה", "10x", "thx"],
    priority: 6,
    template: () => "סבבה אחי 🙏 פרנסה בשפע!",
    requiresEscalation: () => false,
  },

  // ──────────────────────────────────────────────────────────
  // 🆕 בקשת תמונה - "תשלח לי תמונה של X" / "שלח תמונות"
  // מבוסס על: [25] "שלח לי תמונות של הנידו שיש לך"
  //           [26] "תשלח לי תמונה של הקליי 4 צבעים..."
  //           [22] "שלח לי תמונות של מה יש במלאי בכל אזור הסקוואשים"
  // 💡 כאן לבוט יש יתרון על אביחי - הקטלוג זמין לו מיידית!
  //
  // priority=11 - מעל order (9): "תשלח לי תמונה" מכיל מילים שאחרת
  // היו עלולות להתפרש כהזמנה. בדיקת "תמונה" ספציפית גוברת.
  // ──────────────────────────────────────────────────────────
  send_photo: {
    intent: "send_photo",
    keywords: [
      "תשלח לי תמונה", "תשלח תמונה", "שלח לי תמונה", "שלח תמונה",
      "תשלח לי תמונות", "תשלח תמונות", "שלח לי תמונות", "שלח תמונות",
      "תמונה של", "תמונות של", "יש תמונה", "יש לך תמונה", "תראה לי תמונה",
    ],
    priority: 11,
    template: (ctx) => {
      // נמצא מוצר עם תמונה אמיתית - שולחים!
      if (ctx.product && ctx.product.image) {
        return `הנה ${ctx.product.name} [[PRODUCT:${ctx.product.id}]] 📸${ctx.product.price !== null ? `\n₪${ctx.product.price}${ctx.product.cartonQty !== null ? `, כמות בקרטון: ${ctx.product.cartonQty} יח'` : ""}` : ""}`
      }
      // נמצא מוצר אבל בלי תמונה אמיתית (39 ה-SKUs מהאאודיט)
      if (ctx.product && !ctx.product.image) {
        return `מצאתי את ${ctx.product.name} [[PRODUCT:${ctx.product.id}]] אבל אין לי תמונה עדכנית שלו - מעביר לאביחי שישלח 🙏`
      }
      // יש קטגוריה - מציעים את מה שיש
      const catProducts = ctx.categoryProducts ?? []
      if (catProducts.length > 0) {
        return formatOptions(catProducts, `הנה מה שיש לנו${ctx.category ? ` ב${CATEGORY_RULES[ctx.category].displayName}` : ""}:`, ctx.optionsOffset ?? 0)
      }
      // לא נמצא כלום - escalation
      return "לא מצאתי את זה בקטלוג שלי - מעביר לאביחי שישלח לך תמונות 🙏"
    },
    requiresEscalation: (ctx) => {
      // escalation רק אם: אין מוצר עם תמונה וגם אין קטגוריה עם מוצרים
      const hasProductPhoto = !!(ctx.product && ctx.product.image)
      const hasCategoryList = (ctx.categoryProducts ?? []).length > 0
      return !hasProductPhoto && !hasCategoryList
    },
  },

  // ──────────────────────────────────────────────────────────
  // עיון בקטגוריה - "מה יש לכם ב..." / "תראה לי תחפושות"
  // מבוסס על: לקוחות ששואלים על תחום שלם, לא מוצר ספציפי.
  // recognize.ts יזהה category (CATEGORY_RULES) ויטען עד 5
  // מוצרים מהקטגוריה ל-ctx.categoryProducts.
  // ──────────────────────────────────────────────────────────
  category_browse: {
    intent: "category_browse",
    keywords: [], // 🔑 לא keywords רגילים - מזוהה ע"י CATEGORY_RULES (ראה להלן)
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

  // ──────────────────────────────────────────────────────────
  // קאטצ'-ALL - כל מה שלא הוכר
  // ──────────────────────────────────────────────────────────
  escalate_other: {
    intent: "escalate_other",
    keywords: [],
    priority: 0,
    template: () => "קיבלתי, בודק את זה ומעדכן אותך - תן לי רגע 🙏",
    requiresEscalation: () => true,
  },
}

// ================================================================
// סדר עדיפויות לבדיקה (מהגבוה לנמוך) - שימושי ל-recognize.ts
// ================================================================
export const INTENT_PRIORITY_ORDER: Intent[] = Object.values(INTENT_RULES)
  .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  .map((rule) => rule.intent)
