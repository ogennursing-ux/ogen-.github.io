// The complete field inventory for a family (patient/employer) record and a
// worker (caregiver) record — modelled on the office's existing system so the
// record pages carry the same detail, grouped into the same sections.
//
// Each field: { key, label, type, options?, width?, ltr?, readOnly?, computed? }
//   type: 'text' | 'date' | 'number' | 'select' | 'checkbox' | 'textarea'
//   width: 1 (default) | 2 | 3 — how many grid columns the field spans.

export const CITIES = [
  'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע',
  'חולון', 'בני ברק', 'רמת גן', 'רחובות', 'אשקלון', 'בת ים', 'הרצליה', 'כפר סבא',
  'רעננה', 'מודיעין', 'רמלה', 'לוד', 'נהריה', 'קריית גת', 'אילת', 'עפולה', 'אחר',
];

export const COUNTRIES = [
  'הודו', 'נפאל', 'סרי לנקה', 'פיליפינים', 'מולדובה', 'אוקראינה', 'אוזבקיסטן',
  'תאילנד', 'רומניה', 'רוסיה', 'גאורגיה', 'דרום אפריקה', 'אחר',
];

export const LANGUAGES = [
  'עברית', 'אנגלית', 'רוסית', 'ערבית', 'הינדי', 'נפאלית', 'סינהלית', 'טאגלוג',
  'רומנית', 'אמהרית', 'צרפתית', 'ספרדית', 'אחר',
];

export const INSURERS = ['הראל', 'הילית', 'מנורה מבטחים', 'כלל ביטוח', 'הפניקס', 'איילון', 'AIG'];

export const POLICY_STATUS = ['בתוקף', 'בהמתנה', 'הסתיימה', 'בוטלה'];
export const PERMIT_STATUS = ['טרם הוגש', 'הוגש', 'בטיפול', 'אושר', 'נדחה', 'הסתיים'];
export const SEND_STATUS = ['טרם שודר', 'שודר', 'אושר', 'נדחה'];

export const YES_NO = ['כן', 'לא'];
export const GENDERS = ['זכר', 'נקבה'];
export const MARITAL = ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה'];

// ---------------------------------------------------------------------------
// FAMILY / PATIENT (כרטיס לקוח)
// ---------------------------------------------------------------------------
export const FAMILY_SECTIONS = [
  {
    title: 'פרטי המטופל / מעסיק',
    icon: '👤',
    fields: [
      { key: 'employerName', label: 'שם מלא', type: 'text', width: 2 },
      { key: 'idNumber', label: 'תעודת זהות', type: 'text', ltr: true },
      { key: 'idIssueDate', label: 'תאריך הנפקה', type: 'date' },
      { key: 'dob', label: 'תאריך לידה', type: 'date' },
      { key: 'age', label: 'גיל', type: 'number', computed: 'ageFromDob', readOnly: true },
      { key: 'gender', label: 'מין', type: 'select', options: GENDERS },
      { key: 'maritalStatus', label: 'מצב משפחתי', type: 'select', options: MARITAL },
      { key: 'birthCountry', label: 'ארץ לידה', type: 'text' },
      { key: 'motherTongue', label: 'שפת אם', type: 'select', options: LANGUAGES },
      { key: 'foreignLang1', label: 'שפה זרה 1', type: 'select', options: LANGUAGES },
      { key: 'foreignLang2', label: 'שפה זרה 2', type: 'select', options: LANGUAGES },
    ],
  },
  {
    title: 'כתובת ויצירת קשר',
    icon: '📍',
    fields: [
      { key: 'city', label: 'ישוב', type: 'select', options: CITIES },
      { key: 'street', label: 'רחוב ומספר', type: 'text', width: 2 },
      { key: 'zip', label: 'מיקוד', type: 'text', ltr: true },
      { key: 'geoArea', label: 'שיוך גאוגרפי', type: 'text' },
      { key: 'contactPhone', label: 'טלפון', type: 'text', ltr: true },
      { key: 'mobile', label: 'נייד', type: 'text', ltr: true },
      { key: 'email', label: 'אימייל', type: 'text', ltr: true, width: 2 },
    ],
  },
  {
    title: 'איש קשר מטעם המשפחה',
    icon: '📞',
    fields: [
      { key: 'contactName', label: 'שם איש קשר', type: 'text', width: 2 },
      { key: 'contactRelation', label: 'קרבה', type: 'select', options: ['בן', 'בת', 'בן/בת זוג', 'חתן/כלה', 'נכד/ה', 'אח/ות', 'אפוטרופוס', 'אחר'] },
      { key: 'contactMobile', label: 'נייד איש קשר', type: 'text', ltr: true },
      { key: 'contactId', label: 'ת״ז איש קשר', type: 'text', ltr: true },
      { key: 'guardianName', label: 'שם אפוטרופוס / מיופה כוח', type: 'text', width: 2 },
    ],
  },
  {
    title: 'ניהול התיק',
    icon: '🗂️',
    fields: [
      { key: 'caseNumber', label: 'מספר תיק', type: 'number', readOnly: true },
      { key: 'caseStatus', label: 'סטטוס', type: 'select', options: ['פנייה', 'פעיל', 'מושהה', 'סגור'] },
      { key: 'branch', label: 'סניף', type: 'select', options: ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע'] },
      { key: 'assignedTo', label: 'רכז/ת', type: 'text' },
      { key: 'socialWorker', label: 'עובד/ת סוציאלי/ת', type: 'text' },
      { key: 'openedDate', label: 'תאריך פתיחה', type: 'date' },
      { key: 'updatedDate', label: 'תאריך עדכון', type: 'date' },
      { key: 'updatedBy', label: 'רכז/ת מעדכן/ת', type: 'text' },
      { key: 'closedDate', label: 'תאריך סגירה', type: 'date' },
      { key: 'lastVisit', label: 'ביקור אחרון', type: 'date' },
      { key: 'referrer', label: 'גורם מפנה', type: 'text' },
      { key: 'permitRequestDate', label: 'תאריך בקשה להיתר', type: 'date' },
      { key: 'bilateralForm', label: 'טופס בילטראלי', type: 'select', options: YES_NO },
      { key: 'municipal', label: 'עירוני', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'השמה נוכחית',
    icon: '🤝',
    fields: [
      { key: 'placementWorker', label: 'העובד/ת המטפל/ת', type: 'text', width: 2 },
      { key: 'placementNumber', label: 'מספר השמה', type: 'text' },
      { key: 'placementStartDate', label: 'ת. תחילת עבודה', type: 'date' },
      { key: 'placementEndDate', label: 'ת. סיום עבודה', type: 'date' },
      { key: 'placementFromIsrael', label: 'השמה מהארץ', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'תוקף אשרה / ביטוח',
    icon: '📋',
    fields: [
      { key: 'visaExpiry', label: 'תוקף אשרה', type: 'date' },
      { key: 'insuranceExpiry', label: 'תוקף ביטוח', type: 'date' },
      { key: 'insuranceCompany', label: 'חברת ביטוח', type: 'select', options: INSURERS },
    ],
  },
  {
    // The policy itself, not just when it runs out — so the office can pull
    // reports by registration date or by the policy's own start/end.
    title: 'פוליסת ביטוח',
    icon: '🛡️',
    fields: [
      { key: 'policyNo', label: 'מספר פוליסה', type: 'text', ltr: true },
      { key: 'policyInsurer', label: 'חברת הביטוח', type: 'select', options: INSURERS },
      { key: 'policyPlan', label: 'שם הביטוח / מסלול', type: 'text', width: 2, hint: 'למשל: עילית' },
      { key: 'policyRegDate', label: 'תאריך רישום', type: 'date' },
      { key: 'policyStart', label: 'תחילת הפוליסה', type: 'date' },
      { key: 'policyEnd', label: 'סיום הפוליסה', type: 'date' },
      { key: 'policyPremium', label: 'פרמיה חודשית', type: 'number' },
      { key: 'policyStatus', label: 'סטטוס פוליסה', type: 'select', options: POLICY_STATUS },
      { key: 'policyAgent', label: 'סוכן/סוכנות', type: 'text' },
      { key: 'policyNotes', label: 'הערות לפוליסה', type: 'textarea', width: 3 },
    ],
  },
  {
    title: 'היתר העסקה',
    icon: '🗂️',
    fields: [
      { key: 'permitNumber', label: 'מספר היתר', type: 'text', ltr: true },
      { key: 'permitSubmitDate', label: 'תאריך הגשת הבקשה', type: 'date' },
      { key: 'permitStatus', label: 'סטטוס הבקשה', type: 'select', options: PERMIT_STATUS },
      { key: 'permitStart', label: 'תחילת ההיתר', type: 'date' },
      { key: 'permitEnd', label: 'סיום ההיתר', type: 'date' },
      { key: 'permitExpiry', label: 'תוקף היתר', type: 'date' },
      { key: 'permitNotes', label: 'הערות להיתר', type: 'textarea', width: 3 },
    ],
  },
  {
    title: 'הנהלת חשבונות',
    icon: '💳',
    fields: [
      { key: 'accountingNo', label: 'חודש / מס׳ הנה״ח', type: 'text' },
      { key: 'companyFee', label: 'דמי תאגיד (חודשי)', type: 'number' },
      { key: 'companyFeeFrom', label: 'לתקופה מ־', type: 'date' },
      { key: 'companyFeeTo', label: 'עד', type: 'date' },
      { key: 'companyFeeRenewalDate', label: 'חידוש דמי תאגיד', type: 'date' },
      { key: 'monthlyFee', label: 'תשלום חודשי (₪)', type: 'number', hint: 'ברירת מחדל 70 ₪ לחודש' },
      { key: 'monthlyFeeFrom', label: 'תשלום חודשי — מ־', type: 'date' },
      { key: 'monthlyFeeTo', label: 'תשלום חודשי — עד', type: 'date', hint: 'שנה מתאריך ההתחלה' },
      { key: 'placementFee', label: 'עמלת השמה', type: 'number' },
      { key: 'placementFeeValidTo', label: 'תוקף עד', type: 'date' },
      { key: 'payer', label: 'גורם משלם', type: 'text' },
      { key: 'standingOrder', label: 'הוראת קבע', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'תנאי ההעסקה',
    icon: '📝',
    fields: [
      { key: 'salary', label: 'שכר חודשי ברוטו', type: 'number' },
      { key: 'weeklyAdvance', label: 'דמי כיס שבועי', type: 'number' },
      { key: 'startDate', label: 'תאריך תחילת העסקה', type: 'date' },
      { key: 'daysPerWeek', label: 'ימי עבודה בשבוע', type: 'select', options: ['5', '6', '7'] },
      { key: 'weeklyDayOff', label: 'יום חופש שבועי', type: 'select', options: ['שבת', 'ראשון', 'אחר'] },
      { key: 'liveIn', label: 'מגורים', type: 'select', options: ['גר/ה בבית המטופל', 'לא גר/ה בבית'] },
      { key: 'contractNote', label: 'הערה לחוזה', type: 'textarea', width: 3 },
    ],
  },
  {
    title: 'דרישות ותנאים מהמטפל/ת',
    icon: '🎯',
    fields: [
      { key: 'reqLanguage', label: 'שפה נדרשת', type: 'select', options: LANGUAGES },
      { key: 'reqCountry', label: 'ארץ מוצא מועדפת', type: 'select', options: COUNTRIES },
      { key: 'reqGender', label: 'מין מבוקש', type: 'select', options: GENDERS },
      { key: 'reqAge', label: 'גיל מבוקש', type: 'text' },
      { key: 'patientSmokes', label: 'המטופל מעשן', type: 'select', options: YES_NO },
      { key: 'roomForWorker', label: 'חדר לעובד/ת', type: 'select', options: YES_NO },
      { key: 'homeAccess', label: 'גישה לבית', type: 'text', width: 2 },
      { key: 'residents', label: 'מספר דיירים', type: 'number' },
      { key: 'rooms', label: 'מספר חדרים', type: 'number' },
    ],
  },
  {
    title: 'מצב תפקודי',
    icon: '🩺',
    fields: [
      { key: 'mobility', label: 'ניידות', type: 'select', options: ['עצמאי', 'עם תמיכה / הליכון', 'כיסא גלגלים', 'מרותק למיטה'] },
      { key: 'continence', label: 'שליטה בסוגרים', type: 'select', options: ['מלאה', 'חלקית', 'אין'] },
      { key: 'cognitive', label: 'מצב קוגניטיבי', type: 'select', options: ['צלול', 'דמנציה', 'אלצהיימר'] },
      { key: 'emotional', label: 'מצב רגשי', type: 'text' },
      { key: 'vision', label: 'ראייה', type: 'select', options: ['תקינה', 'לקויה', 'עיוורון'] },
      { key: 'hearing', label: 'שמיעה', type: 'select', options: ['תקינה', 'לקויה', 'חירשות'] },
      { key: 'jobTasks', label: 'מרכיבי העבודה', type: 'textarea', width: 3 },
    ],
  },
  {
    title: 'זכאות לסיעוד (ביטוח לאומי)',
    icon: '🏛️',
    fields: [
      { key: 'entitlementSource', label: 'נותן הזכאות', type: 'text' },
      { key: 'entitlementLevel', label: 'רמת זכאות', type: 'select', options: ['1', '2', '3', '4', '5', '6'] },
      { key: 'weeklyHours', label: 'שעות שבועיות מאושרות', type: 'number' },
      { key: 'nursingLaw', label: 'חוק סיעוד', type: 'select', options: YES_NO },
      { key: 'humanitarian', label: 'ועדה הומניטרית', type: 'select', options: YES_NO },
      { key: 'disabilityPct', label: 'אחוזי נכות', type: 'number' },
      { key: 'nursingInsurance', label: 'ביטוח סיעודי', type: 'text' },
      { key: 'shoahFund', label: 'קרן ניצולי שואה', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'פרטים באנגלית (לטפסים)',
    icon: '🌐',
    fields: [
      { key: 'employerNameEn', label: 'שם מעסיק באנגלית', type: 'text', ltr: true, width: 2 },
      { key: 'addressEn', label: 'כתובת באנגלית', type: 'text', ltr: true, width: 2 },
      { key: 'contactNameEn', label: 'איש קשר באנגלית', type: 'text', ltr: true, width: 2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// WORKER / CAREGIVER (כרטיס עובד)
// ---------------------------------------------------------------------------
export const WORKER_SECTIONS = [
  {
    title: 'פרטי העובד/ת',
    icon: '👷',
    fields: [
      { key: 'nameEn', label: 'שם באנגלית', type: 'text', ltr: true, width: 2 },
      { key: 'nameHe', label: 'שם בעברית', type: 'text', width: 2 },
      { key: 'passportNo', label: 'מספר דרכון', type: 'text', ltr: true },
      { key: 'nationality', label: 'אזרחות', type: 'select', options: COUNTRIES },
      { key: 'workerGender', label: 'מין', type: 'select', options: GENDERS, fallback: 'gender' },
      { key: 'workerDob', label: 'תאריך לידה', type: 'date', fallback: 'dob' },
      { key: 'workerAge', label: 'גיל', type: 'number', computed: 'workerAgeFromDob', readOnly: true },
      { key: 'workerPhone', label: 'טלפון נייד', type: 'text', ltr: true },
      { key: 'workerEmail', label: 'אימייל', type: 'text', ltr: true, width: 2, fallback: 'email' },
      { key: 'placeOfBirth', label: 'מקום לידה', type: 'text' },
      { key: 'religion', label: 'דת', type: 'text' },
    ],
  },
  {
    title: 'סטטוס ותעסוקה',
    icon: '📊',
    fields: [
      { key: 'workerNumber', label: 'מספר עובד/ת', type: 'number', readOnly: true },
      { key: 'workerStatus', label: 'סטטוס', type: 'select', options: ['מועסק', 'לא מועסק', 'מעבר מלשכה אחרת', 'עזב/ה את הארץ'] },
      { key: 'workerCondition', label: 'מצב', type: 'select', options: ['פעיל', 'ממתין', 'מושהה', 'הסתיים'] },
      { key: 'workerGeoArea', label: 'שיוך גאוגרפי', type: 'text' },
      { key: 'workerOpenedDate', label: 'תאריך פתיחה', type: 'date' },
      { key: 'workerUpdatedDate', label: 'תאריך עדכון', type: 'date' },
      { key: 'arrivalDate', label: 'תאריך כניסה לארץ', type: 'date' },
      { key: 'stayDuration', label: 'רצף שהייה (שנים)', type: 'text', readOnly: true, computed: 'stayFromArrival' },
      { key: 'arrivalSource', label: 'מקור הגעה', type: 'select', options: ['חדש/ה מחו״ל', 'מעבר מלשכה אחרת', 'החלפת מעסיק'] },
      { key: 'endReason', label: 'סיבת סיום', type: 'text' },
      { key: 'lastWorkDate', label: 'תאריך עבודה אחרון', type: 'date' },
      { key: 'foreignAgency', label: 'חברת כח אדם בחו״ל', type: 'text', width: 2 },
      { key: 'humanitarianWorker', label: 'הומניטרי', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'מסמכים ותוקפים',
    icon: '📕',
    fields: [
      { key: 'passportIssueDate', label: 'תאריך הנפקת דרכון', type: 'date' },
      { key: 'passportExpiry', label: 'תוקף דרכון', type: 'date' },
      { key: 'visaNumber', label: 'מספר אשרה', type: 'text', ltr: true },
      { key: 'visaType', label: 'סוג אשרה', type: 'select', options: ['B/1', 'B/2', 'אחר'] },
      { key: 'visaExpiry', label: 'תוקף אשרה', type: 'date' },
      { key: 'insuranceCompany', label: 'חברת ביטוח', type: 'select', options: INSURERS },
      { key: 'insuranceExpiry', label: 'תוקף ביטוח', type: 'date' },
      { key: 'interVisa', label: 'אינטרויזה', type: 'date' },
    ],
  },
  {
    // A worker travelling home: we get a departure date and a return date, and
    // the office wants to know who is coming back in a given period.
    title: 'אינטרויזה — יציאה וחזרה',
    icon: '✈️',
    fields: [
      { key: 'interVisaOut', label: 'תאריך יציאה לחו״ל', type: 'date' },
      { key: 'interVisaBack', label: 'תאריך חזרה לארץ', type: 'date' },
      { key: 'interVisaCountry', label: 'ארץ היעד', type: 'select', options: COUNTRIES },
      { key: 'interVisaNote', label: 'הערה', type: 'textarea', width: 3 },
    ],
  },
  {
    // Renewing the visa means sending it to משרד הפנים. Not everyone updates
    // this today, so nothing is required — but the field is here when they do.
    title: 'שידור חידוש אשרה (משרד הפנים)',
    icon: '📡',
    fields: [
      { key: 'visaRenewSentDate', label: 'תאריך שידור', type: 'date' },
      { key: 'visaRenewStatus', label: 'סטטוס השידור', type: 'select', options: SEND_STATUS },
      { key: 'visaRenewRef', label: 'מספר אסמכתא', type: 'text', ltr: true },
      { key: 'visaRenewNote', label: 'הערה', type: 'textarea', width: 3 },
    ],
  },
  {
    title: 'מאפיינים אישיים',
    icon: '🧾',
    fields: [
      { key: 'workerMaritalStatus', label: 'מצב משפחתי', type: 'select', options: MARITAL, fallback: 'maritalStatus' },
      { key: 'children', label: 'מספר ילדים', type: 'number' },
      { key: 'height', label: 'גובה (ס״מ)', type: 'number' },
      { key: 'weight', label: 'משקל (ק״ג)', type: 'number' },
      { key: 'languages', label: 'שפות', type: 'text', width: 2 },
      { key: 'driverLicense', label: 'רישיון נהיגה', type: 'select', options: YES_NO },
      { key: 'smokes', label: 'מעשן/ת', type: 'select', options: YES_NO },
      { key: 'okWeekends', label: 'מוכן/ה לעבוד בסופ״ש', type: 'select', options: YES_NO },
      { key: 'okSmokingClient', label: 'מוכן/ה ללקוח מעשן', type: 'select', options: YES_NO },
    ],
  },
  {
    title: 'משפחה בחו״ל',
    icon: '👨‍👩‍👧',
    fields: [
      { key: 'fatherName', label: 'שם האב', type: 'text', ltr: true, width: 2 },
      { key: 'motherName', label: 'שם האם', type: 'text', ltr: true, width: 2 },
      { key: 'spouseName', label: 'שם בן/בת הזוג', type: 'text', ltr: true, width: 2 },
      { key: 'spouseInIsrael', label: 'בן/בת זוג בארץ', type: 'select', options: YES_NO },
      { key: 'abroadCountry', label: 'ארץ', type: 'select', options: COUNTRIES },
      { key: 'abroadCity', label: 'עיר', type: 'text' },
      { key: 'abroadStreet', label: 'רחוב ומספר', type: 'text', width: 2 },
      { key: 'abroadZip', label: 'מיקוד', type: 'text', ltr: true },
      { key: 'abroadPhone', label: 'טלפון', type: 'text', ltr: true },
      { key: 'emergencyPhone', label: 'טלפון לחירום', type: 'text', ltr: true },
      { key: 'abroadContact', label: 'איש קשר בחו״ל', type: 'text', width: 2 },
    ],
  },
  {
    title: 'תשלומים לעובד/ת',
    icon: '💰',
    fields: [
      { key: 'workerPaymentNo', label: 'מספר תשלום', type: 'text', ltr: true },
      { key: 'workerPaid', label: 'שולם', type: 'number' },
      { key: 'workerPaymentDate', label: 'תאריך תשלום', type: 'date' },
      { key: 'workerNextPayment', label: 'תשלום הבא', type: 'date' },
    ],
  },
  {
    title: 'מעסיק נוכחי',
    icon: '🏠',
    fields: [
      { key: 'employerName', label: 'שם המעסיק / מטופל', type: 'text', width: 2 },
      { key: 'placementNumber', label: 'מספר השמה', type: 'text' },
      { key: 'placementStartDate', label: 'ת. תחילת עבודה', type: 'date' },
      { key: 'placementEndDate', label: 'ת. סיום עבודה', type: 'date' },
    ],
  },
  {
    title: 'רישום ומעקב',
    icon: '📌',
    fields: [
      { key: 'registrationType', label: 'רשומה', type: 'select', options: ['רישום חדש', 'רישום חדש לעובד קיים', 'החלפת לשכה/מעסיק', 'עדכון פרטים'] },
      { key: 'registrationAction', label: 'מנה', type: 'text' },
      { key: 'assignedTo', label: 'רכז/ת', type: 'text' },
      { key: 'previousEmployer', label: 'מעסיק קודם', type: 'text', width: 2 },
      { key: 'workerNote', label: 'הערות', type: 'textarea', width: 3 },
    ],
  },
];

// ---- computed helpers --------------------------------------------------------
export function computeValue(name, fields) {
  if (name === 'ageFromDob') {
    const dob = fields.dob;
    if (!dob) return '';
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return '';
    return Math.floor((Date.now() - d.getTime()) / 3.15576e10);
  }
  if (name === 'stayFromArrival') {
    const a = fields.arrivalDate;
    if (!a) return '';
    const d = new Date(a);
    if (Number.isNaN(d.getTime())) return '';
    return ((Date.now() - d.getTime()) / 3.15576e10).toFixed(1);
  }
  return '';
}
