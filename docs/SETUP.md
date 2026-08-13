# התקנה, הרצה ופריסה

---

## 1. דרישות מקדימות

| | |
|---|---|
| Node.js | CI מקבע `20`. אין `.nvmrc` ואין שדה `engines` |
| npm | lockfileVersion 3 (npm 7+) |
| Docker | לא נדרש |
| `.env` | **לא קיים ולא נדרש** — אין `import.meta.env` בשום מקום בקוד |

⚠️ `.gitignore` מזכיר `!.env.example`, אבל הקובץ לא קיים ושום קוד לא קורא
משתני סביבה. השורה הזו מטעה.

---

## 2. הרצה מקומית

```bash
git clone https://github.com/ogennursing-ux/ogen-.github.io
cd ogen-.github.io
npm install
npm run dev
```

### ארבע הכתובות המקומיות

| כתובת | אפליקציה |
|---|---|
| `http://localhost:5173/tik.html` | **מערכת המשרד** — הליבה |
| `http://localhost:5173/` | קליק חתימה |
| `http://localhost:5173/worker.html` | פורטל העו״ס |
| `http://localhost:5173/forms.html` | ניהול טפסים |

⚠️ מי שנכנס רק ל-`/` רואה את אפליקציית החתימה, ועלול לחשוב שמערכת המשרד חסרה.

### התחברות

כל המסכים חסומים מאחורי סיסמה. הקבועים:

| אפליקציה | קובץ | קבוע |
|---|---|---|
| משרד | `src/tik/officeAuth.js` **וגם** `src/tik/TikApp.jsx` | `PASS` + `USERS` — מוגדרים פעמיים |
| חתימה | `src/components/Login.jsx` | `PASS` |
| פורטל עו״ס | `src/lib/workerPortal.js` | `WORKER_ACCESS_CODE` |

הערכים בקוד. בלי לדעת אותם אי אפשר לעבור את מסך הכניסה.

### עבודה ללא backend

```
http://localhost:5173/?mock=1
```

`src/lib/api.js` עובר ל-`mockApi` המבוסס `localStorage`.

---

## 3. בנייה

```bash
npm run build      # → dist/
npm run preview
```

`vite.config.js` מגדיר `base: './'` כדי שנתיבי הנכסים ישרדו תת-נתיב ב-Pages,
וארבע נקודות כניסה נפרדות.

### אזהרות צפויות בבנייה

- שלוש אזהרות `<script src="./open-nagish.min.js"> can't be bundled without type="module"` — ווידג'ט הנגישות ב-`public/`, במכוון לא מאוגד
- מקטעים מעל 500KB: `pdf-*.js` ~472KB, `index-*.js` ~435KB, `tik-*.js` ~411KB, ועובד pdf.js ~1.2MB

שתיהן צפויות. אין צורך לרדוף אחריהן.

---

## 4. בדיקות ולינטינג

**אין.**

`package.json` מכיל בדיוק שלושה סקריפטים: `dev`, `build`, `preview`.
ה-devDependencies הם בדיוק `@vitejs/plugin-react` ו-`vite`.

אין vitest, אין jest, אין playwright, אין eslint, אין prettier, אין tsconfig,
ואין שלב בדיקה ב-CI.

**האימות היחיד הזמין הוא `npm run build` ולחיצות ידניות.**

---

## 5. פריסה

`.github/workflows/deploy.yml`:

```
checkout → setup-node@20 → npm ci → npm run build
        → upload-pages-artifact (dist) → deploy-pages@v4
```

### מתי זה רץ

```yaml
on:
  push:
    branches: [main, claude/laughing-babbage-n8phwv]
  workflow_dispatch:
```

⚠️ **דחיפה לכל ענף אחר לא מפעילה כלום.** אין שום סימן שמשהו לא עלה.

⚠️ `claude/laughing-babbage-n8phwv` הוא ענף אישי שנשאר ב-triggers וכל דחיפה
אליו מנסה לדרוס פרודקשן.

### הכתובת החיה

המאגר הוא `ogen-.github.io` תחת `ogennursing-ux` — וזה **לא** שווה
ל-`ogennursing-ux.github.io`, ולכן זה **אתר פרויקט**:

```
https://ogennursing-ux.github.io/ogen-.github.io/
https://ogennursing-ux.github.io/ogen-.github.io/tik.html
```

אין קובץ `CNAME` — אין דומיין מותאם.

### `dist/` אינו ב-git

`git ls-files dist` מחזיר 0 קבצים. הפריסה היא דרך CI בלבד. תיקיית `dist/`
בעץ העבודה היא תוצר בנייה מקומי.

> ⚠️ **הפריסה שבורה כרגע.** ראה `docs/OPEN-ISSUES.md` §1.

---

## 6. הקמת פרויקט Supabase משלך

`supabase/schema.sql` יוצר **רק** את `agent_submissions`. נדרש גם:

1. טבלה `sign_requests` — מבנה ב-`docs/EXTERNAL-SYSTEMS.md` §1
2. טבלה `templates`
3. דלי אחסון **ציבורי** בשם `documents`
4. אינדקס ייחודי למספור מסמכי מס — **אינדקס ביטוי חלקי על jsonb**, ה-DDL ב-`docs/OPEN-ISSUES.md` §8
5. מדיניות `delete` ל-anon על `sign_requests` ו-`templates`, ומדיניות `insert`/`update` על הדלי
6. Edge Function `send-sms` + סודותיה — `supabase functions deploy send-sms`
7. Edge Function `telegram-webhook` (אופציונלי) — `supabase functions deploy telegram-webhook --no-verify-jwt`, ואז `setWebhook` מול טלגרם

לאימות שההתקנה עבדה: כפתור נתוני הדמו ב-`#registry` זורע 30 השמות
דטרמיניסטיות (`src/tik/demoData.js`, מתויגות `demo-ogen-v1` כך שהמחיקה מדויקת).

ואז לעדכן את הכתובת והמפתח **בכל 17 הקבצים** שמכילים אותם
(`grep -rl dhrctqjxbdlwfxabinbr src supabase .github`).

מי שמריץ רק את `schema.sql` יקבל מערכת שחצי עובדת: הצ'אט כותב, אבל חתימה,
תבניות ואחסון קבצים נופלים בזמן ריצה.

---

## 7. מלכודות לשים לב אליהן

| # | מלכודת |
|---|---|
| 1 | `polyfills.js` קיים פעמיים (`src/lib/`, `src/tik/`) — פוליפיל `Map.getOrInsertComputed` ש-pdf.js v6 תלוי בו. הסרה שוברת כל עיבוד PDF **בשקט** |
| 2 | `pdf.worker.js` קיים פעמיים. עריכה של אחד יוצרת באג שמופיע רק בחלק מהאפליקציות |
| 3 | Google Fonts היא תלות קשיחה בכל ארבעת ה-HTML. סביבה מנותקת = טיפוגרפיה שבורה |
| 4 | מנגנון הריענון האוטומטי קיים רק ב-`index.html`. משתמשי `tik.html` יכולים להריץ JS ישן ללא הגבלה אחרי פריסה |
| 5 | `manifest.webmanifest` מקושר רק מ-`index.html`, ושלושת האייקונים מצביעים לאותו קובץ. ל-`tik.html` אין manifest ואין favicon |
| 6 | קבצים בינאריים כבדים ב-git: `contract-template.pdf` 8.2MB, `payment-guide.pdf` 1.8MB. אין LFS — כל גרסה חדשה מוסיפה ~8MB להיסטוריה לצמיתות |
| 7 | תחת `vite dev` מנגנון הריענון לא פועל (dev מגיש `/src/main.jsx` ולא `/assets/*.js`). לא מזיק, אבל מבלבל |
