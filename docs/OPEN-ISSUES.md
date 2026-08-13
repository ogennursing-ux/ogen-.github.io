# בעיות פתוחות

מצב נכון ל-2026-08-13. כל פריט אומת מול הקוד או מול GitHub Actions.

---

## 🔴 P0 — פרודקשן

### 1. האתר לא התעדכן מאז 6 באוגוסט 2026

שלוש ריצות ה-deploy האחרונות:

| תאריך | קומיט | ענף | תוצאה |
|---|---|---|---|
| 2026-08-11 | `b3b320b` "Restore CSS lost to a stale-base regression in c4bdc392" | `claude/laughing-babbage-n8phwv` | ❌ נכשל |
| 2026-08-06 17:18 | `a96e047` "Fix signing hang: give the IP lookup a 4s timeout" | `main` | ❌ נכשל |
| 2026-08-06 07:02 | `eeec040` "Crop the logo…" | `main` | ✅ הצליח |

**הגרסה החיה היא `eeec040`.** שני תיקונים אחריה לא באוויר, כולל תיקון לתקיעה
בזרימת החתימה — באג שמשתמשים חווים.

בשתי הריצות שנכשלו שלב ה-build עבר ושלב ה-deploy נפל. הסימן מרמז על דחייה של
סביבת `github-pages` (branch protection), אבל **הסיבה לא אומתה** — צריך לפתוח
את הלוגים.

### 2. רגרסיית CSS שנוצרה בקומיט `c4bdc39`

הקומיט `c4bdc39` ("AI: data-quality checker") מחק **278 שורות** מ-`src/index.css`
והוסיף 53 — נטו **-225**. הקובץ ירד מ-3,447 ל-3,222 שורות. זה קומיט שאמור היה
רק להוסיף מסך; הוא נבנה כנראה על בסיס ישן (stale base) ודרס סגנונות קיימים.

התיקון נכתב בענף `claude/laughing-babbage-n8phwv` ("Restore CSS lost to a
stale-base regression in c4bdc392") — **ופריסתו נכשלה**. כרגע גם השבירה חיה
וגם התיקון לא.

היום הקובץ עומד על 3,257 שורות, כלומר עדיין ~190 שורות פחות מלפני הרגרסיה.

### 3. הענף שמתועד לעבודה לא מפרסם

`deploy.yml` מופעל רק על `main` ועל `claude/laughing-babbage-n8phwv`. ענף עבודה
אחר יכול להיות דחוף בלי שאף ריצה תתחיל ובלי שום סימן שמשהו לא עלה.

בנוסף: `claude/laughing-babbage-n8phwv` הוא ענף אישי שנשאר קבוע ב-triggers, כך
שכל דחיפה אליו מנסה לדרוס את הפרודקשן. כדאי להסיר אותו.

---

## 🔴 P0 — אבטחה

### 4. RLS פתוח לחלוטין על טבלה עם מסמכי זיהוי

`supabase/schema.sql` מפעיל RLS על `agent_submissions` ואז נותן ל-anon:

```sql
create policy … for select using (true);
create policy … for insert with check (true);
create policy … for update using (true) with check (true);
```

לפי ההערה בסכמה עצמה, `data` מכיל "fields, files (base64), transcript" —
דרכונים סרוקים, תעודות זהות, מסמכי הגירה.

המפתח האנונימי פומבי מעצם הגדרתו ומוטמע ב-bundle. השילוב אומר ש**כל מי שיש לו
את הכתובת יכול לקרוא ולשנות כל רשומה**.

ההערה בסכמה מסבירה שהקישור "מוגן בכך שאינו ניתן לניחוש" — הנמקה שהייתה סבירה
כשהטבלה שימשה רק כטופס קליטה. היום אותה טבלה מחזיקה גם את הגדרות המשרד, את
תיבת התיקים, ואת מסמכי המס.

### 5. אימות בצד לקוח בלבד

`src/tik/officeAuth.js` — קבוע `PASS` מוטמע, מושווה מול שני שמות משתמש, ונשמר
כ-`localStorage['tik_auth'] === '1'`. אין שום בדיקת שרת. הקבוע נשלח ב-bundle
הפומבי וניתן לקריאה מ-devtools.

`src/lib/workerPortal.js` — `WORKER_ACCESS_CODE` באותו אופן.

"מי מבצע את הפעולה" הוא `localStorage['ogen_me']` (ברירת מחדל `'משרד'`) — וזו
המחרוזת שנכתבת ליומן הביקורת של מסמכי המס כ-`issuedBy`. כלומר **שרשרת הראיות
החוקית מיוחסת למחרוזת שהמשתמש יכול לערוך**.

### 6. דלי אחסון ציבורי

`signedPublicUrl()` / `signedPartPublicUrl()` ב-`src/lib/config.js` בונים
כתובות `…/storage/v1/object/public/documents/signed/<uuid>.pdf`. חוזים חתומים
מוגנים רק בכך שה-UUID אינו ניתן לניחוש.

---

## 🟠 P1 — נכונות סטטוטורית

### 7. רוחבי השדות של מנות אינם מכוילים

`src/tik/manot.js` מצהיר `calibrated: false` והערה מפורשת:

> The exact column offsets below are PROVISIONAL … Until then, `MANOT.calibrated`
> stays false and the UI warns before use.

**אין לשדר קובץ מנות לרשות האוכלוסין לפני כיול מול דוגמה אמיתית.** ראה `NEEDS.md`.

### 8. חסר אינדקס ייחודי למספור מסמכי מס

`invoices.js` ממספר מסמכים בלולאת "קרא מקסימום → +1 → הוסף, ובשגיאת כפילות
טפס מחדש" (עד 25 ניסיונות). הלולאה נכונה **רק אם קיים אינדקס ייחודי** — והוא
אינו מוגדר ב-`schema.sql`. בלעדיו שתי הנפקות במקביל יכולות לקבל אותו מספר,
וזו הפרה של הוראות ניהול פנקסים.

⚠️ `docType` ו-`number` **אינן עמודות** — הן בתוך `data` jsonb. לכן נדרש
אינדקס ביטוי חלקי:

```sql
create unique index if not exists taxdoc_number_uniq
  on public.agent_submissions ((data->>'docType'), (data->>'number'))
  where kind = 'taxdoc';
```

אותה צורת מרוץ קיימת גם ב-`getOrAssignCaseNumber()` שב-`caseDetail.js`.

### 9. `activePlacements()` לא תואם לאוצר המילים

הפילטר ב-`registry.js` בודק `workerStatus` מול הרשימה
`['לא מועסק', 'עזב/ה את הארץ']`, אבל אוצר הסטטוסים המלא מונה 28 ערכים. סטטוס
"לא פעיל" אחר ייספר כהשמה פעילה ויופיע בדוחות ובחישובי ביקורים.

### 10. ייצוא BKM בקידוד שגוי

`bkmExport.js` כותב UTF-8 עם BOM; המפרט של רשות המסים מבקש CP1255. מסומן בקוד
כפריט לאישור רו״ח.

---

## 🟡 P2 — חוב טכני

| # | פריט |
|---|---|
| 11 | אין שום תשתית בדיקות — לא playwright, לא vitest, לא eslint, לא `test` script |
| 12 | מפתח Supabase משוכפל ב-**17 קבצים** (14 ב-`src/tik/`, `src/lib/config.js`, `supabase/schema.sql`, `.github/workflows/keepalive.yml`); רוטציה = עריכה של כולם. `grep -rl dhrctqjxbdlwfxabinbr src supabase .github` |
| 13 | `pdf.worker.js` ו-`polyfills.js` קיימים בשני עותקים זהים (`src/lib/`, `src/tik/`) |
| 14 | טבלאות `sign_requests` ו-`templates` נדרשות בקוד אך אינן מוגדרות ב-`schema.sql` |
| 15 | קבצים בינאריים כבדים ב-git: `contract-template.pdf` 8.2MB, `payment-guide.pdf` 1.8MB. אין LFS |
| 16 | `manifest.webmanifest` מקושר רק מ-`index.html`; שלושת האייקונים מצביעים לאותו קובץ. ל-`tik.html` אין manifest ואין favicon |
| 17 | מנגנון הריענון האוטומטי קיים רק ב-`index.html` — משתמשי `tik.html` יכולים להריץ JS ישן ללא הגבלה |
| 18 | Google Fonts היא תלות חיצונית קשיחה בכל ארבעת קבצי ה-HTML, ללא גיבוי מקומי |
| 19 | `.gitignore` מתייחס ל-`.env.example` שלא קיים, ושום קוד לא קורא משתני סביבה |
| 20 | כל התיעוד בעברית בלבד; מפתח שאינו קורא עברית חסום מהצעד הראשון |

---

## מה תוקן בסבב התיעוד הזה

`CLAUDE.md` ו-`PROJECT-HISTORY.md` הכילו טענות שגויות שתוקנו או הוסרו:

- **טענות בדיקה מפוברקות** — "Playwright Tests (10 runs clean)", "100 בדיקות",
  "נבדק ב-Chrome/Firefox/Safari". אין ולא הייתה תשתית בדיקות במאגר. הוסרו.
- **11 נתיבי קבצים שגויים** — `src/X.jsx` במקום `src/tik/X.jsx`. תוקנו.
- **משתני סביבה שלא קיימים** — `SUPABASE_KEY`, `GEMINI_KEY`, `GROQ_KEY`
  כביכול ב-`config.js`. תוקן.
- **"לא בנינו cloud sync"** — `cloudBackup.js` הוא בדיוק זה. תוקן.
- **"פורטל לעובדים"** ל-`worker.html` — הוא פורטל עו״ס. תוקן.
- **"7 קומיטים בענף"** — בפועל 2 לפני `main`. תוקן.
- **מאגר "1212" וזרימת סנכרון** — אינו קיים בסביבה. הוסר.
- **"🟢 הכל עובד בפרודקשן"** — לא נבדק, ובפועל שגוי (ראה §1). הוסר.
