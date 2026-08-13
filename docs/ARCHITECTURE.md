# ארכיטקטורה ומפת קבצים

---

## שמונה תת-מערכות

| # | תת-מערכת | קבצים מרכזיים |
|---|---|---|
| 1 | **מרשם ורשומות** | `registry.js`, `registrySchema.js`, `caseDetail.js`, `workerFilesApi.js`, `RegistryApp.jsx`, `RecordPage.jsx` |
| 2 | **חוזים וחתימה** | `filledContract.js`, `contractPdf.js`, `contractMerge.js`, `contractOverlay.js`, `contractTemplates.js`, `placementCertificate.js`, `signingBridge.js`, `SignFields.jsx`, `PdfPlacementEditor.jsx` + כל `src/components/` |
| 3 | **דוחות** | `reports.js`, `ReportPage.jsx`, `CalendarReport.jsx` |
| 4 | **חשבוניות ומס** | `invoices.js`, `Invoicing.jsx`, `bkmExport.js`, `accountingExport.js` |
| 5 | **דיווחי רשויות** | `manot.js`, `ManotDesk.jsx`, `cp1255.js`, `interiorReport.js`, `feeReport.js` |
| 6 | **ביקורי עו״ס** | `socialWorker.js`, `SocialWorkerTab.jsx`, `visitWorklist.js`, `WorkerApp.jsx`, `homeVisitPdf.js`, `preplacementPdf.js`, `prebuiltForms.js` |
| 7 | **קליטה ותיבה** | `intakeChat.js`, `IntakeChat.jsx`, `chatI18n.js`, `chatRecords.js`, `intakeUtils.js`, `agentInbox.js` |
| 8 | **שכבת AI** | `gemini.js`, `aiChat.js`, `aiContext.js`, `aiDraft.js`, `AiBriefing.jsx`, `AiDraftModal.jsx`, `AssistantDesk.jsx`, `autoFile.js`, `AutoFileDesk.jsx` |

---

## `src/tik/` — מערכת המשרד (63 קבצים)

### רכיבי ממשק

| קובץ | שורות | מה זה |
|---|---|---|
| `TikApp.jsx` | 2750 | מסך הבית: ארון תיקי עובדים/משפחות, סריקת מסמכים, יצירת חוזים, תיבת סוכן, גיבוי ענן, הגדרות, ייצוא CSV |
| `RecordPage.jsx` | 765 | עמוד תיק מלא: מסמכים, תשלומים, ביקורים, הערות, אנשי קשר, השמות, כרטסת |
| `RegistryApp.jsx` | 689 | מרשם: חיפוש, דוח חידושים, לידים, השמות, זריעת נתוני דמו |
| `ReportPage.jsx` | 669 | מריץ דוחות (פרמטרים → תוצאות), לוח שנה, יומן טפסים דיגיטליים |
| `IntakeChat.jsx` | 486 | צ'אט קליטה ציבורי רב-לשוני, הסכמה, קופונים, תשלום, הצעת ביטוח |
| `Invoicing.jsx` | 346 | הנפקה וזיכוי של קבלות וחשבוניות, ייצוא BKM ו-406 |
| `SignFields.jsx` | 257 | מיקום שדות חתימה על חבילת 26 העמודים + הגדרת פיצול עמודים |
| `ContractTemplates.jsx` | 245 | העלאת PDF, מיקום שדות, מילוי לפי תיק, שליחה לחתימה |
| `CasesBoard.jsx` | 205 | חדר בקרה לפי שלב (חסר / מוכן / נשלח / חתום) |
| `SocialWorkerTab.jsx` | 184 | ביקורי עו״ס לפי רבעון, שמירה מרוכזת, סימון רבעון כמדווח |
| `ManotDesk.jsx` | 172 | בניית רשומת מנות + מכתב לוואי |
| `PdfPlacementEditor.jsx` | 159 | עורך גרירה/שינוי-גודל למיקום שדות מעל PDF |
| `AutoFileDesk.jsx` | 131 | תיוק מסמכים אוטומטי |
| `AssistantDesk.jsx` | 128 | עוזר AI |
| `AiDraftModal.jsx` | 114 | טיוטה עם AI + תרגום |
| `CalendarReport.jsx` | 94 | לוח חודשי: ביקורים שבוצעו, חידושים, ביקורים חסרים |
| `QualityDesk.jsx` | 87 | בדיקת תקינות נתונים |
| `AiBriefing.jsx` | 40 | תדריך יומי יזום במסך הבית |
| `MicButton.jsx` | 36 | כפתור הכתבה קולית |
| `BrandBar.jsx` | 11 | סרגל הלוגו העליון |

### לוגיקה ונתונים

| קובץ | שורות | מה זה |
|---|---|---|
| `reports.js` | 970 | קטלוג 74 הדוחות (44 מוצהרים + 30 ממפעל `statReport()`) — ראה `FORMATS.md` §7 |
| `gemini.js` | 544 | **מנוע ה-AI**: Gemini + Groq, ניהול מפתחות, `extractDocument`, `extractFamilyDocument`, `smartImport`, `toWorkerPatch` |
| `registrySchema.js` | 489 | מלאי השדות המלא: **15** מקטעי משפחה (121 שדות) + **10** מקטעי עובד (73 שדות) = 194 שדות. ערים, מדינות, מבטחים |
| `filledContract.js` | 456 | הטבעה על חבילת ההשמה בת 26 העמודים (ראה `PDF-PIPELINE.md` §3) |
| `registry.js` | 425 | שכבת נתוני המרשם: דה-דופליקציה, חיפוש, חידושים, פעימות תשלום, לידים |
| `workerFilesApi.js` | 425 | אחסון IndexedDB לארון התיקים + ייצוא/ייבוא |
| `demoData.js` | 391 | 30 השמות דטרמיניסטיות (PRNG עם זרע) מתויגות `demo-ogen-v1` כך שהמחיקה מדויקת. פרישת תאריכים מכוונת כדי שלכל דוח יהיו שורות — הדבר הקרוב ביותר ל-fixture במאגר ללא בדיקות |
| `intakeChat.js` | 372 | לוגיקת הצ'אט: שלבים, שאלות נפוצות, הסכמה, קופון, הסלמה |
| `chatI18n.js` | 323 | מחרוזות ב-10 שפות: he, en, uz, ru, ro, tl, es, hi, ne, si |
| `caseDetail.js` | 280 | שכבת נתוני התיק: מסמכים, תשלומים+מע״מ, ביקורים, הערות, כרטסת |
| `placementCertificate.js` | 247 | מכתב השמה דו-לשוני + בלוק `AGENCY` |
| `contractPdf.js` | 218 | מחולל חוזה העסקה בעברית |
| `contractMerge.js` | 204 | מיזוג תבנית .docx (`{{placeholders}}`) |
| `manot.js` | 197 | רשומת 704 תווים, קודי פעולה, מכתב לוואי |
| `invoices.js` | 196 | מסמכי מס: מספור אטומי, הקפאה, זיכוי, יומן ביקורת |
| `socialWorker.js` | 188 | כללי מקצב הביקורים, רבעונים, מועדי הגשה |
| `interiorReport.js` | 172 | דוח רבעוני למשרד הפנים — הזרקה ל-.xlsx הרשמי |
| `signingBridge.js` | 171 | גשר מהמשרד לאפליקציית החתימה |
| `accountingExport.js` | 168 | ייצוא 406, שלושה מצבים, מעקב אצוות |
| `bkmExport.js` | 139 | ייצוא מבנה אחיד לרשות המסים |
| `agenda.js` | 134 | מטלות מסך הבית. `BUCKETS` = `overdue` + `today` בלבד — המבט קדימה **הוסר לבקשת המשרד** כדי לשמור על מסך כניסה רגוע |
| `casesBoard.js` | 116 | שכבת נתוני לוח התיקים: `ESSENTIALS`, שלבים |
| `agentInbox.js` | 105 | תיבת סוכן חיצוני + `mergeHalves` |
| `contractTemplates.js` | 95 | אחסון תבניות PDF + מילוי + שליחה |
| `csvExport.js` | 90 | ייצוא CSV תואם-Excel (UTF-8 BOM). `WORKER_COLS` (35 עמודות) ו-`FAMILY_COLS` (22) לפי מפרט חילוץ של הלקוח; רכיב שלישי `'date'` מסמן פלט `DD/MM/YYYY` |
| `contractOverlay.js` | 88 | הטבעת ערכים על PDF קיים |
| `dataQuality.js` | 86 | בדיקות תקינות מבוססות חוקים |
| `feeReport.js` | 85 | דוח אגרה 306 |
| `cloudBackup.js` | 80 | מראה IndexedDB → Supabase |
| `officeConfig.js` | 75 | שורת הגדרות משותפת, `placementFields`, `pageCuts`/`downloadGroups` דרך `saveSignSetup()`. ⚠️ `patchConfig` הוא read-then-upsert **ללא בקרת מקביליות** — שתי שמירות בו-זמנית ואחת נעלמת |
| `intakeUtils.js` | 72 | העתקה, זיהוי כפילויות, קישור וואטסאפ |
| `aiContext.js` | 69 | תמונת מצב חיה שמעגנת את עוזר ה-AI |
| `aiDraft.js` | 67 | ניסוח ותרגום — `DRAFT_LANGS`, 9 שפות (רשימה שונה מזו של `chatI18n`) |
| `digitalForms.js` | 65 | יומן טפסים מ-`sign_requests`. `FORM_STATES` נגזר מספירת `signers.list[].signed`; תקרת 500 שורות |
| `aiChat.js` | 54 | צ'אט AI טקסטואלי |
| `autoFile.js` | 51 | ניתוח והתאמת מסמך לעובד |
| `pdfRender.js` | 51 | מעבד pdf.js עצמאי לעורך |
| `cp1255.js` | 36 | מקודד Windows-1255 |
| `chatRecords.js` | 35 | מיפוי שדות צ'אט → רשומות |
| `polyfills.js` | 28 | פוליפיל `Map.getOrInsertComputed` |
| `officeAuth.js` | 18 | שער התחברות |
| `recordLink.js` | 13 | `#registry/w/<id>` מול `#registry/f/<id>`. רשומה **תמיד נפתחת בלשונית חדשה** כדי שהדוח שממנו הגיעו יישאר במקומו |
| `pdf.worker.js` | 4 | נקודת כניסה לעובד pdf.js |

### נכסים — `src/tik/assets/`

| קובץ | גודל | תפקיד |
|---|---|---|
| `contract-template.pdf` | 8.1MiB | חבילת ההשמה הרשמית, 26 עמודים |
| `payment-guide.pdf` | 1.8MB | מדריך תשלום |
| `interior-quarterly-template.xlsx` | 390KB | תבנית משרד הפנים |
| `fee-quarterly-template.xlsx` | 11KB | תבנית דוח 306 |

`src/tik/dvir-logo.png` (263KB) יושב **מחוץ** ל-`assets/`, ישירות תחת `src/tik/`.

⚠️ שלוש טבלאות המלאי מכסות 112 קבצים. ארבע נקודות הכניסה —
`main.jsx`, `tik-main.jsx`, `worker-main.jsx`, `forms-main.jsx` — אינן בהן.


---

## `src/lib/` — משותף (20 קבצים)

| קובץ | שורות | מה זה |
|---|---|---|
| `i18n.js` | 371 | he/en בלבד. **המחרוזת העברית היא המפתח**; `EN` היא טבלת חיפוש; מפתח חסר נופל לעברית. `{placeholder}` + `LangContext`/`applyLang()`. מערכת המשרד אינה משתמשת בו כלל |
| `prebuiltForms.js` | 330 | טפסים ממשלתיים מוכנים (ביקור בית, טרום השמה 476) |
| `pdfUtils.js` | 251 | רינדור pdf.js + יצירת PDF חתום |
| `supabaseApi.js` | 236 | ה-backend האמיתי |
| `mockApi.js` | 197 | backend מדומה על localStorage (`?mock=1`) |
| `preplacementPdf.js` | 193 | טופס 476 בארבעה עמודים |
| `formPdf.js` | 191 | PDF להדפסה מטופס מובנה |
| `visitWorklist.js` | 160 | גשר משרד ↔ עו״ס |
| `homeVisitPdf.js` | 158 | טופס ב' ביקור בית |
| `fields.js` | 113 | מודל שדה, ברירות מחדל, תוויות, אייקונים |
| `exporters.js` | 113 | מיזוג PDF, טווחי עמודים, פיצול, CSV |
| `notify.js` | 93 | הגדרות בעלים + ממסר דוא״ל |
| `htmlPdf.js` | 85 | בלוקי HTML → PDF רב-עמודי |
| `api.js` | 69 | **בורר ה-backend** (mock מול Supabase) |
| `formSchema.js` | 69 | מודל טופס מובנה |
| `docx.js` | 63 | המרת .docx ל-PDF (mammoth) |
| `polyfills.js` | 28 | עותק של הפוליפיל |
| `config.js` | 21 | Supabase URL, מפתח anon, דלי |
| `workerPortal.js` | 13 | קוד גישה לפורטל, שם חברה, קישור |
| `pdf.worker.js` | 6 | עותק של עובד pdf.js |

---

## אפליקציית החתימה — `src/App.jsx` + `src/components/` (27 קבצים)

⚠️ `App.jsx` יושב ב-**`src/`**, לא ב-`src/components/`.

**פרק מלא: [`SIGNING-APP.md`](SIGNING-APP.md).**

| קובץ | שורות | | קובץ | שורות |
|---|---|---|---|---|
| `src/App.jsx` | 750 | | `FieldBox.jsx` | 140 |
| `StructuredFormView.jsx` | 349 | | `PdfPreview.jsx` | 127 |
| `SignaturePad.jsx` | 278 | | `SplitPicker.jsx` | 104 |
| `SignerView.jsx` | 246 | | `Settings.jsx` | 81 |
| `Dashboard.jsx` | 245 | | `Login.jsx` | 72 |
| `SignFlow.jsx` | 227 | | `EditPanel.jsx` | 67 |
| `Templates.jsx` | 173 | | `PdfPage.jsx` | 64 |
| `AllSignatures.jsx` | 168 | | `WorkerFormRouter.jsx` | 63 |
| `WorkerFormsAdmin.jsx` | 166 | | `SignerBar.jsx` | 56 |
| `FormSignerView.jsx` | 156 | | `ErrorBoundary.jsx` | 56 |
| `FormBuilder.jsx` | 141 | | `LinkCreated.jsx` | 55 |
| `Dropzone.jsx` | 52 | | `DocLoader.jsx` | 44 |
| `ToolRail.jsx` | 39 | | `Toolbar.jsx` | 28 |
| `LangToggle.jsx` | 15 | | `BrandName.jsx` | 12 |

---

## `src/worker/` — פורטל העו״ס

`WorkerApp.jsx` (330) — שער קוד גישה, רשימת ביקורים לפי דחיפות, טפסים
ממולאים מראש, סימון ביקור כבוצע.

---

## מחוץ ל-`src/`

### `public/`

| קובץ | מה זה |
|---|---|
| `legal.html` | **תנאי שימוש + פרטיות + הצהרת נגישות.** מקושר מזרימת החתימה. עריכה = שינוי תנאים משפטיים שפורסמו |
| `privacy.html` | מסמך פרטיות **נפרד ושונה** עם ח.פ וכתובת. מקושר ממסכי המשרד והצ'אט |
| `manifest.webmanifest` | PWA — מקושר רק מ-`index.html` |
| `open-nagish.min.js` | ווידג'ט נגישות של צד שלישי |
| `open-nagish-LICENSE.txt` | רישיון MIT של הווידג'ט |
| `nihul-belick.png` | לוגו ניהול בקליק (1230×358) |
| `klik-logo.png`, `klik-icon.png` | מיתוג קליק חתימה |
| `dvir.png` | תג קרדיט "דביר מערכות" |

⚠️ `public/dvir.png` (52KB) ו-`src/tik/dvir-logo.png` (263KB) הם **שני עותקים
של אותו נכס בשני מנגנונים** — הראשון כ-`<img>` בתוך שלושה קבצי HTML,
השני מיובא ב-JSX ב-`TikApp.jsx`.

### שאר המאגר

| נתיב | מה זה |
|---|---|
| `supabase/schema.sql` | יוצר רק את `agent_submissions`. ⚠️ ההערות בו **מיושנות** — מונות 3 ערכי `kind` במקום 8. אין אינדקס על `kind` למרות שכל שאילתה מסננת לפיו |
| `supabase/functions/send-sms/` | Edge Function — Twilio או שער ישראלי |
| `supabase/functions/telegram-webhook/` | Edge Function — גשר טלגרם |
| `.github/workflows/deploy.yml` | בנייה ופרסום ל-Pages. `environment: github-pages`, `concurrency: pages` עם `cancel-in-progress` — דחיפה שנייה מבטלת פריסה שרצה |
| `.github/workflows/keepalive.yml` | ping ל-Supabase כל יומיים. ⚠️ GitHub משבית workflows מתוזמנים אחרי 60 יום ללא פעילות במאגר |
| `docs/email-relay.gs` | Google Apps Script לשליחת דוא״ל. ⚠️ **מיושן** — ראה `EXTERNAL-SYSTEMS.md` §4 |
| `vite.config.js` | ארבע נקודות כניסה, `base: './'` |

### ארבעת קבצי ה-HTML — ההבדלים

| | `index` | `tik` | `worker` | `forms` |
|---|---|---|---|---|
| פונטים | Heebo + Dancing + Caveat | **Assistant + Frank Ruhl** | זהה ל-index | זהה ל-index |
| favicon / theme-color | ✔ | **✘** | חלקי | חלקי |
| PWA manifest | ✔ | ✘ | ✘ | ✘ |
| ריענון אוטומטי | ✔ | ✘ | ✘ | ✘ |
| תג דביר | ב-HTML | **ב-JSX** | ב-HTML | ב-HTML |
| ווידג'ט נגישות | ✔ | **✘** | ✔ | ✔ |
| `ErrorBoundary` | ✔ | **✘** | ✘ | ✘ |

⚠️ `tik.html` — מוצר הליבה — הוא החריג בכל שורה.

---

## מפתחות אחסון בדפדפן

**22 מפתחות localStorage + אחד ב-sessionStorage.** אין מקום אחד בקוד שמרכז אותם.

| מפתח | מי | מה |
|---|---|---|
| `tik_auth` | משרד | דגל התחברות |
| `ogen_auth` | חתימה | דגל התחברות — **מפתח אחר** |
| `worker_auth` | פורטל עו״ס | דגל התחברות |
| `ogen_me` | משרד | "מי אני" — נכתב ליומן הביקורת של מסמכי המס |
| `tik_gemini_key` / `tik_gemini_model` | משרד | מפתח ומודל Gemini |
| `tik_groq_key` / `tik_groq_model` / `tik_groq_vision` | משרד | מפתח ומודלי Groq |
| `tik_cloud_last_sync` | משרד | חותמת גיבוי אחרון |
| `tik_signing_url` | משרד | כתובת אפליקציית החתימה |
| `ogen_last_family` / `ogen_last_worker` | משרד | הרשומה האחרונה שנצפתה |
| `owner_settings` | חתימה | דוא״ל בעלים + webhook |
| `my_sign_requests` / `my_templates` / `my_layouts` | חתימה | **אינדקס מקומי בלבד** — ניקוי נתוני אתר מאבד אותו |
| `mock_sign_requests` / `mock_templates` | חתימה | ה-backend המדומה |
| `all_signed_seen` | חתימה | מה כבר נצפה בהתראות |
| `worker_saved_signature` | טפסים | **תמונת חתימה שמורה**, משותפת לכל הטפסים |
| `lang` | משותף | ⚠️ **נקרא ולעולם לא נכתב** — המתג he/en לא נשמר |
| `ogenReloadTo` *(sessionStorage)* | `index.html` | שמירה מפני לולאת ריענון |

בנוסף `ogen_worker_files` — שם מסד ה-IndexedDB, לא מפתח localStorage.

---

## `src/index.css` — שלוש שכבות ערכת נושא

3,257 שורות, **גיליון יחיד לארבע האפליקציות**, בנוי כמפלים מוערמים שכל אחד
דורס את קודמו:

| # | היכן | מה |
|---|---|---|
| 1 | שורה 1 | `:root` בסיסי |
| 2 | ~2673 | `/* VISUAL REFRESH — appended last so it wins */` — **`:root` שני** |
| 3 | ~2879 | מערכת העיצוב "עוגן" — `:root[data-app="office"]`, 64 סלקטורים |

`data-app="office"` נקבע ב-`tik-main.jsx` על אלמנט השורש, כדי שערכת המשרד
לא תדרוס את אפליקציית החתימה.

> 🔑 **המוסכמה: מוסיפים בסוף, לא עורכים במקום.** בדיוק את הכלל הזה שבר הקומיט
> `c4bdc39` (ראה `OPEN-ISSUES.md` §2).

---

## טיפול בשגיאות

`ErrorBoundary` מחובר **רק ב-`src/main.jsx`**. למערכת המשרד, לפורטל העו״ס
ולניהול הטפסים אין אחד — קריסת רינדור נותנת מסך לבן.

מעבר לזה, הדיווח הוא `alert()` גולמי: **64 קריאות ב-`src/tik/`** (32 מהן
ב-`TikApp.jsx`), ו-99 בכל `src/`.

---

## הערות רוחב

- **`src/index.css`** — גיליון סגנונות יחיד לכל ארבע האפליקציות.
  ערכת הנושא של המשרד מוגבלת ב-`[data-app="office"]` על אלמנט השורש, שנקבע
  ב-`tik-main.jsx`, כדי שאפליקציית החתימה תישאר במראה המקורי שלה.
- **כפילויות ידועות** — `polyfills.js` ו-`pdf.worker.js` קיימים בשני עותקים
  זהים ב-`src/lib/` וב-`src/tik/`.
- **מפתח Supabase** משוכפל ב-17 קבצים.
