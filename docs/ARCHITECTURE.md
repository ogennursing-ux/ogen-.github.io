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
| `reports.js` | 970 | קטלוג 48 הדוחות (ראה `FORMATS.md` §7) |
| `gemini.js` | 544 | **מנוע ה-AI**: Gemini + Groq, ניהול מפתחות, `extractDocument`, `extractFamilyDocument`, `smartImport`, `toWorkerPatch` |
| `registrySchema.js` | 489 | מלאי השדות המלא: 14 מקטעי משפחה + 10 מקטעי עובד, ערים, מדינות, מבטחים |
| `filledContract.js` | 456 | הטבעה על חבילת ההשמה בת 26 העמודים (ראה `PDF-PIPELINE.md` §3) |
| `registry.js` | 425 | שכבת נתוני המרשם: דה-דופליקציה, חיפוש, חידושים, פעימות תשלום, לידים |
| `workerFilesApi.js` | 425 | אחסון IndexedDB לארון התיקים + ייצוא/ייבוא |
| `demoData.js` | 391 | 30 השמות דמו דטרמיניסטיות + ניקוי |
| `intakeChat.js` | 372 | לוגיקת הצ'אט: שלבים, שאלות נפוצות, הסכמה, קופון, הסלמה |
| `chatI18n.js` | 323 | מחרוזות ב-9 שפות |
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
| `agenda.js` | 134 | רשימת מטלות במסך הבית לפי דחיפות |
| `casesBoard.js` | 116 | שכבת נתוני לוח התיקים: `ESSENTIALS`, שלבים |
| `agentInbox.js` | 105 | תיבת סוכן חיצוני + `mergeHalves` |
| `contractTemplates.js` | 95 | אחסון תבניות PDF + מילוי + שליחה |
| `csvExport.js` | 90 | ייצוא CSV תואם-Excel (UTF-8 BOM) |
| `contractOverlay.js` | 88 | הטבעת ערכים על PDF קיים |
| `dataQuality.js` | 86 | בדיקות תקינות מבוססות חוקים |
| `feeReport.js` | 85 | דוח אגרה 306 |
| `cloudBackup.js` | 80 | מראה IndexedDB → Supabase |
| `officeConfig.js` | 75 | שורת הגדרות משותפת, מיקומי חתימה |
| `intakeUtils.js` | 72 | העתקה, זיהוי כפילויות, קישור וואטסאפ |
| `aiContext.js` | 69 | תמונת מצב חיה שמעגנת את עוזר ה-AI |
| `aiDraft.js` | 67 | ניסוח ותרגום ל-9 שפות |
| `digitalForms.js` | 65 | יומן טפסים דיגיטליים מ-`sign_requests` |
| `aiChat.js` | 54 | צ'אט AI טקסטואלי |
| `autoFile.js` | 51 | ניתוח והתאמת מסמך לעובד |
| `pdfRender.js` | 51 | מעבד pdf.js עצמאי לעורך |
| `cp1255.js` | 36 | מקודד Windows-1255 |
| `chatRecords.js` | 35 | מיפוי שדות צ'אט → רשומות |
| `polyfills.js` | 28 | פוליפיל `Map.getOrInsertComputed` |
| `officeAuth.js` | 18 | שער התחברות |
| `recordLink.js` | 13 | כתובת קנונית לרשומה |
| `pdf.worker.js` | 4 | נקודת כניסה לעובד pdf.js |

### נכסים — `src/tik/assets/`

| קובץ | גודל | תפקיד |
|---|---|---|
| `contract-template.pdf` | 8.2MB | חבילת ההשמה הרשמית, 26 עמודים |
| `payment-guide.pdf` | 1.8MB | מדריך תשלום |
| `interior-quarterly-template.xlsx` | 390KB | תבנית משרד הפנים |
| `fee-quarterly-template.xlsx` | 11KB | תבנית דוח 306 |
| `dvir-logo.png` | 263KB | לוגו קרדיט |

---

## `src/lib/` — משותף (20 קבצים)

| קובץ | שורות | מה זה |
|---|---|---|
| `i18n.js` | 371 | טבלת תרגום he/en + Lang context |
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

## `src/components/` — אפליקציית החתימה (27 קבצים)

| קובץ | שורות | | קובץ | שורות |
|---|---|---|---|---|
| `App.jsx` | 750 | | `FieldBox.jsx` | 140 |
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

## הערות רוחב

- **`src/index.css`** — גיליון סגנונות יחיד לכל ארבע האפליקציות.
  ערכת הנושא של המשרד מוגבלת ב-`[data-app="office"]` על אלמנט השורש, שנקבע
  ב-`tik-main.jsx`, כדי שאפליקציית החתימה תישאר במראה המקורי שלה.
- **כפילויות ידועות** — `polyfills.js` ו-`pdf.worker.js` קיימים בשני עותקים
  זהים ב-`src/lib/` וב-`src/tik/`.
- **מפתח Supabase** משוכפל בכ-12 קבצים.
