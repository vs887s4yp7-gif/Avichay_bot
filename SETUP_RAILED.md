# 🚂 Railed Bot (חבצול 👽) - הוראות התקנה

## קבצים לשים בפרויקט

```
Avichay_bot/
├── data/
│   └── catalog.json                        ← ✅ קיים
├── src/
│   ├── lib/
│   │   ├── types.ts                        ← ✅ קיים
│   │   ├── intents.ts                      ← ✅ קיים
│   │   ├── recognize.ts                    ← ✅ קיים
│   │   ├── real-cases.ts                   ← (לבדיקות)
│   │   ├── test-intents.ts                 ← (לבדיקות)
│   │   ├── test-interactive.ts             ← (לבדיקות)
│   │   └── test-with-catalog.ts            ← (לבדיקות)
│   └── app/
│       ├── api/
│       │   └── railed/
│       │       └── route.ts                ← 🆕 הוסף
│       └── railed-ui/
│           └── page.tsx                    ← 🆕 הוסף
└── public/
    └── catalog-images/                     ← 366 תמונות (P0001.jpg...)
```

## הרצה מקומית

```bash
# בדיקות טרמינל (בלי שרת)
npx tsx src/lib/test-interactive.ts
npx tsx src/lib/test-intents.ts
npx tsx src/lib/test-with-catalog.ts

# UI בדיקה (דורש Next.js פעיל)
npm run dev
# פתח: http://localhost:3000/railed-ui
```

## API

```
POST /api/railed
Content-Type: application/json

{ "from": "0521234567", "message": "יש לך זוהרים?" }

Response:
{
  "response": "מצאתי כמה אפשרויות מתאימות:\n\n1. ...",
  "escalate": false,
  "intent": "stock",
  "imageUrl": "/catalog-images/P0336.jpg",   // null אם אין
  "debug": { "topMatch": {...}, "elapsed": 3 }
}
```

## Session Storage

כרגע: **Map בזיכרון** (מתאפס ב-cold start).
לפרודקשן עם Vercel: החלף ב-`@vercel/kv`:

```bash
npm install @vercel/kv
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
```

```typescript
// בתוך route.ts:
import { kv } from "@vercel/kv"

async function getSession(from: string): Promise<Session> {
  return (await kv.get<Session>(`railed:${from}`)) ?? { options: [], offset: 0 }
}
async function setSession(from: string, session: Session): Promise<void> {
  await kv.set(`railed:${from}`, session, { ex: 3600 }) // TTL שעה
}
async function clearSession(from: string): Promise<void> {
  await kv.del(`railed:${from}`)
}
```

## WhatsApp Integration (Phase 2)

```
WhatsApp Cloud API Webhook
  → POST /api/railed
  → { from: entry.changes[0].value.messages[0].from,
      message: entry.changes[0].value.messages[0].text.body }
  → אם escalate: שלח ל-Avichai על SIM#1
  → אם !escalate: שלח תשובה ישירה + imageUrl (אם קיים)
```
