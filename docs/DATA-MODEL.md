# מודל הנתונים

זהו החלק שאי אפשר לנחש. אין כאן סכמה יחסית — כמעט כל המערכת יושבת על
**טבלה אחת**.

---

## 1. הטבלה היחידה

```sql
create table public.agent_submissions (
  id         uuid primary key default gen_random_uuid(),
  kind       text,
  source     text,
  status     text default 'new',
  data       jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
```

זהו. אין מפתחות זרים, אין אילוצים, אין טבלת עובד, אין טבלת השמה, אין טבלת
ביקור, אין טבלת תשלום. הכל הוא שורה כאן, מובחנת לפי `kind`.

### ערכי `kind` בשימוש

| `kind` | מה זה |
|---|---|
| `family` | **תיק** — הישות המרכזית. מכיל גם את פרטי המשפחה/מטופל וגם את פרטי העובד/ת |
| `lead` | ליד שטרם הפך לתיק |
| `worker` | רשומת עובד/ת עצמאית (נדיר; רוב הנתונים בתוך `family`) |
| `config` | הגדרות משרד **וגם** תבניות חוזה — מובחנים ב-`data.configType === 'contract_template'` |
| `taxdoc` | מסמך מס שהונפק (קבלה / חשבונית / זיכוי) |
| `taxdoc_event` | אירוע ביומן הביקורת של מסמך מס |
| `acct_export` | אצוות ייצוא לרו״ח |
| `backup` | גיבוי ענן של ארון התיקים |

### שורות בעלות UUID קבוע

- הגדרות המשרד: `00000000-0000-4000-8000-0a9e0c0f0001` (`CONFIG_ID` ב-`officeConfig.js`)
- גיבוי הענן: `…0a9e0c10c000` (`cloudBackup.js`)

### מה זו "השמה"

**השמה אינה רשומה.** היא הנוכחות המשותפת של שדות עובד ושדות משפחה בתוך
`data.fields` של אותו תיק. ביקורים, תשלומים ומסמכים הם אובייקטים מקוננים:

```
data.fields.socialVisits        ביקורי עו״ס שבוצעו
data.fields.payments            תשלומי לקוח
data.fields.workerPaymentsDone  אילו פעימות שולמו (בוליאני לכל מפתח)
data.fields.quartersFiled       אילו רבעונים דווחו
```

**המשמעות לשחזור**: כל שאילתה שנראית כמו join מתבצעת בזיכרון בדפדפן, אחרי
שליפת כל התיקים.

---

## 2. שלוש אוצרות מילים לאותו עובד

אותו עובד קיים בשלושה מילונים שאינם מסכימים ביניהם:

| מקור | תפקיד | דוגמאות |
|---|---|---|
| `src/tik/registrySchema.js` | המילון הרשמי לממשק. 14 מקטעי משפחה + 10 מקטעי עובד, ~140 + ~80 שדות | `employerName`, `city`, `assignedTo`, `caseNumber` |
| `src/tik/workerFilesApi.js` | `emptyWorker()` / `emptyFamily()` — משמש את IndexedDB ואת כל מחוללי ה-PDF | `fullName`, `addrCity`, `coordinator`, `clientNo` |
| מפתחות הצ'אט/AI | מה ש-Gemini מחזיר | `FIELD_KEYS` ב-`gemini.js` |

**הגשר** הוא `recordsFromChat()` ב-`src/tik/chatRecords.js`, וכללי הקדימות שלו
נושאים משקל: מפתחות ייעודיים לעובד (`workerDob`, `workerGender`,
`workerMaritalStatus`, `workerEmail`, `workerPhone`) **גוברים** על מפתחות
המטופל המשותפים (`dob`, `gender`, `email`, `contactPhone`) — כי בעבר השניים
חלקו שדה אחד.

### מבנה שדה ב-`registrySchema.js`

```js
{ key, label, type, options, width, ltr, readOnly, computed, fallback }
```

### אוצרות מילים סגורים שקיימים רק כאן

- 28 סטטוסי עובד
- 12 חברות ביטוח
- 7 סטטוסי הפניה
- 5 סוגי השמה
- 8 סיבות סיום

### שדות מחושבים (`computeValue()`)

| שדה | חישוב |
|---|---|
| `ageFromDob` | גיל המטופל מתאריך לידה |
| `workerAgeFromDob` | גיל העובד/ת |
| `policyTotal` | ימים × ₪ ליום |
| `stayFromArrival` | משך שהייה מתאריך הגעה |

### `HIDDEN_WORKER` / `HIDDEN_FAMILY`

קבוצות שדות שנבחרו אחד-אחד מול הלקוח וקובעות מה מסך הרשומה מקפל כברירת מחדל.
זו החלטת מוצר, לא אופטימיזציה.

---

## 3. שני אלגוריתמי מיזוג

### `mergeHalves()` — `src/tik/agentInbox.js`

קישורי הקליטה הם ספציפיים לתפקיד, כך שתיק אחד יכול להגיע כשתי שורות שחולקות
`data.meta.linkKey`. המיזוג:

1. ממיין כך ש-`role: 'employer'` ראשון — שם המעסיק וה-ת״ז שלו גוברים
2. מכסה מעליו את שדות העובד/ת
3. נושא `signRequestId` מהחצי שיש לו אותו
4. מסמן `partial` אם אחד החצאים עדיין ב-`status: 'chat'`

### `dedupeCases()` — `src/tik/registry.js`

מקפל שורות כפולות מלאות לפי דרכון (עדיף) או ת״ז. שלושה כללי הגנה שנלמדו
מנזק אמיתי:

1. **מזהה קצר מ-5 תווים אינו זהות**
2. **מזהה מתו חוזר אינו זהות** — `000000000`, `111111111`
3. **דרכון ללא ספרות אינו דרכון**

ומעל הכל, `compatible()`: שתי שורות מתמזגות **רק אם כל מזהה שקיים בשתיהן
מסכים**. בלי זה, אותה מטפלת שהושמה אצל שתי משפחות מתמוטטת לתיק אחד.

### `ids[]` — התוצאה

תיק ממוזג נושא `ids[]` עם כל השורות שמתחתיו, וכל כתיבה מתפזרת לכולן:
`patchCaseFields`, `saveVisit`, `setWorkerPaymentDone`, `attachSigning` —
כולם רצים בלולאה על `caseObj.ids`.

---

## 4. אחסון: IndexedDB מול Supabase

| | IndexedDB | Supabase |
|---|---|---|
| שם | `ogen_worker_files` v3 | `agent_submissions` |
| מאגרים | `workers`, `families`, `files`, `contracts` | שורות לפי `kind` |
| מה יש בו | ארון התיקים המקורי + **Blobs** של סריקות | כל מערכת המשרד |
| קובץ | `src/tik/workerFilesApi.js` | `src/tik/registry.js`, `caseDetail.js` |

`files` ממופתח ב-`workerId` ומחזיק `Blob` אמיתי — שם נשמרות הסריקות הכבדות
שהיו מפוצצות מכסת localStorage.

### הגישור ביניהם

- **`cloudBackup.js`** — משכפל **רק את רשומות הליבה** (עובדים + משפחות, בלי
  blobs) לשורת `backup` בעלת UUID קבוע, בתזמון debounced לפי זיהוי שינוי.
  `restoreFromCloud()` ממזג לפי id.
- **גיבוי מלא הוא ידני** — `exportAll()` מייצר חבילת JSON
  `{app: 'ogen-tik-ovdim', version: 3}` עם כל ה-blobs כ-data URL.
  `importAll()` משחזר וממזג לפי id.
- **קבצי תיק** הולכים למקום שלישי — `caseDetail.js` מעלה לדלי `documents`
  בנתיב `cases/<caseId>/<docKey>-<uid>.<ext>` ושומר בתיק רק את הנתיב, כדי
  שרשומת תיק לא תתנפח ב-base64.

⚠️ הפיצול הזה הוא חוב מוכר. `DESKTOP.md` מתאר את איחודו העתידי.

---

## 5. נתיבים בדלי האחסון

| נתיב | תוכן |
|---|---|
| `originals/<id>.pdf` | מסמך לפני חתימה |
| `signed/<id>.pdf` | מסמך חתום |
| `signed/<id>-part<n>.pdf` | חלק מפוצל של מסמך חתום |
| `cases/<caseId>/<docKey>-<uid>.<ext>` | קובץ מצורף לתיק |

---

## 6. טבלאות שחסרות בסכמה

`supabase/schema.sql` מגדיר רק את `agent_submissions`. הקוד דורש גם:

- **`sign_requests`** — נשען עליו `src/lib/supabaseApi.js` ו-`keepalive.yml`.
  מבנה משוחזר מהשימוש:
  `(id uuid pk, title, pdf_path, signed_pdf_path, fields jsonb, signers jsonb, status, signer_email, owner_email, webhook_url, signed_at)`
- **`templates`** — `src/lib/supabaseApi.js`
- **דלי אחסון ציבורי `documents`**

מי שמריץ רק את `schema.sql` יקבל מערכת שחצי עובדת: הצ'אט כותב, אבל חתימה,
תבניות ואחסון קבצים נופלים בזמן ריצה.
