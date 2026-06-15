// ================================================================
// src/lib/conversation-logger.ts
// ================================================================
// 📝 לוגר שיחות - כותב כל turn ל-logs/conversations.jsonl
// (JSONL = JSON Lines, שורה אחת לכל record - קל לparse + append)
//
// מבנה כל שורה:
// {
//   ts: number,           // timestamp
//   date: "2024-07-15",
//   from: "0521234567",   // מספר טלפון (מזהה שיחה)
//   message: string,      // הודעת הלקוח
//   intent: Intent,       // מה הבוט זיהה
//   response: string,     // תשובת הבוט
//   escalate: boolean,    // האם הועבר לאביחי
//   hasProduct: boolean,  // האם נמצא מוצר ספציפי
//   topScore: number,     // score ההתאמה הטובה ביותר
//   topMatch: string,     // id+שם המוצר הכי קרוב
//   sessionSize: number,  // כמה אפשרויות ב-session
//   outcome?: "order" | "abandon" | "pending"  // מה יצא מהשיחה (מחושב בדיעבד)
// }
// ================================================================

import fs from "fs"
import path from "path"
import type { RecognitionResult } from "./recognize"

const LOG_DIR = path.join(process.cwd(), "logs")
const LOG_FILE = path.join(LOG_DIR, "conversations.jsonl")

export type ConversationTurn = {
  ts: number
  date: string
  from: string
  message: string
  intent: string
  response: string
  escalate: boolean
  hasProduct: boolean
  topScore: number
  topMatch: string
  sessionSize: number
  outcome?: "order" | "abandon" | "pending"
}

export function logTurn(
  from: string,
  message: string,
  result: RecognitionResult,
  sessionSize: number
): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

    const top = result.debug.topMatches[0]
    const turn: ConversationTurn = {
      ts: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      from,
      message,
      intent: result.intent,
      response: result.response.slice(0, 200), // חוסך מקום
      escalate: result.escalate,
      hasProduct: result.debug.hasStrongProduct,
      topScore: top?.score ?? 0,
      topMatch: top ? `${top.id} ${top.name}` : "",
      sessionSize,
    }

    fs.appendFileSync(LOG_FILE, JSON.stringify(turn) + "\n", "utf-8")
  } catch (e) {
    // לוגינג לעולם לא שובר את הבוט עצמו
    console.error("Logger error (non-fatal):", e)
  }
}

// מסמן outcome של שיחה שלמה (כל ה-turns של אותו from ב-session אחד)
// קוראים לזה מ-route.ts כשמגיעה הזמנה (intent=order) - ממקסם את ה-outcome
export function markOutcome(from: string, outcome: "order" | "abandon"): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return

    const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean)
    // מסמן רק את ה-N turns האחרונים של אותו from (session נוכחי)
    const now = Date.now()
    const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 שעות
    const updated = lines.map((line) => {
      try {
        const turn: ConversationTurn = JSON.parse(line)
        if (
          turn.from === from &&
          now - turn.ts < SESSION_WINDOW_MS &&
          !turn.outcome
        ) {
          return JSON.stringify({ ...turn, outcome })
        }
      } catch {}
      return line
    })
    fs.writeFileSync(LOG_FILE, updated.join("\n") + "\n", "utf-8")
  } catch (e) {
    console.error("markOutcome error (non-fatal):", e)
  }
}
