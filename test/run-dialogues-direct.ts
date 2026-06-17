// ================================================================
// test/run-dialogues-direct.ts
// מריץ את 50 שיחות הבדיקה ישירות - ללא HTTP, ללא שרת
//
// הרצה: npx tsx test/run-dialogues-direct.ts
// ================================================================

import fs from "fs"
import path from "path"
import { recognize } from "../src/lib/recognize"
import type { Product } from "../src/lib/types"
import { INTENT_RULES } from "../src/lib/intents"

// ================================================================
// טעינת קטלוג
// ================================================================
function loadCatalog(): Product[] {
  const candidates = [
    path.join(process.cwd(), "data/catalog.json"),
    path.join(process.cwd(), "src/lib/catalog.json"),
  ]
  let rawText: string | null = null
  for (const p of candidates) {
    if (fs.existsSync(p)) { rawText = fs.readFileSync(p, "utf-8"); break }
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

// ================================================================
// Session - מדמה את route.ts session store
// ================================================================
type Session = { options: Product[]; offset: number; lastProduct: Product | null }

function processMessage(
  message: string,
  catalog: Product[],
  session: Session
): { intent: string; escalate: boolean; response: string; hasImages: boolean; newSession: Session } {
  let result = recognize(message, catalog, session.options, session.offset, session.lastProduct)

  // follow-up product context injection (זהה ל-route.ts)
  // Skip injection if context already has a list to show (pendingOptions came back as options)
  if (
    !result.context.product &&
    session.lastProduct &&
    (result.context.options ?? []).length === 0 &&
    (result.intent === "price" || result.intent === "stock" || result.intent === "send_photo")
  ) {
    const injectedCtx = { ...result.context, product: session.lastProduct }
    const rule = INTENT_RULES[result.intent]
    result = {
      ...result,
      context: injectedCtx,
      response: rule.template(injectedCtx),
      escalate: rule.requiresEscalation(injectedCtx),
    }
  }

  const newOptions = result.context.options ?? []
  const newOffset = result.context.optionsOffset ?? 0
  const newLastProduct = result.context.product ?? session.lastProduct

  const keepOptions = newOptions.length >= 2 ? newOptions : session.options
  const keepOffset = newOptions.length >= 2 ? newOffset : session.offset

  const newSession: Session = {
    options: keepOptions,
    offset: keepOffset,
    lastProduct: newLastProduct,
  }

  // בניית תשובה נקייה (הסרת [[PRODUCT:xxx]])
  const PRODUCT_PLACEHOLDER = /\[\[PRODUCT:([A-Z0-9]+)\]\]/g
  const productIds: string[] = []
  const cleanResponse = result.response.replace(PRODUCT_PLACEHOLDER, (_, id) => {
    productIds.push(id)
    return ""
  }).replace(/\s{2,}/g, " ").trim()

  // hasImages: האם יש תמונות (בסביבה ישירה - לפי product.image)
  const allIds = productIds.length > 0
    ? productIds
    : (result.context.options ?? []).slice(0, 5).map(p => p.id)
  const hasImages = allIds.some(id => {
    const p = catalog.find(p => p.id === id)
    return p && !!p.image
  })

  return {
    intent: result.intent,
    escalate: result.escalate,
    response: cleanResponse.slice(0, 100),
    hasImages,
    newSession,
  }
}

// ================================================================
// פונקציות עזר לבדיקת תשובות (זהה ל-run-dialogues-50.ts)
// ================================================================
const contains = (...words: string[]) => (response: string) =>
  words.some(w => response.includes(w))

const hasNumber = (response: string) =>
  /₪\d|(\d+)\s*ש/.test(response)

const hasList = (response: string) =>
  /\d\.\s/.test(response)

// ================================================================
// 50 שיחות - זהה בדיוק ל-run-dialogues-50.ts
// ================================================================
type Turn = {
  message: string
  expectedIntent: string
  shouldEscalate: boolean
  check?: (response: string, intent: string, hasImages: boolean) => boolean
  description: string
}

type Dialogue = {
  id: number
  title: string
  turns: Turn[]
}

const DIALOGUES: Dialogue[] = [
  { id: 1, title: "סליים - שאלה ישירה", turns: [
    { message: "יש לך סליים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקת מלאי", check: (r,_,imgs) => hasList(r) || contains("₪")(r) || imgs },
    { message: "כמה מחיר?", expectedIntent: "price", shouldEscalate: false, description: "שאלת מחיר", check: r => hasNumber(r) },
    { message: "אני לוקח 3 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 2, title: "מסכות - עם תמונה", turns: [
    { message: "יש לך מסכות?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: (r,_,imgs) => hasList(r) || imgs || contains("₪")(r) },
    { message: "שלח לי תמונה", expectedIntent: "send_photo", shouldEscalate: false, description: "בקשת תמונה" },
    { message: "בעיר אומרים מחיר 0.4", expectedIntent: "price", shouldEscalate: false, description: "השוואת מחיר", check: r => hasNumber(r) || contains("₪")(r) },
    { message: "זה בסדר, תכין לי קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 3, title: "בלונים למסיבות - עם עוד", turns: [
    { message: "יש לך בלונים?", expectedIntent: "stock", shouldEscalate: false, description: "רשימה ראשונה", check: r => hasList(r) },
    { message: "עוד", expectedIntent: "category_browse", shouldEscalate: false, description: "עמוד הבא", check: r => /\d\./.test(r) },
    { message: "3", expectedIntent: "stock", shouldEscalate: false, description: "בחירת מוצר", check: contains("₪") },
    { message: "תביא לי 10 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 4, title: "פוקימון - מחיר סיטוני", turns: [
    { message: "מה יש לך בפוקימון?", expectedIntent: "category_browse", shouldEscalate: false, description: "עיון", check: r => hasList(r) || contains("₪")(r) },
    { message: "כמה מחיר סיטוני?", expectedIntent: "price", shouldEscalate: false, description: "מחיר סיטוני", check: r => hasNumber(r) },
    { message: "אני לוקח 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 5, title: "שאלת חוב - escalation", turns: [
    { message: "כמה אני חייב?", expectedIntent: "debt", shouldEscalate: true, description: "שאלת חוב", check: contains("אביחי","🙏","קיבלתי") },
    { message: "בסדר, עכשיו יש לך סלים?", expectedIntent: "stock", shouldEscalate: false, description: "שיחה חדשה", check: r => hasList(r) || contains("₪")(r) },
    { message: "2", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תכין לי 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 6, title: "תחפושות פורים - הזמנה 50", turns: [
    { message: "מה יש לך לפורים?", expectedIntent: "category_browse", shouldEscalate: false, description: "עיון בפורים", check: r => hasList(r) },
    { message: "יש תחפושות?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה ספציפית", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תכין לי 50 יחידות", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 7, title: "מתנפחים לבריכה - צילום", turns: [
    { message: "יש מתנפחים לבריכה?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: (r,_,imgs) => hasList(r) || imgs },
    { message: "שלח תמונות של מס 2", expectedIntent: "send_photo", shouldEscalate: false, description: "בקשת תמונה" },
    { message: "כמה מחיר?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "אני לוקח קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 8, title: "גלואו סטיק - מחיר מהיר", turns: [
    { message: "כמה עולה גלואו סטיק?", expectedIntent: "price", shouldEscalate: false, description: "מחיר ישיר", check: r => hasNumber(r) || hasList(r) },
    { message: "תביא לי 2 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 9, title: "סלים - משלוח דחוק", turns: [
    { message: "יש לך סלים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "צריך דחוק, יש משלוח היום?", expectedIntent: "order", shouldEscalate: true, description: "הזמנה דחופה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 10, title: "מצופי בריכה - בחירה ממוספרת", turns: [
    { message: "יש מצופי בריכה?", expectedIntent: "stock", shouldEscalate: false, description: "רשימה", check: r => hasList(r) },
    { message: "תביא לי את מס 3", expectedIntent: "stock", shouldEscalate: false, description: "בחירה טבעית", check: contains("₪") },
    { message: "ומה הכמות בקרטון?", expectedIntent: "price", shouldEscalate: false, description: "שאלת כמות", check: r => /\d+\s*(יח|בקרטון)/.test(r) || contains("₪")(r) },
    { message: "בסדר, קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 11, title: "בריכות - סגנון ניר", turns: [
    { message: "מה קורה", expectedIntent: "escalate_other", shouldEscalate: true, description: "פתיחה חברתית", check: contains("קיבלתי","🙏","אביחי") },
    { message: "יש בריכות?", expectedIntent: "stock", shouldEscalate: false, description: "שאלת מלאי", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "סבבה תכין לי 3 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 12, title: "אקדחי מים - תמונות", turns: [
    { message: "שלח תמונות של אקדחי מים", expectedIntent: "send_photo", shouldEscalate: false, description: "בקשת תמונות", check: (r,_,imgs) => imgs || hasList(r) },
    { message: "כמה עולה מספר 2?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) || contains("₪")(r) },
    { message: "תביא לי 20 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 13, title: "גלישה בין קטגוריות", turns: [
    { message: "מה יש לך לבריכה?", expectedIntent: "category_browse", shouldEscalate: false, description: "קטגוריית בריכה", check: r => hasList(r) },
    { message: "ומה יש לך למסיבות?", expectedIntent: "category_browse", shouldEscalate: false, description: "מסיבות", check: r => hasList(r) },
    { message: "ומה יש לך לפורים?", expectedIntent: "category_browse", shouldEscalate: false, description: "פורים", check: r => hasList(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תכין לי 100", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 14, title: "שינוי נושא - סלים", turns: [
    { message: "כמה עולים הבלונים?", expectedIntent: "price", shouldEscalate: false, description: "מחיר בלונים", check: r => hasNumber(r) || hasList(r) },
    { message: "ומה עם סלים?", expectedIntent: "stock", shouldEscalate: false, description: "מעבר לסלים", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "אני לוקח 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 15, title: "דינוזאור שיניים", turns: [
    { message: "יש לך דינוזאור שיניים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: (r,_,imgs) => hasList(r) || contains("₪")(r) || imgs },
    { message: "כמה מחיר?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "תכין לי 2 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 16, title: "כריש - כמות בקרטון", turns: [
    { message: "יש כריש?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "כמה יה בקרטון?", expectedIntent: "price", shouldEscalate: false, description: "שאלת כמות", check: r => /\d+\s*(יח|בקרטון)/.test(r) },
    { message: "בסדר, קרטון אחד", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 17, title: "כירוגי עם בדיקה", turns: [
    { message: "יש כירוגי?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: (r,_,imgs) => hasList(r) || contains("₪")(r) || imgs },
    { message: "שלח תמונה", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה" },
    { message: "כמה עולה?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "תביא לי 15 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 18, title: "אוקי טוקי - הוראה ישירה", turns: [
    { message: "שים 6 אוקי טוקי", expectedIntent: "order", shouldEscalate: true, description: "הוראה ישירה", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 19, title: "סביבונים לחנוכה", turns: [
    { message: "יש סביבונים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "תוסיף 60 סביבונים", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 20, title: "אביזרי פורים - סה״כ", turns: [
    { message: "מה יש לך באביזרי פורים?", expectedIntent: "category_browse", shouldEscalate: false, description: "עיון", check: r => hasList(r) },
    { message: "תביא לי 30 מכל אחד", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 21, title: "עדכון מחיר - סליים", turns: [
    { message: "ירד המחיר על סליים", expectedIntent: "price", shouldEscalate: false, description: "עדכון מחיר", check: r => hasNumber(r) || contains("₪")(r) },
    { message: "כמה עכשיו?", expectedIntent: "price", shouldEscalate: false, description: "מחיר חדש", check: r => hasNumber(r) },
    { message: "בסדר, 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 22, title: "בקשה לחשבונית", turns: [
    { message: "תשלח לי חשבונית?", expectedIntent: "escalate_other", shouldEscalate: true, description: "escalation", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 23, title: "בלונים טבעיים", turns: [
    { message: "יש לך בלונים טבעיים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי 8 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 24, title: "צעצועים - יש לך משהו חדש?", turns: [
    { message: "יש לך צעצועים חדשים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) },
    { message: "אני חייב לך מהעבר", expectedIntent: "debt", shouldEscalate: true, description: "שאלת חוב", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 25, title: "TOYS - שיחה מעורבת", turns: [
    { message: "יש לך TOYS חדשים?", expectedIntent: "stock", shouldEscalate: false, description: "מילה אנגלית", check: r => hasList(r) || contains("צעצועים")(r) },
    { message: "צעצועים כלליים", expectedIntent: "stock", shouldEscalate: false, description: "הבהרה", check: r => hasList(r) },
    { message: "2", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 26, title: "מתנפחים - הרבה", turns: [
    { message: "יש מתנפחים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "הרבה מכל סוג", expectedIntent: "order", shouldEscalate: true, description: "הזמנה כללית", check: contains("קיבלתי","🙏") },
  ]},
  { id: 27, title: "זוהרים - עמוד שני", turns: [
    { message: "יש זוהרים?", expectedIntent: "stock", shouldEscalate: false, description: "רשימה ראשונה", check: r => hasList(r) },
    { message: "עוד", expectedIntent: "category_browse", shouldEscalate: false, description: "עמוד הבא", check: r => /\d\./.test(r) },
    { message: "עוד", expectedIntent: "category_browse", shouldEscalate: false, description: "עמוד שלישי", check: r => /\d\./.test(r) },
    { message: "4", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי 3", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 28, title: "קלפים פוקימון סדרה חדשה", turns: [
    { message: "הגיעו קלפים פוקימון סדרה חדשה?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "כמה קרטון?", expectedIntent: "price", shouldEscalate: false, description: "כמות בקרטון", check: r => /\d+\s*(יח|קרטון|בקרטון)/.test(r) },
    { message: "תכין לי 10", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 29, title: "סטים למסיבה", turns: [
    { message: "יש סטים למסיבה?", expectedIntent: "category_browse", shouldEscalate: false, description: "עיון", check: r => hasList(r) },
    { message: "מספר 5 כמה עולה?", expectedIntent: "price", shouldEscalate: false, description: "מחיר ספציפי", check: r => hasNumber(r) },
    { message: "בסדר, 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 30, title: "קונפטי - עם קשר חברתי", turns: [
    { message: "בוקר טוב, כמה יום לא דברנו", expectedIntent: "escalate_other", shouldEscalate: true, description: "פתיחה חברתית", check: contains("קיבלתי","🙏","אביחי") },
    { message: "יש קונפטי?", expectedIntent: "stock", shouldEscalate: false, description: "שאלה", check: r => hasList(r) || contains("₪")(r) },
    { message: "2", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי 20 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 31, title: "בחירה עם בקשת תמונה", turns: [
    { message: "יש צעצועים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) },
    { message: "תמונה של 3", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה ספציפית" },
    { message: "ומה עם 5?", expectedIntent: "send_photo", shouldEscalate: false, description: "עוד תמונה" },
    { message: "אני לוקח את 3, 20 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 32, title: "מחיר עם דיון", turns: [
    { message: "יש לך סלים טובים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "מה המחיר?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "זה יקר", expectedIntent: "price", shouldEscalate: false, description: "negotiation", check: r => hasNumber(r) || contains("₪")(r) },
    { message: "בסדר, תכין לי 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 33, title: "כמות גדולה - הנחה", turns: [
    { message: "אם אני לוקח הרבה יש הנחה?", expectedIntent: "price", shouldEscalate: false, description: "שאלת הנחה", check: r => hasNumber(r) || contains("₪")(r) },
    { message: "כמה זה יורד?", expectedIntent: "price", shouldEscalate: false, description: "מחיר חדש", check: r => hasNumber(r) },
    { message: "בסדר, 100 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 34, title: "סה״כ חשבון", turns: [
    { message: "סה״כ כמה?", expectedIntent: "escalate_other", shouldEscalate: true, description: "escalation", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 35, title: "חזרה לקטגוריה", turns: [
    { message: "יש לך בלונים?", expectedIntent: "stock", shouldEscalate: false, description: "קטגוריה ראשונה", check: r => hasList(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "ומה יש לך בסלים?", expectedIntent: "stock", shouldEscalate: false, description: "מעבר", check: r => hasList(r) || contains("₪")(r) },
    { message: "אני לוקח בלונים, 5 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 36, title: "משלוח דחוק", turns: [
    { message: "יש לך סלים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "צריך היום - דחוק מאוד!", expectedIntent: "order", shouldEscalate: true, description: "הזמנה דחופה", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 37, title: "בעיית התחברות", turns: [
    { message: "שלום, אני לא מצליח להתחבר", expectedIntent: "escalate_other", shouldEscalate: true, description: "בעיה טכנית", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 38, title: "סדרה חדשה - broadcast", turns: [
    { message: "הגיעה סדרה חדשה של פוקימון!", expectedIntent: "stock", shouldEscalate: false, description: "הודעה", check: r => hasList(r) || contains("₪")(r) },
    { message: "יש לך?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => contains("₪")(r) || hasList(r) },
    { message: "כמה קרטון?", expectedIntent: "price", shouldEscalate: false, description: "כמות", check: r => /\d+\s*(יח|קרטון|בקרטון)/.test(r) },
    { message: "תכין לי 8", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 39, title: "הזמנה חוזרת - הרגיל", turns: [
    { message: "הרגיל שלי", expectedIntent: "order", shouldEscalate: true, description: "הזמנה חוזרת", check: contains("קיבלתי","🙏") },
  ]},
  { id: 40, title: "בדיקת מחיר עונתי", turns: [
    { message: "בפסח יש מחיר טוב?", expectedIntent: "price", shouldEscalate: false, description: "מחיר עונתי", check: r => hasNumber(r) || hasList(r) },
    { message: "על תחפושות בעיקר", expectedIntent: "stock", shouldEscalate: false, description: "ספציפיקציה", check: r => hasList(r) || contains("₪")(r) },
    { message: "3", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תכין לי 50 לפסח", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 41, title: "מוצר לא קיים - חלופה", turns: [
    { message: "יש וטייגר?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) || contains("לא")(r) },
    { message: "אוקיי, מה יש?", expectedIntent: "stock", shouldEscalate: false, description: "חלופה", check: r => hasList(r) },
    { message: "2", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי 10 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 42, title: "תמונה - media only", turns: [
    { message: "<המדיה לא נכללה>", expectedIntent: "send_photo", shouldEscalate: false, description: "תמונה בלבד", check: (_,__,imgs) => imgs },
    { message: "כן, זה בסדר", expectedIntent: "confirmation", shouldEscalate: false, description: "אישור", check: contains("סדר","בחור") },
  ]},
  { id: 43, title: "דיון על צבע וגודל", turns: [
    { message: "יש סלים באדום?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה עם צבע", check: r => hasList(r) || contains("₪")(r) || contains("אדום")(r) },
    { message: "וכחול?", expectedIntent: "stock", shouldEscalate: false, description: "צבע אחר", check: r => hasList(r) || contains("כחול")(r) },
    { message: "אני לוקח שניהם, 5 קרטון מכל אחד", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 44, title: "זוהרים עם בחירה ממוספרת", turns: [
    { message: "שלח זוהרים", expectedIntent: "send_photo", shouldEscalate: false, description: "בקשת תמונות", check: (r,_,imgs) => imgs || hasList(r) },
    { message: "מס 2 מעניין", expectedIntent: "stock", shouldEscalate: false, description: "בחירה עם תיאור", check: contains("₪") },
    { message: "כמה עולה?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "בסדר, 7 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 45, title: "הבהרה על כמות בקרטון", turns: [
    { message: "יש מתנפחים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "כמה יח בקרטון?", expectedIntent: "price", shouldEscalate: false, description: "שאלת כמות", check: r => /\d+\s*(יח|בקרטון)/.test(r) },
    { message: "בסדר, 3 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 46, title: "שאלה ישירה לאביחי", turns: [
    { message: "אביחי, אתה שם?", expectedIntent: "escalate_other", shouldEscalate: true, description: "קריאה לאביחי", check: contains("קיבלתי","🙏","אביחי") },
  ]},
  { id: 47, title: "משלוח + חוב", turns: [
    { message: "כמה אני חייב בעבר?", expectedIntent: "debt", shouldEscalate: true, description: "שאלת חוב", check: contains("קיבלתי","🙏") },
    { message: "ומתי יגיע המשלוח הבא?", expectedIntent: "escalate_other", shouldEscalate: true, description: "שאלת משלוח", check: contains("קיבלתי","🙏") },
  ]},
  { id: 48, title: "הזמנה גדולה - סדר קבוע", turns: [
    { message: "שווקים שם? צריך את הרגיל", expectedIntent: "order", shouldEscalate: true, description: "הזמנה שבועית", check: contains("קיבלתי","🙏") },
  ]},
  { id: 49, title: "חזרה אחרי הפסקה", turns: [
    { message: "היי, אני כאן שוב", expectedIntent: "escalate_other", shouldEscalate: true, description: "חזרה", check: contains("קיבלתי","🙏","אביחי") },
    { message: "יש לך סלים?", expectedIntent: "stock", shouldEscalate: false, description: "שאלה חדשה", check: r => hasList(r) || contains("₪")(r) },
    { message: "1", expectedIntent: "stock", shouldEscalate: false, description: "בחירה", check: contains("₪") },
    { message: "תביא לי 5", expectedIntent: "order", shouldEscalate: true, description: "הזמנה", check: contains("קיבלתי","🙏") },
  ]},
  { id: 50, title: "שיחה מלאה - מלאי עד הזמנה", turns: [
    { message: "שלום, כמה יש לך סלים?", expectedIntent: "stock", shouldEscalate: false, description: "בדיקה", check: r => hasList(r) || contains("₪")(r) },
    { message: "בסדר, מה המחיר?", expectedIntent: "price", shouldEscalate: false, description: "מחיר", check: r => hasNumber(r) },
    { message: "זה בסדר", expectedIntent: "confirmation", shouldEscalate: false, description: "אישור", check: contains("בסדר","אוקיי","כן") },
    { message: "תכין לי 100 קרטון", expectedIntent: "order", shouldEscalate: true, description: "הזמנה גדולה", check: contains("קיבלתי","🙏","אביחי") },
    { message: "ומה עם משלוח?", expectedIntent: "escalate_other", shouldEscalate: true, description: "שאלת משלוח", check: contains("קיבלתי","🙏") },
  ]},
]

// ================================================================
// Runner ישיר
// ================================================================
function runDialogue(
  dialogue: Dialogue,
  catalog: Product[]
): { passed: number; total: number; failures: string[] } {
  let session: Session = { options: [], offset: 0, lastProduct: null }
  let passed = 0
  const failures: string[] = []

  console.log(`\n💬 שיחה ${dialogue.id}: ${dialogue.title}`)
  console.log("  " + "─".repeat(60))

  for (let i = 0; i < dialogue.turns.length; i++) {
    const turn = dialogue.turns[i]
    const result = processMessage(turn.message, catalog, session)
    session = result.newSession

    const intentOk = result.intent === turn.expectedIntent
    const escalateOk = result.escalate === turn.shouldEscalate
    const checkOk = !turn.check || turn.check(result.response, result.intent, result.hasImages)
    const ok = intentOk && escalateOk && checkOk

    const icon = ok ? "  ✅" : "  ❌"
    const imgTag = result.hasImages ? " 🖼️" : ""
    console.log(`${icon} [${i + 1}] "${turn.message}" → ${result.intent}${result.escalate ? " 🙏" : ""}`)
    console.log(`       ${turn.description}`)
    console.log(`       "${result.response}"${imgTag}`)

    if (!ok) {
      let reason = ""
      if (!intentOk) reason += ` intent:${result.intent}≠${turn.expectedIntent}`
      if (!escalateOk) reason += ` escalate:${result.escalate}≠${turn.shouldEscalate}`
      if (!checkOk) reason += " [check failed]"
      failures.push(`שיחה ${dialogue.id} turn ${i + 1}: "${turn.message}"${reason}`)
    } else {
      passed++
    }
  }

  const pct = Math.round(passed / dialogue.turns.length * 100)
  console.log(`  ${"─".repeat(60)}`)
  console.log(`  📊 ${passed}/${dialogue.turns.length} (${pct}%) ${pct === 100 ? "🎉" : ""}`)
  return { passed, total: dialogue.turns.length, failures }
}

function main() {
  console.log("\n👽 חבצול - בדיקה ישירה (ללא HTTP)")

  let catalog: Product[]
  try {
    catalog = loadCatalog()
    console.log(`📦 קטלוג: ${catalog.length} מוצרים`)
  } catch (e) {
    console.error("שגיאה בטעינת קטלוג:", e)
    process.exit(1)
  }

  const totalTurns = DIALOGUES.reduce((sum, d) => sum + d.turns.length, 0)
  console.log(`🧪 ${DIALOGUES.length} שיחות | ${totalTurns} turns סה"כ`)

  let totalPassed = 0, totalTotal = 0
  const allFailures: string[] = []

  for (const dialogue of DIALOGUES) {
    const { passed, total, failures } = runDialogue(dialogue, catalog)
    totalPassed += passed
    totalTotal += total
    allFailures.push(...failures)
  }

  const pct = Math.round(totalPassed / totalTotal * 100)
  console.log(`\n${"═".repeat(70)}`)
  console.log(`📊 סיכום: ${totalPassed}/${totalTotal} turns עברו (${pct}%)`)

  if (allFailures.length) {
    console.log(`\n🔧 כשלונות (${allFailures.length}):`)
    allFailures.forEach(f => console.log(`   ${f}`))
  }

  const emoji = pct >= 80 ? "🟢" : pct >= 60 ? "🟡" : "🔴"
  console.log(`\n${emoji} ציון: ${pct}% - ${pct >= 80 ? "מוכן לאביחי! 🎉" : pct >= 60 ? "עוד קצת עבודה" : "דורש שיפור"}\n`)
}

main()
