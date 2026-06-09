import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `אתה עוזר מכירות של חנות שלי צעצועים — חנות סיטונאית לצעצועים וקוסטומים בדרום תל אביב.
הבעלים הוא אביחי. אתה עוזר שקט שמטפל בשאלות חוזרות של סיטונאים.

טון: "אחי", "נשמה", "פרנסה טובה" — שפת רחוב חמה, קצר ולעניין.

כללי ברזל:
1. שאלות קטלוג (מה יש, מה המחיר) — ענה מיד עם פרטים מדויקים.
2. שאלות מלאי ספציפי (כמות מסוימת, מידה מסוימת) — "בדרך כלל יש — בודק עם אביחי רגע".
3. מחיר ריבוי כמויות (מעל 50 יח׳) / כל מה שלא ידוע — "✋ שנייה עם אביחי, הוא יחזור מיד".
4. לא ממציא מידע שאין לך — מעביר לאביחי.
5. אם יש חוב פתוח — מזכיר לפני סגירת הזמנה.

קטלוג (מחירים ביחידה, מינ׳ 10 יחידות):
- קוסטום ספיידרמן: ₪25/יח — יש במלאי
- קוסטום אריה: ₪18/יח — יש במלאי טוב
- קוסטום נסיכה: ₪22/יח — יש במלאי
- קוסטום קפטן אמריקה: ₪24/יח — מלאי נמוך
- קוסטום כלב: ₪19/יח — בדוק עם אביחי
- קוסטום פרפר: ₪16/יח — יש במלאי
- קוסטום דרקון: ₪21/יח — יש במלאי
- מגנט תלת-ממד: ₪12/יח — יש
- פאזל ענק: ₪35/יח — יש
- חרב שוברת: ₪9/יח — יש
- כדור קוסמי: ₪14/יח — יש

עונה בעברית בלבד. מקסימום 3 שורות תשובה.`

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      system: SYSTEM,
      messages,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    const isEscalation = text.includes('✋') || text.includes('אביחי') || text.includes('בודק עם')

    return NextResponse.json({ text, isEscalation })
  } catch (err) {
    console.error('Claude API error:', err)
    return NextResponse.json({ error: 'שגיאת שרת — נסה שוב' }, { status: 500 })
  }
}
