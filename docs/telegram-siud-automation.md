# אוטומציה: Telegram → קובץ מנות סיעוד

מדריך להקמת התהליך ב‑**Make.com**: לקוח שולח לבוט טלגרם צילום של דרכון/ת"ז,
המערכת מחלצת את הפרטים (OCR/AI), מייצרת את קובץ ה־`oz_siud_manot_*.txt`
בפורמט של ביטוח לאומי, ומחזירה אותו בטלגרם (ואופציונלית שומרת ב‑Supabase).

```
┌────────────┐   photo   ┌───────────────┐   image   ┌──────────────┐
│  Telegram  │ ────────▶ │  Make.com     │ ────────▶ │  OCR / Vision │
│    Bot     │           │   scenario    │           │  (JSON fields)│
└────────────┘           └───────┬───────┘           └──────┬───────┘
      ▲                          │  fields (JSON)           │
      │  send document           ▼                          │
      │                  ┌───────────────┐   base64 file    │
      └───────────────── │ generate-siud │ ◀────────────────┘
                         │ (Edge Function)│
                         └───────────────┘
```

## מה צריך להכין מראש

1. **בוט טלגרם** — צרו בוט אצל [@BotFather](https://t.me/BotFather), שמרו את ה־Token.
2. **חשבון Make.com** — עם חיבור ל־Telegram Bot (Token מהשלב הקודם).
3. **ספק OCR/Vision** — אחד מ:
   - OpenAI (מודול *OpenAI › Analyze Image* / GPT‑4o vision), או
   - Anthropic Claude (מודול HTTP), או
   - Google Cloud Vision.
4. **פונקציית `generate-siud`** — פרוסה ב‑Supabase (ראו למטה).

## פריסת פונקציית יצירת הקובץ

הקובץ בפורמט קבוע‑רוחב ובקידוד ISO‑8859‑8 קשה להרכבה בתוך מודולי Make
רגילים, לכן ההרכבה נעשית בפונקציית Edge קטנה שכבר קיימת במאגר:

```bash
# מהשורש של המאגר
supabase functions deploy generate-siud --no-verify-jwt
```

אם ה‑CLI מתלונן על ייבוא קובץ מחוץ ל‑`supabase/functions`:

```bash
cp src/lib/bituachSiudFile.js supabase/functions/generate-siud/bituachSiudFile.js
# ואז בקובץ index.ts שנו את הייבוא ל: "./bituachSiudFile.js"
```

ה‑endpoint שיתקבל:
`https://<PROJECT>.functions.supabase.co/generate-siud`

בדיקה מהירה:

```bash
curl -s -X POST https://<PROJECT>.functions.supabase.co/generate-siud \
  -H 'Content-Type: application/json' \
  -d '{"id":"216095568","lastNameLatin":"KOBILOV","firstNameLatin":"FORIGJON","lastNameHebrew":"קובילוב","firstNameHebrew":"פוריג`ון","birthDate":"19891012","city":"תל אביב - יפו","street":"דירה מנחם ארבה","house":"10","phone":"0547824652"}'
# → {"filename":"oz_siud_manot_216095568_90.txt","base64":"...","bytes":728}
```

## שלבי התרחיש ב‑Make

ניתן לייבא את השלד מ‑`docs/make-blueprint-telegram-siud.json`
(Make › Create a new scenario › ⋯ › **Import Blueprint**), ואז לחבר את
החשבונות והמפתחות. המבנה:

| # | מודול | תפקיד |
|---|-------|-------|
| 1 | **Telegram Bot › Watch Updates** | טריגר: הודעה חדשה לבוט |
| 2 | **Telegram Bot › Download a File** | הורדת התמונה (`message.photo[].file_id`) |
| 3 | **OCR/Vision** | שליחת התמונה + prompt, קבלת JSON עם השדות |
| 4 | **Tools › Parse JSON** | הפיכת פלט ה‑AI ל‑bundle עם שדות |
| 5 | **HTTP › Make a request** | `POST` ל‑`generate-siud`, גוף JSON עם השדות |
| 6 | **Tools › Parse JSON** | קריאת `filename` + `base64` מהתשובה |
| 7 | **Telegram Bot › Send a Document** | שליחת הקובץ חזרה ללקוח |
| 8 | *(אופציונלי)* **Supabase › Upload** | שמירת הקובץ ב‑bucket `documents` |

### ה‑prompt לחילוץ (שלב 3)

יש להנחות את המודל להחזיר **אך ורק** JSON תקין. דוגמה:

```
אתה מחלץ נתונים מצילום של דרכון או תעודת זהות ישראלית.
החזר אך ורק אובייקט JSON (ללא טקסט נוסף) עם המפתחות הבאים.
אם שדה חסר, החזר מחרוזת ריקה.

{
  "id": "מספר תעודת הזהות, 9 ספרות",
  "lastNameLatin": "שם משפחה באותיות לטיניות",
  "firstNameLatin": "שם פרטי באותיות לטיניות",
  "lastNameHebrew": "שם משפחה בעברית",
  "firstNameHebrew": "שם פרטי בעברית",
  "birthDate": "תאריך לידה בפורמט YYYYMMDD",
  "city": "עיר מגורים",
  "street": "רחוב",
  "house": "מספר בית",
  "phone": "מספר טלפון אם מופיע"
}
```

### גוף הבקשה ל‑`generate-siud` (שלב 5)

```json
{
  "id": "{{3.id}}",
  "lastNameLatin": "{{3.lastNameLatin}}",
  "firstNameLatin": "{{3.firstNameLatin}}",
  "lastNameHebrew": "{{3.lastNameHebrew}}",
  "firstNameHebrew": "{{3.firstNameHebrew}}",
  "birthDate": "{{3.birthDate}}",
  "city": "{{3.city}}",
  "street": "{{3.street}}",
  "house": "{{3.house}}",
  "phone": "{{3.phone}}"
}
```

### שליחת הקובץ בטלגרם (שלב 7)

מודול *Send a Document* מקבל קובץ בינארי. ממירים את ה‑`base64` שהתקבל
לקובץ באמצעות הפונקציה `toBinary(base64(...))` של Make:

- **File name:** `{{6.filename}}`
- **Data:** `{{toBinary(6.base64; "base64")}}`

לחלופין אפשר לקרוא ל‑`generate-siud?raw=1` ב‑HTTP (שלב 5) ולקבל ישירות את
הקובץ הבינארי — אז אין צורך בהמרה, מעבירים את גוף התשובה כ‑Data.

## הערות ואבטחה

- **דיוק ה‑OCR** — כדאי להוסיף שלב אישור אנושי לפני הגשה רשמית לביטוח לאומי;
  שגיאת ספרה בת"ז או בתאריך תיפסל.
- **פרטיות** — מסמכי זהות הם מידע רגיש. הגבילו את הבוט למשתמשים מורשים,
  ואל תשמרו תמונות מעבר לנדרש.
- **שדות אטומים** — קודים פנימיים של ביטוח לאומי (`90`, `FA`, מספרי תיק וכו')
  נשמרים כרגע מברירת המחדל של הדוגמה. לכשיתקבל המפרט הרשמי — עדכנו את
  `src/lib/bituachSiudFile.js`. ראו `docs/siud-file-format.md`.
```
