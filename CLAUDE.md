# ניהול בקליק — מדריך המערכת

מאגר אחד שמכיל **ארבע אפליקציות ווב** לסוכנות סיעוד המעסיקה עובדים זרים:
תיקי עובדים ומטופלים, חוזים וחתימה דיגיטלית, חשבוניות, ודיווחים סטטוטוריים
לרשויות המדינה.

> **קרא קודם**: [`docs/OPEN-ISSUES.md`](docs/OPEN-ISSUES.md) — יש בעיות פתוחות
> בפרודקשן ובאבטחה שצריך להכיר לפני שנוגעים במערכת.

---

## מפת התיעוד

| מסמך | מה יש בו |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | התקנה, הרצה מקומית, פריסה, קונפיגורציה |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | ארבע האפליקציות, שמונה תת-המערכות, מפת הקבצים |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | מבנה הנתונים, אוצרות המילים, מיזוג ודה-דופליקציה |
| [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md) | ביקורים, פעימות תשלום, חידושים, מחזור חיי תיק |
| [`docs/FORMATS.md`](docs/FORMATS.md) | מנות, דוחות משרד הפנים, חשבוניות, ייצוא לרו״ח |
| [`docs/PDF-PIPELINE.md`](docs/PDF-PIPELINE.md) | יצירת PDF, עברית כתמונה, מיקום שדות, חוזים |
| [`docs/EXTERNAL-SYSTEMS.md`](docs/EXTERNAL-SYSTEMS.md) | Supabase, Gemini/Groq, Edge Functions, אימות |
| [`docs/OPEN-ISSUES.md`](docs/OPEN-ISSUES.md) | בעיות ידועות — פרודקשן, אבטחה, חוב טכני |
| `INVOICING.md` | כוונת הציות של מודול החשבוניות (מסמך קיים) |
| `NEEDS.md` | חסמים שתלויים בלקוח (מסמך קיים) |
| `GAPS.md` | מעקב פערים ומשימות (מסמך קיים) |
| `DESKTOP.md` | תוכנית אפליקציית שולחן עתידית — מוקפא |
| `PROJECT-HISTORY.md` | יומן שינויים של סבב עבודה אחד |

---

## ארבע האפליקציות

מוגדרות כארבע נקודות כניסה נפרדות ב-`vite.config.js`:

| קובץ | Entry | מה זה |
|---|---|---|
| `tik.html` | `src/tik-main.jsx` | **מערכת המשרד** — הליבה. תיקים, חוזים, דוחות, חשבוניות |
| `index.html` | `src/main.jsx` | **קליק חתימה** — חתימה דיגיטלית על PDF, לצד הלקוח |
| `worker.html` | `src/worker-main.jsx` | **פורטל העובד/ת הסוציאלי/ת** — רשימת ביקורים וטפסים |
| `forms.html` | `src/forms-main.jsx` | ניהול טפסים לעו״ס |

⚠️ `worker.html` הוא פורטל **עובדים סוציאליים**, לא עובדים זרים.

**כתובת חיה**: `https://ogennursing-ux.github.io/ogen-.github.io/` — המשרד ב-`/tik.html`.

---

## מסלולי מערכת המשרד

ניתוב לפי hash, בפונקציה `pick()` ב-`src/tik-main.jsx`:

| מסלול | רכיב | הערה |
|---|---|---|
| *(ריק)* | `TikApp.jsx` | מסך הבית — ארון התיקים |
| `#board` | `CasesBoard.jsx` | חדר בקרה לפי שלב |
| `#registry` | `RegistryApp.jsx` | מרשם: משפחות, עובדים, חידושים |
| `#chat` | `IntakeChat.jsx` | צ'אט קליטה ציבורי — **ללא התחברות** |
| `#report/<key>` | `ReportPage.jsx` | דוח בודד בלשונית משלו |
| `#invoices` | `Invoicing.jsx` | קבלות וחשבוניות |
| `#manot` | `ManotDesk.jsx` | שידור לרשות האוכלוסין |
| `#assistant` | `AssistantDesk.jsx` | עוזר AI |
| `#templates` | `ContractTemplates.jsx` | תבניות חוזה |
| `#quality` | `QualityDesk.jsx` | בדיקת תקינות נתונים |
| `#autofile` | `AutoFileDesk.jsx` | תיוק מסמכים אוטומטי |
| `#signfields` | `SignFields.jsx` | מיקום שדות חתימה על חבילת ההשמה |

`BrandBar` מוצג בכל המסכים **חוץ מ**-`#chat` ו-`#registry` (למרשם יש כותרת
משלו עם הלוגו).

---

## איפה הקוד

```
src/
├── tik/          מערכת המשרד — 63 קבצים, הליבה של המוצר
├── components/   אפליקציית החתימה — 27 קבצים
├── lib/          משותף: Supabase, PDF, טפסים, i18n — 20 קבצים
├── worker/       פורטל העו״ס — WorkerApp.jsx
└── index.css     גיליון סגנונות יחיד לכל האפליקציות
```

⚠️ קבצי המשרד נמצאים תחת **`src/tik/`**, לא `src/`.

פירוט מלא של כל קובץ: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## קונפיגורציה — בקצרה

אין `.env` ואין `import.meta.env` בכלל. שלוש שכבות:

1. **Supabase** — כתובת ומפתח anon **מוטמעים בקוד**, ומשוכפלים בכ-12 קבצים.
   המקור הרשמי: `src/lib/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BUCKET`).
2. **מפתחות AI** — לא במאגר. נשמרים ב-`localStorage` לכל דפדפן
   (`tik_gemini_key`, `tik_groq_key`) דרך `src/tik/gemini.js`, ומוזנים במסך ההגדרות.
3. **הגדרות משרד** — שורת `config` יחידה ב-Supabase (`src/tik/officeConfig.js`).

פירוט: [`docs/SETUP.md`](docs/SETUP.md) · [`docs/EXTERNAL-SYSTEMS.md`](docs/EXTERNAL-SYSTEMS.md).

---

## הרצה ופריסה

```bash
npm install
npm run dev      # http://localhost:5173/tik.html
npm run build    # → dist/
```

**אין בדיקות אוטומטיות במאגר** — אין playwright/vitest/jest, אין eslint,
ואין סקריפט `test`. האימות היחיד הוא `npm run build` ולחיצות ידניות.

**פריסה**: `.github/workflows/deploy.yml` בונה ומפרסם ל-GitHub Pages, ורץ רק
על דחיפה ל-`main` (ולענף `claude/laughing-babbage-n8phwv`). **דחיפה לענף עבודה
אחר לא מפרסמת כלום.** `dist/` אינו נשמר ב-git.

---

## כללי עבודה

- **עברית RTL** בכל הממשקים; הערות הקוד באנגלית.
- **פונטים מ-Google Fonts** — תלות חיצונית קשיחה בכל ארבעת קבצי ה-HTML.
- **`src/lib/polyfills.js` ו-`src/tik/polyfills.js`** — עותקים זהים של פוליפיל
  `Map.getOrInsertComputed` ש-pdf.js v6 תלוי בו. הסרה שוברת כל עיבוד PDF בשקט.
- **`pdf.worker.js` קיים פעמיים** (`src/lib/`, `src/tik/`). עריכה של אחד בלבד
  יוצרת באג שמופיע רק בחלק מהאפליקציות.
- שינוי במפתח Supabase דורש עריכה של כל ~12 הקבצים שמכילים אותו.
