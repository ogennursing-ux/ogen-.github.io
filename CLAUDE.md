# ניהול בקליק — תיק עובד זר

## סקירה כוללת

**ניהול בקליק** היא מערכת ניהול עובדים זרים שנועדה לעובדי טיפול (מעסיקה לעובדי טיפול וטיולים). המערכת מתחלקת לשלושה אתרים:

1. **TIK (Office System)** — `tik.html` — לוח בקרה למנהלי משרד
2. **Signing App** — `index.html` — חתימה דיגיטלית על חוזים
3. **Worker Portal** — `worker.html` — פורטל לעובדים
4. **Forms Admin** — `forms.html` — ניהול טפסי העברה

### מבנה הכתובת

- **Repository**: `ogennursing-ux/ogen-.github.io`
- **GitHub Pages**: `https://ogennursing-ux.github.io/ogen-.github.io/`
- **TIK**: `https://ogennursing-ux.github.io/ogen-.github.io/tik.html`

---

## שלוש היכולות ש-AI שנוספו

### 1. **בדיקת איכות מידע** (`src/dataQuality.js` + `src/QualityDesk.jsx`)

**מטרה**: סריקה אוטומטית של כל קבצי העובדים לבעיות נתונים.

**וולידציות**:
- ✅ תעודת הזהות לא חוקית (checksum מאלגוריתם ישראלי)
- ✅ תאריכי התחלה/סיום מדורגים בצורה שגויה
- ✅ גיל בלתי אפשרי (תאריך לידה)
- ✅ דרכונים כפולים
- ✅ שדות חיוניים חסרים בהעסקה פעילה

**קבצים**:
- `src/dataQuality.js` — פונקציה `computeIssues()` ובדיקת תעודה
- `src/QualityDesk.jsx` — רכיב ממשק משתמש (מסלול `#quality`)

**סטטוס**: ✅ שולח וימושי בפרודקשן

---

### 2. **קלט קוליי** (`src/MicButton.jsx`)

**מטרה**: שקול עברית בתיבות טקסט דרך Web Speech API.

**פיצ'רים**:
- 🎤 כפתור עברי + Hebrew transcription (he-IL)
- Graceful degradation — אם הדפדפן לא תומך, הכפתור לא מופיע
- התאמה אוטומטית של טקסט לשדות הקלט

**שימושים**:
- `src/AssistantDesk.jsx` — ליד שדה השאלה
- `src/AiDraftModal.jsx` — ליד תיבת ההנחיות

**סטטוס**: ✅ שולח וימושי בפרודקשן

---

### 3. **הוספת מסמכים אוטומטית** (`src/autoFile.js` + `src/AutoFileDesk.jsx`)

**מטרה**: סריקת מסמכים (דרכון, אישור, היתר), זיהוי סוג מסמך, והשמת העובד האוטומטית.

**תהליך**:
1. גרור ושחרר תמונה (JPG/PNG בלבד, לא PDF)
2. Gemini מנתח את המסמך ומהיר דרכון + תאריך תוקף
3. נורמליזציה של מספר דרכון וחיפוש עובד
4. בחירה ידנית של הקובץ + סוג המסמך
5. העלאה ל-Supabase + רישום בהיסטוריית המסמכים

**קבצים**:
- `src/autoFile.js` — `analyzeDocument()` + `fileDocument()` + `extractDocument()`
- `src/AutoFileDesk.jsx` — ממשק משתמש עם כרטיסיות בחינה (מסלול `#autofile`)

**סטטוס**: ✅ שולח וימושי בפרודקשן

---

## החלפה מ"מערכת רישום" ל"ניהול בקליק"

### לוגו ומותג

**משתנה**: 
- הכותרת "מערכת הרישום" → "ניהול בקליק" (cloud + hand + yellow glow + blue text)
- סמל בלבד (⚓) → לוגו מלא עם טקסט

**קבצים**:
- `public/nihul-belick.png` — הלוגו (גוזר ל-1230×358px כדי להיקרא בברור בגודל קטן)
- `src/BrandBar.jsx` — סרגל עליון דביק (66px גובה) עם לוגו, gradient אפל, גבול זהב
- `src/RegistryApp.jsx` — לוגו בתוך כפתור ה-registry (48px גובה, במקום טקסט "מערכת רישום")
- `src/index.css` — עיצוב `.brandbar` + `.rg-logo`

**שינויים בניתוב**:
- `src/tik-main.jsx` + `src/main.jsx` (workspace/1212) — `Shell` function מדלג על `BrandBar` עבור `chat` ו-`registry` routes

**סטטוס**: ✅ שולח וימושי בפרודקשן

---

## קבצים קריטיים

### Entry Points
- `tik.html` — מחודש → TIK (office system)
- `src/tik-main.jsx` — ניתוב וקומפוזיציה (chat/board/registry/report/invoices/manot/assistant/templates/quality/autofile)

### רכיבים עיקריים
- `src/TikApp.jsx` — לוח בקרה ראשי
- `src/BrandBar.jsx` — סרגל עליון עם לוגו
- `src/RegistryApp.jsx` — ניהול בסיס נתונים של עובדים
- `src/CasesBoard.jsx` — לוח בקרה של מקרים פעילים
- `src/QualityDesk.jsx` — בדיקות איכות + דיווח בעיות
- `src/AutoFileDesk.jsx` — הוספת מסמכים אוטומטית
- `src/MicButton.jsx` — כפתור שקלט קוליי

### ספריות חשובות
- `src/dataQuality.js` — ולידציות + `computeIssues()`
- `src/autoFile.js` — ניתוח + התאמת מסמכים
- `src/lib/config.js` — מפתחות API (Supabase, Gemini, Groq)
- `src/lib/workerPortal.js` — פונקציות משותפות (עבור mirror ל-ogen portal)

### סגנונות
- `src/index.css` — סגנונות גלובליים (brandbar, רישום, צבעים)

---

## סנכרון דו-מאגר

המערכת כוללת שתי repositories:
- **1212** (workspace) — מערכת המשרד הראשית
- **ogen-.github.io** — mirror מציבור + GitHub Pages

**תהליך סנכרון**:
```bash
# בעת שינוי ב-1212/src:
# 1. ערוך את הקובץ ב-1212/src
# 2. העתק אל ogen-.github.io/src
# (או אם צריך, בצע sed להחלפת imports: 
#    from './config.js' → from '../lib/workerPortal.js')
# 3. git commit ו-push לשניהם
```

---

## הרצה מקומית

```bash
cd /home/user/ogen-.github.io
npm install
npm run dev      # פיתוח (http://localhost:5173/tik.html)
npm run build    # בנייה לפרודקשן (dist/)
```

---

## פריסה

GitHub Pages משודרג אוטומטית מ-`main`:
1. `git push` ל-`main`
2. GitHub Actions בונה `npm run build`
3. `dist/` מתפרסם ל-https://ogennursing-ux.github.io/ogen-.github.io/

**Branch לעבודה**: `claude/new-document-system-ru1jp6` (ו/או branches אחרות כנדרש)

---

## תצורה ושדרוגים משנים

### עמודי ניתוב TIK
- `/tik.html#` — בדרך כלל TikApp (לוח בקרה)
- `/tik.html#chat` — צ'אט ראשוני (ללא תחברות)
- `/tik.html#board` — לוח בקרה של מקרים
- `/tik.html#registry` — ניהול עובדים
- `/tik.html#quality` — בדיקות איכות
- `/tik.html#autofile` — הוספת מסמכים
- `/tik.html#report/<key>` — דוח בכרטיסיה נפרדת
- `/tik.html#invoices` — חשבוניות ותשובות
- `/tik.html#manot` — משימות מנהל
- `/tik.html#assistant` — כלי עזר AI
- `/tik.html#templates` — תבניות חוזים
- `/tik.html#autofile` — קלט דוקומנטים אוטומטי

### משתנים סביבה חיוניים (`src/lib/config.js`)
```js
SUPABASE_URL: '...'
SUPABASE_KEY: '...'
GEMINI_KEY: '...' (עבור סריקת מסמכים)
GROQ_KEY: '...' (עבור עיבוד ML)
```

---

## היישומות הנוכחיות והתיקיות

### שגיאות שתוקנו
1. **Mismatch בחזר extractDocument()**: `{patch, raw}` במקום שדות שטוחים
   - ✅ תוקן: `const fields = { ...(res.raw || {}), ...(res.patch || {}) }`

2. **תמיכה בסוג קובץ**: PDF לא תומך ב-extractDocument() (רק תמונות)
   - ✅ תוקן: `accept="image/jpeg,image/png"` + הודעה

3. **קריאות לוגו**: תמונה קטנה הראתה רק כחול
   - ✅ תוקן: גזוז PNG מ-1536×1024 ל-1230×358 (tight to content)

4. **שכיפול ברנדיוג**: רישום היה מראה ברנד בר + לוגו בראש
   - ✅ תוקן: דילוג על BrandBar כאשר `at === 'registry'`

---

## מה עוד?

- **Push**: `git push -u origin <branch-name>`
- **Deploy**: GitHub Pages משודרג אוטומטית מ-`main`
- **Documentation**: ראה `GAPS.md` ו-`NEEDS.md` לשיפורים עתידיים

---

**עדכון אחרון**: 2026-08-06 (לוגו וא"י + שלוש יכולות AI)
