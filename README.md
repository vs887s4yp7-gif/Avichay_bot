# שלי צעצועים — בוט סיטונאים POC

דמו אינטראקטיבי לפגישה עם אביחי.

---

## דפלוי ל-Vercel — 4 צעדים

### 1. העלה ל-GitHub
```bash
cd avihai-bot
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/avihai-bot.git
git push -u origin main
```

### 2. חבר ל-Vercel
1. היכנס ל-[vercel.com](https://vercel.com)
2. לחץ **"Add New Project"**
3. בחר את ה-repo `avihai-bot`
4. לחץ **Deploy** (Vercel מזהה Next.js אוטומטית)

### 3. הוסף את ה-API Key
1. אחרי הדפלוי, לחץ **Settings → Environment Variables**
2. הוסף:
   - Name: `ANTHROPIC_API_KEY`
   - Value: ה-key שלך מ-[console.anthropic.com](https://console.anthropic.com)
3. לחץ **Save**
4. לחץ **Redeploy** (חובה אחרי הוספת משתנה!)

### 4. שלח לאביחי
אחרי הדפלוי תקבל URL כמו: `https://avihai-bot.vercel.app`
זה הלינק לשלוח.

---

## פיתוח מקומי

```bash
npm install
cp .env.example .env.local
# הכנס את ה-API key בתוך .env.local
npm run dev
```

פותח על `http://localhost:3000`

---

## איך זה עובד

```
אביחי כותב הודעה
       ↓
/poc page (React)
       ↓
POST /api/chat
       ↓
Anthropic Claude (server-side — לא CORS)
       ↓
תשובה + isEscalation flag
       ↓
אם escalation → מופיע בלוח הניהול הימני
```

---

## לאחר Pilot — השלבים הבאים

1. **SIM נפרד** — קנה SIM, הגדר WhatsApp Business
2. **n8n** — חבר Webhook אמיתי
3. **System prompt** — עדכן לפי rejections מהפגישה
