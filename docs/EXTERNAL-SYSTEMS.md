# מערכות חיצוניות

---

## 1. Supabase

פרויקט אחד. הכתובת והמפתח האנונימי **מוטמעים בקוד ומשוכפלים בכ-12 קבצים**
במקום להיות מיובאים ממקום אחד.

המקור הרשמי: `src/lib/config.js`

```js
export const SUPABASE_URL      // כתובת הפרויקט
export const SUPABASE_ANON_KEY // מפתח anon — פומבי מעצם הגדרתו
export const BUCKET = 'documents'
export const isConfigured
export function signedPublicUrl(id)
export function signedPartPublicUrl(id, index)
```

עותקים נוספים ב-`src/tik/officeConfig.js`, `src/tik/socialWorker.js`,
ובקובץ ה-workflow `keepalive.yml`. **רוטציה דורשת עריכה של כולם.**

### מה נדרש בפרויקט

| רכיב | מוגדר ב-`schema.sql`? |
|---|---|
| טבלה `agent_submissions` | ✔ |
| טבלה `sign_requests` | ✘ — חסרה |
| טבלה `templates` | ✘ — חסרה |
| דלי ציבורי `documents` | ✘ — חסר |
| אינדקס ייחודי `(docType, number)` | ✘ — חסר, ונדרש לתקינות המספור |

מבנה משוחזר של `sign_requests` מתוך השימוש ב-`src/lib/supabaseApi.js`:

```
id uuid pk, title, pdf_path, signed_pdf_path, fields jsonb,
signers jsonb, status, signer_email, owner_email, webhook_url, signed_at
```

### RLS

⚠️ כל המדיניות היא `using (true) with check (true)` ל-anon — select, insert
ו-update. ראה `docs/OPEN-ISSUES.md` §4.

### keepalive

`.github/workflows/keepalive.yml` שולח ping כל יומיים כדי למנוע השהיה של
פרויקט חינמי.

---

## 2. AI — Gemini ו-Groq

`src/tik/gemini.js` — לקוח דו-ספק.

### 🔑 Groq מקבל עדיפות כששני המפתחות קיימים

| ספק | נקודת קצה | ברירת מחדל |
|---|---|---|
| Gemini | Generative Language REST API | `gemini-flash-latest` |
| Groq | `api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` (טקסט) · `meta-llama/llama-4-scout-17b-16e-instruct` (ראייה) |

Groq תואם-OpenAI, נקרא עם `response_format: json_object` ו-`temperature: 0`.

### ריפוי עצמי של מודל מיושן

`DEPRECATED_MODELS` — מזהה מודל שמור שהתיישן נמחק מ-`localStorage` והקריאה
מנוסה מחדש עם ברירת המחדל, במקום להיכשל ב-404.

### תמונות

מוקטנות ל-~1600px ומקודדות מחדש ל-JPEG לפני השליחה.

### חוזה החילוץ

`FIELD_KEYS` — **27 מפתחות עובד**, תאריכים בפורמט `YYYY-MM-DD`, מחרוזת ריקה
כשהערך חסר. זו הסכמה שתיוק המסמכים האוטומטי נשען עליה.

### איפה המפתחות

| מיקום | מפתח |
|---|---|
| `localStorage` | `tik_gemini_key`, `tik_gemini_model`, `tik_groq_key` |
| שורת `config` ב-Supabase | `data.aiKey` |

המפתחות **אינם במאגר**. המשרד מזין אותם במסך ההגדרות.

השורה ב-Supabase קיימת כדי שקישור הצ'אט הציבורי לא יישא סוד —
`publishChatKey()` / `loadPublishedKey()` ב-`intakeChat.js`. מפתח שמתחיל
ב-`gsk_` מנותב ל-Groq.

### מה נשבר בלי מפתח

`#autofile`, `#assistant`, טיוטה-עם-AI, וחילוץ AI בצ'אט הקליטה. שאר המערכת
אינה מושפעת — `hasAI()` שומר על הממשק.

---

## 3. Edge Functions

`supabase/functions/`

### `telegram-webhook`

קיים כי דפדפן לא יכול לקרוא הודעות בוט (CORS). טלגרם דוחף עדכונים לפונקציית
Deno, שמורידה את התמונה, מחלצת שדות עם Groq בצד שרת, ומכניסה שורת
`agent_submissions` מוכנה לתיבת המשרד.

| סוד | |
|---|---|
| `TELEGRAM_TOKEN` | חובה |
| `GROQ_KEY` | חובה |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | חובה |
| `GROQ_VISION_MODEL`, `GROQ_TEXT_MODEL` | אופציונלי |

⚠️ חייב להיפרס עם **Verify JWT כבוי**, והבוט מופנה אליו דרך `setWebhook`.

### `send-sms`

שני ספקים אפשריים:

| Twilio | שער ישראלי גנרי |
|---|---|
| `TWILIO_SID` | `SMS_URL` |
| `TWILIO_TOKEN` | `SMS_USER` |
| `TWILIO_FROM` | `SMS_PASS` |
| | `SMS_FROM` |

נבחר לפי `SMS_PROVIDER`. מנרמל טלפונים ישראליים ל-`+972`.

---

## 4. ממסר דוא״ל

`docs/email-relay.gs` · `src/lib/notify.js`

Google Apps Script שנפרס כאפליקציית ווב ושולח PDF חתומים מה-Gmail של המשרד —
כי אתר סטטי לא יכול לפתוח SMTP, וסיסמת אפליקציה של Gmail לא יכולה להישלח
ב-JS צד לקוח.

⚠️ חייב להיפרס עם **"Execute as: Me"** ו-**"Who has access: Anyone"**, וכתובת
ה-`/exec` מודבקת בהגדרות.

ההגדרות נשמרות ב-`localStorage` תחת `owner_settings` עם שדה `webhook`,
עם ברירת מחדל לכתובת Apps Script מוטמעת.

⚠️ `email-relay.gs` מכיל כתובת Gmail אישית מוטמעת כ-`FALLBACK_TO`.

---

## 5. תיבת הסוכן החיצוני (Base44)

`src/tik/agentInbox.js`

כל כלי חיצוני יכול לבצע:

```
POST {SUPABASE_URL}/rest/v1/agent_submissions
{ kind, data }
```

והשורה מופיעה בתיבת המשרד. **זהו נתיב הזנת הנתונים העיקרי של המערכת.**

`mergeHalves()` מיישב שורות שהגיעו כשני חצאים של קישור מפוצל — ראה
`docs/DATA-MODEL.md` §3.

---

## 6. אימות

⚠️ **אין אימות אמיתי.** ראה `docs/OPEN-ISSUES.md` §5.

| מה | איפה | מנגנון |
|---|---|---|
| מערכת המשרד | `src/tik/officeAuth.js` | קבוע `PASS` מוטמע + שני שמות משתמש, `localStorage['tik_auth'] === '1'` |
| אפליקציית החתימה | `src/components/Login.jsx` | קבוע `PASS` נפרד |
| פורטל העו״ס | `src/lib/workerPortal.js` | `WORKER_ACCESS_CODE` |
| "מי אני" | `localStorage['ogen_me']` | ברירת מחדל `'משרד'` |

הכל בצד לקוח, מול בסיס נתונים ש-RLS שלו פתוח.

⚠️ `ogen_me` היא המחרוזת שנכתבת ליומן הביקורת של מסמכי המס כ-`issuedBy`.

---

## 7. עבודה בלי backend

`src/lib/api.js` בוחר בין `supabaseApi` ל-`mockApi`:

- כש-`?mock=1` מופיע בכתובת
- או כש-`isConfigured` שקרי

`http://localhost:5173/?mock=1` — נתיב הפיתוח ללא רשת. `mockApi` נשען על
`localStorage`.

---

## 8. תלויות רשת נוספות

| תלות | היכן | מה קורה בלעדיה |
|---|---|---|
| Google Fonts | כל ארבעת קבצי ה-HTML | טיפוגרפיה עברית שבורה, וגופני חתימה שגויים |
| open-nagish (נגישות) | `public/open-nagish.min.js` | ווידג'ט הנגישות לא נטען |

לשניהם אין גיבוי מקומי.
