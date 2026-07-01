// Ready-made forms the admin can load into the builder and publish as-is.
// Encoded faithfully from the source Word documents provided by the client.
import { renderHomeVisitPdf } from './homeVisitPdf.js';

// Helpers. Ready-made forms use stable field ids so a faithful PDF renderer can
// reference each value. No field is required — the social worker may submit
// without filling everything.
const F = (id, type, label, extra = {}) => ({ id, type, label, required: false, ...extra });
const sec = (id, label) => F(id, 'section', label);

// טופס ב' – ביקור בית (עוגן סיעוד ועובדים זרים בע"מ)
// Descriptive items are free text (faithful to the paper form); pick-lists are
// checklists; two signatures at the end. Fixed values are left blank.
export function homeVisitForm() {
  return {
    title: 'עוגן סיעוד ועובדים זרים בע"מ — טופס ב\' ביקור בית',
    schema: [
      sec('secVisit', 'פרטי הביקור'),
      F('visitType', 'select', 'סוג ביקור', { options: ['לאחר', 'שוטף', 'הכרות / רישום', 'ועדה חריגה', 'חוות דעת'] }),
      F('swName', 'text', 'שם עו"ס / בכיר'),
      F('visitDate', 'date', 'תאריך הביקור'),

      sec('secEmp', 'פרטי המעסיק'),
      F('empName', 'text', 'שם המעסיק'),
      F('empId', 'idNumber', 'ת.ז המעסיק'),
      F('empAge', 'text', 'גיל'),
      F('empAddress', 'text', 'כתובת'),
      F('empPhone', 'phone', 'טלפון'),
      F('empContact', 'text', 'איש קשר'),
      F('empRelation', 'text', 'קירבה'),
      F('empMobile', 'phone', 'נייד'),

      sec('secFw', 'פרטי העו"ז (העובד/ת הזר/ה)'),
      F('fwName', 'text', 'שם העו"ז'),
      F('fwPassport', 'text', 'מספר דרכון'),
      F('fwMobile', 'phone', 'נייד'),
      F('fwCountry', 'text', 'ארץ מוצא'),
      F('fwStart', 'text', 'תחילת העסקה'),
      F('fwPlacement', 'select', 'השמה', { options: ['מהארץ', 'מחו"ל'] }),
      F('fwAgency', 'text', 'לשכה מייבאת'),
      F('fwCity', 'text', 'עיר מגורים בסופ"ש'),
      F('fwStreet', 'text', 'שם הרחוב'),
      F('fwHouseNo', 'text', 'מספר בית'),
      F('fwEntrance', 'text', 'כניסה'),
      F('fwApt', 'text', 'דירה'),
      F('fwDayOff', 'text', 'יום החופשה'),
      F('lastVisitPre', 'text', 'תאריך ביקור אחרון – טרום'),
      F('lastVisitPost', 'text', 'תאריך ביקור אחרון – לאחר השמה'),

      sec('secEmpReport', 'דיווח על המעסיק'),
      F('empAppearance', 'textarea', 'תיאור הופעה חיצונית (רגוע, ניקיון, לבוש לפי העונה, ריחות, הזנחה וכד\')'),
      F('empNutrition', 'textarea', 'תיאור מצב תזונתי (בהתאם לגילו, רזה, שמן וכד\')'),
      F('empAbnormal', 'textarea', 'תיאור סממנים חיצוניים חריגים (סימנים כחולים, שטפי דם, מצב רוח ירוד, מתח, חרדה וכד\')'),
      F('empFunctional', 'textarea', 'תיאור מצבו התפקודי (עצמאי / זקוק לעזרה במעברים / תלוי בזולת / סיעודי / מרותק למיטה / שליטה על סוגרים)'),
      F('empHealth', 'textarea', 'תיאור מצבו הבריאותי (תקין / מחלות כרוניות / אירועים משמעותיים: מחלות, נפילות וכד\')'),
      F('empHospitalized', 'select', 'האם אושפז לאחרונה?', { options: ['לא', 'כן'] }),
      F('empHospWhere', 'text', 'אם אושפז – היכן?'),
      F('empHospDuration', 'text', 'משך זמן האשפוז'),
      F('empCognitive', 'textarea', 'תיאור קוגניטיבי (תקשורת: הבנה / הבעה / קוגניציה; התנהגות: חברתית / פתרון בעיות / זיכרון)'),
      F('empHome', 'textarea', 'התרשמות מתחזוקת הבית (ניקיון / אוורור / חימום / שירותים / מטבח וכד\')'),
      F('empFood', 'textarea', 'קניית מזון עבור הקשיש והעו"ז ואספקת ארוחות (מי קונה / מתי / איך)'),
      F('empSatCaregiver', 'textarea', 'שביעות רצון הקשיש מהמטפל (גבוהה / מרוצה / אינו מרוצה / מבקש להחליף)'),
      F('empFamilySat', 'textarea', 'שביעות רצון המשפחה מהמטפל (גבוהה / מרוצה / אינו מרוצה / מבקש להחליף)'),
      F('empServiceIssues', 'select', 'האם יש קשיים או תלונות במתן השירות?', { options: ['אין', 'יש'] }),
      F('empServiceIssuesDetail', 'textarea', 'פירוט קשיים / תלונות'),
      F('empSpecialReq', 'select', 'בקשות מיוחדות של המעסיק?', { options: ['אין', 'יש'] }),
      F('empSpecialReqDetail', 'textarea', 'פירוט בקשות מיוחדות'),

      sec('secFwReport', 'דיווח על העו"ז'),
      F('fwAppearance', 'textarea', 'תיאור הופעה חיצונית (רגוע, ניקיון, לבוש, ריחות, ביטחון וכד\')'),
      F('fwTraining', 'select', 'האם העו"ז קיבל הדרכה טרם תחילת העבודה?', { options: ['כן', 'לא'] }),
      F('fwTrainingDetail', 'textarea', 'פירוט ההדרכה (צרכים מיוחדים, מחלות, מאכלים, הפעלת מכשירים וכד\')'),
      F('fwDuties', 'checklist', 'תפקידי העו"ז', {
        options: ['ניקיון', 'כביסה', 'רחצה', 'האכלה', 'בישול', 'החתלה', 'הלבשה', 'ליווי לטיפולים רפואיים', 'השגחה בלילה', 'מתן תרופות', 'קניות / סידורים'],
      }),
      F('fwSatisfied', 'select', 'האם העו"ז מרוצה?', { options: ['כן', 'לא'] }),
      F('fwSatisfiedDetail', 'textarea', 'פירוט – שביעות רצון העו"ז'),
      F('fwDifficulties', 'select', 'האם נצפו קשיים בעבודה עם הקשיש?', { options: ['לא', 'כן'] }),
      F('fwDifficultiesDetail', 'textarea', 'פירוט – קשיים בעבודה (טיפול בבני משפחה נוספים, עומס וכד\')'),
      F('fwAlignment', 'select', 'האם יש הלימה בין עבודת העו"ז לשביעות רצונו?', { options: ['כן', 'לא'] }),
      F('fwFriends', 'select', 'האם יש לעו"ז חברים / מכרים באזור?', { options: ['כן', 'לא'] }),

      sec('secTerms', 'תנאי העסקת העו"ז'),
      F('contractHolder', 'select', 'החוזה בידי', { options: ['המעסיק', 'העובד', 'אחר'] }),
      F('contractTranslated', 'select', 'תורגם לעו"ז?', { options: ['כן', 'לא'] }),
      F('insuranceUntil', 'text', 'ביטוח רפואי תקף עד'),
      F('insuranceCompany', 'text', 'חברת ביטוח'),
      F('btlPaid', 'text', 'בטל"א לעובד שולם ב-'),
      F('salary', 'text', 'שכר חודשי'),
      F('payDate', 'text', 'מועד תשלום'),
      F('deposited', 'select', 'בהפקדה?', { options: ['כן', 'לא'] }),
      F('weeklyDayOff', 'text', 'יום חופשי שבועי'),
      F('housing', 'checklist', 'מגורים הולמים לעו"ז', {
        options: ['חדר', 'כלי מיטה', 'ארון', 'חימום', 'אוכל', 'אינטרנט', 'טלוויזיה'],
      }),
      F('termsNotes', 'textarea', 'הערות (יש להסביר למעסיק כי עליו לשלם שכר לחשבון בנק ע"ש העו"ז בלבד)'),

      sec('secPlan', 'תכנית טיפול'),
      F('treatmentType', 'checklist', 'מהות הטיפול', {
        options: ['טיפול בבעיות המעסיק', 'טיפול בבעיות העו"ז', 'גישור', 'מעקב', 'תיווך והפנייה לשירותים', 'דיווח לבן משפחה'],
      }),
      F('treatmentDetail', 'textarea', 'פירוט תכנית הטיפול'),

      sec('secSummary', 'סיכום והתרשמות מבצע/ת הביקור'),
      F('summaryEmployer', 'textarea', 'בנוגע למעסיק/ה'),
      F('summaryCaregiver', 'textarea', 'בנוגע למטפל/ת'),
      F('attendees', 'checklist', 'נוכחים בביקור', {
        options: ['מעסיק', 'בן משפחה', 'עו"ז', 'נציג לשכה פרטית', 'אחר'],
      }),
      F('attendeesOther', 'text', 'נוכחים – "אחר" (פירוט)'),

      sec('secSignPerformer', 'אישור וחתימה – מבצע/ת הביקור'),
      F('performerName', 'text', 'שם מבצע/ת הביקור'),
      F('performerId', 'idNumber', 'ת.ז מבצע/ת הביקור'),
      F('performerDate', 'date', 'תאריך האישור'),
      F('performerSignature', 'signature', 'חתימת מבצע/ת הביקור'),

      sec('secSignSenior', 'אישור – עו"ס בכיר/ה'),
      F('seniorName', 'text', 'שם עו"ס אחראי/ת'),
      F('seniorId', 'idNumber', 'ת.ז עו"ס בכיר/ה'),
      F('seniorSignature', 'signature', 'חתימת עו"ס בכיר/ה'),
    ],
  };
}

export const PREBUILT_FORMS = [
  { key: 'homeVisit', label: 'טופס ביקור בית', build: homeVisitForm, renderPdf: renderHomeVisitPdf },
];

// Built-in forms are always available in the worker portal without anyone
// publishing them to the backend. We expose each as a template-shaped object so
// the fill flow (StructuredFormView / submitForm) can use it unchanged. The id
// is prefixed with "builtin:" so the router builds it locally instead of
// fetching it from the database.
export const BUILTIN_PREFIX = 'builtin:';

export function prebuiltTemplate(key) {
  const pf = PREBUILT_FORMS.find((p) => p.key === key);
  if (!pf) return null;
  const { title, schema } = pf.build();
  return {
    id: BUILTIN_PREFIX + key,
    title,
    pdf_path: null,
    owner_email: null,
    webhook_url: null,
    signers: { list: [], note: '', category: 'worker', active: true, formType: 'structured', schema },
    // Optional faithful PDF renderer for this specific form.
    renderPdf: pf.renderPdf || null,
    created_at: new Date(0).toISOString(),
  };
}

export const isBuiltinId = (id) => typeof id === 'string' && id.startsWith(BUILTIN_PREFIX);
export const prebuiltTemplateById = (id) => (isBuiltinId(id) ? prebuiltTemplate(id.slice(BUILTIN_PREFIX.length)) : null);
export const builtinWorkerTemplates = () => PREBUILT_FORMS.map((p) => prebuiltTemplate(p.key));
