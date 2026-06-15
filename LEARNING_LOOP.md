# 🔄 Learning Loop - חבצול 👽

## שלב שבועי (כל יום ראשון לפני deploy)

```bash
# 1. הרץ את המנתח (7 ימים אחרונים)
npx tsx src/scripts/analyze-conversations.ts

# או מספר ימים ספציפי
npx tsx src/scripts/analyze-conversations.ts 14

# 2. פתח את הדוח שנוצר
cat logs/improvements-YYYY-MM-DD.json

# 3. אחל שינויים ידנית ב:
#    - src/lib/intents.ts (new_keywords, new_category_keywords)
#    - data/catalog.json  (missing_nicknames → nicknames field)

# 4. בדוק שהכל עובד
npx tsx src/lib/test-intents.ts
npx tsx src/lib/test-with-catalog.ts

# 5. commit + deploy
git add -A && git commit -m "chore: weekly intents improvement $(date +%Y-%m-%d)"
```

## מבנה improvements.json

```json
{
  "generated": "2024-07-15T08:00:00Z",
  "stats": {
    "total": 847,
    "escalate_other": 214,
    "outcome_order": 43,
    "outcome_abandon": 31
  },
  "improvements": {
    "summary": "...",
    "kpis": { "escalate_rate_pct": 25, "order_rate_pct": 5 },

    "new_keywords": [
      { "intent": "stock", "keyword": "יש לך פלאנר", "reason": "...", "examples": [...] }
    ],

    "new_category_keywords": [
      { "category": "light_toys", "keyword": "זוהרים קטנים", "reason": "..." }
    ],

    "missing_nicknames": [
      { "product_id": "P0015", "suggested_nickname": "קלקר", "reason": "..." }
    ],

    "flow_issues": [
      { "issue": "...", "example": "...", "suggested_fix": "..." }
    ],

    "wins": ["intent order זיהה 43 הזמנות"]
  }
}
```

## מה ה-route.ts שומר אוטומטית

כל הודעה → `logs/conversations.jsonl` (שורה אחת):
```jsonl
{"ts":1720000000000,"date":"2024-07-15","from":"0521234567","message":"יש לך זוהרים?","intent":"stock","response":"מצאתי כמה אפשרויות...","escalate":false,"hasProduct":true,"topScore":22,"topMatch":"P0336 מקלות קצף זוהרים","sessionSize":5}
```

`outcome` מסומן אוטומטית כשמגיעה הזמנה (`order`).
נטישות (`abandon`) - יש לסמן ידנית, או להוסיף WhatsApp webhook לזיהוי "שיחה שנסגרה ללא הזמנה".

## הוספת logs/ ל-.gitignore

```
# logs/conversations.jsonl מכיל מספרי טלפון - לא ל-Git!
logs/
```
