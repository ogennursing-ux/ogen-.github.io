// Thirty made-up placements for trying the system out: thirty families, thirty
// caregivers, and enough spread in the dates that every report has something in
// it — visas running out, passports, insurance, permits, policies, the annual
// client fee, inter-visa trips, birthdays, the worker's three instalments,
// payments, visits and social-worker visits.
//
// Everything created here carries data.demo = true, so "מחק נתוני הדגמה"
// removes exactly these rows and nothing else. Nothing is random at runtime:
// the same seed produces the same thirty people every time, so a bug you find
// is a bug you can reproduce.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb = null;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

export const DEMO_TAG = 'demo-ogen-v1';

// A tiny deterministic generator, so "random" is the same on every machine.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const FAMILY_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'שפירא', 'אזולאי',
  'גבאי', 'אוחיון', 'הראל', 'בן דוד', 'רוזנברג', 'קפלן', 'שרון', 'ברקוביץ', 'מלכה', 'אדרי',
  'טולדנו', 'נחום', 'שמעוני', 'וקנין', 'אלמוג', 'זילברמן', 'גולן', 'סבן', 'עמר', 'קליין',
];
const FIRST_NAMES = [
  'יעקב', 'שרה', 'משה', 'רחל', 'דוד', 'מרים', 'אברהם', 'לאה', 'יצחק', 'חנה',
  'שלמה', 'אסתר', 'מרדכי', 'רבקה', 'אהרון', 'זהבה', 'נתן', 'פנינה', 'ראובן', 'ברכה',
  'שמעון', 'דבורה', 'יוסף', 'תמר', 'בנימין', 'נעמי', 'אליהו', 'יהודית', 'חיים', 'שושנה',
];
const CITIES = [
  'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע',
  'חולון', 'בני ברק', 'רמת גן', 'רחובות', 'אשקלון', 'בת ים', 'הרצליה',
];
const STREETS = [
  'הרצל', 'ויצמן', 'בן גוריון', 'רוטשילד', 'ז׳בוטינסקי', 'הנביאים', 'סוקולוב',
  'אלנבי', 'דיזנגוף', 'הרב קוק', 'אחד העם', 'ביאליק', 'ארלוזורוב', 'המלך ג׳ורג׳', 'יפו',
];

// Caregivers, by nationality, with names that match the country.
const WORKERS = [
  ['מריה סנטוס', 'Maria Santos', 'הפיליפינים', 'נקבה'],
  ['אנה קרוז', 'Ana Cruz', 'הפיליפינים', 'נקבה'],
  ['רוזה רייס', 'Rosa Reyes', 'הפיליפינים', 'נקבה'],
  ['גרייס באוטיסטה', 'Grace Bautista', 'הפיליפינים', 'נקבה'],
  ['ג׳ואל גרסיה', 'Joel Garcia', 'הפיליפינים', 'זכר'],
  ['לינדה טורס', 'Linda Torres', 'הפיליפינים', 'נקבה'],
  ['מרלין וילנואבה', 'Marlyn Villanueva', 'הפיליפינים', 'נקבה'],
  ['רמון דלה קרוז', 'Ramon Dela Cruz', 'הפיליפינים', 'זכר'],
  ['סוניה קומאר', 'Sunita Kumar', 'הודו', 'נקבה'],
  ['רג׳ש סינג', 'Rajesh Singh', 'הודו', 'זכר'],
  ['פריה שארמה', 'Priya Sharma', 'הודו', 'נקבה'],
  ['אמיט פאטל', 'Amit Patel', 'הודו', 'זכר'],
  ['קביטה ראו', 'Kavita Rao', 'הודו', 'נקבה'],
  ['בינה גורונג', 'Bina Gurung', 'נפאל', 'נקבה'],
  ['רם בהאדור', 'Ram Bahadur', 'נפאל', 'זכר'],
  ['סרסוואטי טאמאנג', 'Saraswati Tamang', 'נפאל', 'נקבה'],
  ['דיפאק שרסטה', 'Deepak Shrestha', 'נפאל', 'זכר'],
  ['נירמלה פררה', 'Nirmala Perera', 'סרי לנקה', 'נקבה'],
  ['קומרי סילבה', 'Kumari Silva', 'סרי לנקה', 'נקבה'],
  ['ניהאל פרננדו', 'Nihal Fernando', 'סרי לנקה', 'זכר'],
  ['אלנה פופה', 'Elena Popa', 'מולדובה', 'נקבה'],
  ['נטליה רוסו', 'Natalia Rusu', 'מולדובה', 'נקבה'],
  ['ויקטור צ׳ובאנו', 'Victor Ciobanu', 'מולדובה', 'זכר'],
  ['אירינה מוראר', 'Irina Morar', 'מולדובה', 'נקבה'],
  ['אולגה קובלנקו', 'Olga Kovalenko', 'אוקראינה', 'נקבה'],
  ['סבטלנה בונדר', 'Svetlana Bondar', 'אוקראינה', 'נקבה'],
  ['דמיטרו מלניק', 'Dmytro Melnyk', 'אוקראינה', 'זכר'],
  ['גולנרה איסמאילובה', 'Gulnara Ismailova', 'אוזבקיסטן', 'נקבה'],
  ['נינו בריτזה', 'Nino Beridze', 'גאורגיה', 'נקבה'],
  ['סומאי צ׳אנתה', 'Sumai Chantha', 'תאילנד', 'נקבה'],
];

const RAKAZIM = ['רינה כהן', 'דוד מזרחי', 'מיכל לוי', 'יוסי ברק'];
const BRANCHES = ['מרכז', 'צפון', 'דרום', 'ירושלים'];
const INSURERS = ['הראל', 'הילית', 'מנורה מבטחים', 'כלל ביטוח', 'הפניקס'];
const PLANS = ['עילית', 'כללי', 'פלוס', 'זהב', 'בסיס'];
const SOCIAL_WORKERS = ['אורית שגב', 'תמר אדלר', 'נועה בן חיים'];
const PAY_METHODS = ['העברה בנקאית', 'אשראי', 'מזומן', 'צ׳ק'];
const FUNCTIONAL = ['סיעודי', 'תשוש', 'עצמאי חלקית', 'סיעודי מורכב'];

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
const shiftM = (base, months) => { const d = new Date(base); d.setMonth(d.getMonth() + months); return d; };

// An Israeli ID with a valid check digit, so validation elsewhere accepts it.
function israeliId(n) {
  const base = String(10000000 + (n * 137417) % 89999999).slice(0, 8);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let v = Number(base[i]) * ((i % 2) + 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return base + String((10 - (sum % 10)) % 10);
}

const passport = (r, i) => {
  const letters = 'PQRSTX';
  return letters[i % letters.length] + String(1000000 + Math.floor(r() * 8999999)) + 'AB'[i % 2];
};
const phone = (r, prefix) => prefix + String(1000000 + Math.floor(r() * 8999999));

// One family + one caregiver + the placement between them.
function buildCase(i, today) {
  const r = rng(9000 + i * 31);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  const [nameHe, nameEn, nationality, gender] = WORKERS[i % WORKERS.length];
  const family = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${FAMILY_NAMES[i % FAMILY_NAMES.length]}`;
  const city = CITIES[i % CITIES.length];
  const rakaz = RAKAZIM[i % RAKAZIM.length];

  // Placements spread from three and a half years ago to last week, so the
  // 26- and 38-month instalments and the six-monthly visits all land somewhere.
  const monthsAgo = [42, 39, 38, 37, 30, 27, 26, 25, 20, 18, 14, 12, 10, 8, 6, 5, 4, 2, 1, 0][i % 20];
  // A few of the newest placements start inside the current quarter, so the
  // quarterly reports are never empty.
  const start = monthsAgo === 0 ? shift(today, -(3 + (i % 20))) : shiftM(today, -monthsAgo);
  // A handful of files are closed, so "סיום עמדה" and the placements list differ.
  const closed = i % 10 === 7;
  const endDate = closed ? shift(start, 30 * (monthsAgo - 1)) : null;

  // Expiries staggered across the coming year, a few already overdue.
  const visaDays = [-25, 9, 18, 27, 40, 55, 70, 95, 120, 160, 200, 260, 320, 355][i % 14];
  const passDays = [14, 60, 130, 210, 300, 420, 540, 700, -12, 45][i % 10];
  const insDays = [-8, 6, 21, 33, 48, 66, 90, 140, 190, 250][i % 10];
  const permitDays = [-15, 12, 25, 44, 63, 88, 110, 150, 210, 280][i % 10];

  const dobYear = 1962 + (i * 7) % 34;
  const bdayOffset = [3, 9, 15, 22, 28, 45, 61, 80, 110, 150][i % 10];
  const bday = shift(today, bdayOffset);

  const fee = [70, 70, 70, 85, 100][i % 5];
  const feeFrom = shiftM(today, -(11 - (i % 12)));

  // Every third placement has a worker abroad on an inter-visa trip.
  const abroad = i % 3 === 1;
  // Two in five have the visa renewal already transmitted to משרד הפנים.
  const sentVisa = i % 5 < 2;

  const payments = [];
  for (let k = 0; k < 1 + (i % 3); k++) {
    const d = shift(today, -(7 + k * 34 + (i % 11)));
    payments.push({
      id: `demo-pay-${i}-${k}`, date: iso(d),
      amount: [1170, 2840, 840, 1500, 585][(i + k) % 5],
      method: pick(PAY_METHODS), note: k === 0 ? 'דמי טיפול' : 'תשלום שוטף',
    });
  }

  const visits = [];
  for (let k = 0; k < 1 + (i % 3); k++) {
    visits.push({
      id: `demo-visit-${i}-${k}`, date: iso(shift(today, -(11 + k * 47))),
      type: ['ביקור בית', 'שיחת מעקב', 'ביקור יזום'][(i + k) % 3],
      note: ['הכול תקין', 'המשפחה מרוצה', 'נדרש מעקב'][(i + k) % 3],
    });
  }

  // Social-worker visits: the earlier ones are recorded as done, the later ones
  // are still open — exactly the mix the quarterly report is meant to show.
  // Social-worker visits: mark every scheduled visit whose due date is already
  // in the past as done (with the date it "happened"), so the quarterly report
  // — including the part of the current quarter that has elapsed — has data.
  const socialVisits = {};
  const channels = ['physical', 'physical', 'phone', 'digital'];
  const markVisit = (key, due, idx) => {
    if (due <= today) {
      socialVisits[key] = { date: iso(due), note: 'ביקור', channel: channels[idx % 4] };
    }
  };
  markVisit('placement', shift(start, 2), 0);
  markVisit('day30', shift(start, 31 + (i % 5)), 1);
  for (let m = 6; m <= monthsAgo; m += 6) markVisit(`periodic-${m}`, shift(shiftM(start, m), i % 6), m / 6 + 2);

  // A worker arrives in Israel; the three instalments run from that date. Most
  // arrive and are placed with us at once, so arrival = start. Every seventh is
  // a TRANSFER — arrived long before joining us — to show that we only collect
  // the instalments that fall while the worker is in our תאגיד.
  const transferred = i % 7 === 3;
  const arrivalDate = transferred ? shiftM(start, -28) : start;

  // Mark as paid the owed instalments that are already in the past, leaving the
  // upcoming one as the "next payment".
  const workerPaymentsDone = {};
  for (const [key, months] of [['wpay1', 0], ['wpay2', 26], ['wpay3', 38]]) {
    const due = shiftM(arrivalDate, months);
    const owed = due >= start;            // only what falls while with us
    if (owed && due < today) workerPaymentsDone[key] = true;
  }

  const insurer = INSURERS[i % INSURERS.length];

  // --- placement history (היסטוריית השמות) --------------------------------
  // The current placement, and for roughly every third file an earlier one, so
  // both sides of the record show a real history. A transferred worker keeps
  // the same caregiver but a different (earlier) family; a re-placed family
  // keeps its own name but an earlier, different caregiver.
  const placementType = ['השמה מהארץ', 'השמה מחו״ל', 'החלפה', 'הארכה', 'העברה מלשכה אחרת'][i % 5];
  const placementNumber = 'SH-' + String(90000 + i * 41);
  const placementHistory = [{
    id: `${DEMO_TAG}-pl-${i}-cur`,
    worker: nameHe, family,
    placementNumber, placementType,
    startDate: iso(start),
    endDate: closed ? iso(endDate) : '',
    endReason: closed ? ['סיום חוזה', 'פטירה', 'מעבר למוסד', 'החלפת עובד/ת'][i % 4] : '',
    addedAt: iso(start),
  }];
  if (i % 3 === 0) {
    const prevEnd = shift(start, -20);
    const prevStart = shiftM(prevEnd, -(10 + (i % 14)));
    placementHistory.push({
      id: `${DEMO_TAG}-pl-${i}-prev`,
      worker: transferred ? nameHe : WORKERS[(i + 4) % WORKERS.length][0],
      family: transferred ? `${FIRST_NAMES[(i + 3) % FIRST_NAMES.length]} ${FAMILY_NAMES[(i + 2) % FAMILY_NAMES.length]}` : family,
      placementNumber: 'SH-' + String(80000 + i * 29),
      placementType: 'השמה מחו״ל',
      startDate: iso(prevStart),
      endDate: iso(prevEnd),
      endReason: ['עזיבה', 'החלפת עובד/ת', 'פטירה'][i % 3],
      addedAt: iso(prevStart),
    });
  }

  return {
    demo: true, demoTag: DEMO_TAG,
    fields: {
      // --- the family / client -------------------------------------------
      caseNumber: String(2001 + i),
      fullName: family, employerName: family,
      idNumber: israeliId(i + 1),
      dob: `${1938 + (i * 3) % 22}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
      gender: i % 2 ? 'זכר' : 'נקבה',
      city, street: `${STREETS[i % STREETS.length]} ${1 + (i % 90)}`,
      zip: String(1000000 + i * 7919).slice(0, 7),
      contactPhone: phone(r, '05'), mobile: phone(r, '05'),
      email: `demo${i + 1}@example.com`,
      contactName: `${FIRST_NAMES[(i + 5) % FIRST_NAMES.length]} ${FAMILY_NAMES[i % FAMILY_NAMES.length]}`,
      contactRelation: ['בן', 'בת', 'בן/בת זוג', 'אחר'][i % 4],
      contactPhone2: phone(r, '05'),
      functionalState: FUNCTIONAL[i % FUNCTIONAL.length],
      careHours: String(9 + (i % 10)),
      assignedTo: rakaz, branch: BRANCHES[i % BRANCHES.length],
      caseStatus: closed ? 'סגור' : 'פעיל',
      closedDate: closed ? iso(endDate) : '',
      endDate: closed ? iso(endDate) : '',
      endReason: closed ? ['סיום חוזה', 'פטירה', 'מעבר למוסד', 'החלפת עובד/ת'][i % 4] : '',

      // --- the caregiver ---------------------------------------------------
      nameHe, nameEn, nationality, gender,
      passportNo: passport(r, i),
      workerPhone: phone(r, '05'),
      workerStatus: closed ? 'לא מועסק' : 'מועסק',
      passportExpiry: iso(shift(today, passDays)),
      passportIssueDate: iso(shiftM(today, -60)),
      visaNumber: 'V' + String(300000 + i * 811),
      visaType: 'B/1',
      visaExpiry: iso(shift(today, visaDays)),
      insuranceCompany: insurer,
      insuranceExpiry: iso(shift(today, insDays)),
      maritalStatus: ['רווק/ה', 'נשוי/אה', 'גרוש/ה'][i % 3],
      children: String(i % 4),
      languages: ['אנגלית', 'אנגלית, עברית', 'עברית'][i % 3],
      abroadCountry: nationality === 'הפיליפינים' ? 'פיליפינים' : nationality,
      abroadPhone: '+63' + String(900000000 + i * 12345),

      // worker's date of birth drives the birthday report
      workerDob: `${dobYear}-${String(bday.getMonth() + 1).padStart(2, '0')}-${String(bday.getDate()).padStart(2, '0')}`,

      // --- inter-visa trip -------------------------------------------------
      interVisaOut: abroad ? iso(shift(today, -(20 + (i % 30)))) : '',
      interVisaBack: abroad ? iso(shift(today, [4, 17, 29, 51, 73][i % 5])) : '',
      interVisaCountry: abroad ? (nationality === 'הפיליפינים' ? 'פיליפינים' : nationality) : '',

      // --- transmitting the visa renewal -----------------------------------
      visaRenewSentDate: sentVisa ? iso(shift(today, -(3 + i % 20))) : '',
      visaRenewStatus: sentVisa ? ['שודר', 'אושר'][i % 2] : 'טרם שודר',
      visaRenewRef: sentVisa ? 'MB-' + String(50000 + i * 37) : '',

      // --- the placement ----------------------------------------------------
      arrivalDate: iso(arrivalDate),
      startDate: iso(start),
      placementWorker: nameHe,
      placementNumber,
      placementType,
      placementStartDate: iso(start),
      placementEndDate: closed ? iso(endDate) : '',
      placements: placementHistory,
      salary: String([6500, 6900, 7200, 6900, 7500][i % 5]),
      weeklyAllowance: '100',
      restDay: ['ראשון', 'שבת', 'שישי'][i % 3],

      // --- the employment permit --------------------------------------------
      permitNumber: 'H-' + String(70000 + i * 53),
      permitSubmitDate: iso(shift(today, -(20 + (i % 120)))),
      permitStatus: ['אושר', 'הוגש', 'בטיפול', 'אושר', 'אושר'][i % 5],
      permitStart: iso(shiftM(today, -(6 + i % 12))),
      permitEnd: iso(shift(today, permitDays)),
      permitExpiry: iso(shift(today, permitDays)),

      // --- the insurance policy ---------------------------------------------
      policyNo: 'POL-' + String(400000 + i * 617),
      policyInsurer: insurer,
      policyPlan: PLANS[i % PLANS.length],
      policyRegDate: iso(shift(today, -(10 + (i % 200)))),
      policyStart: iso(shift(today, -(8 + (i % 200)))),
      policyEnd: iso(shift(today, insDays)),
      policyPremium: String(120 + (i % 8) * 15),
      policyStatus: insDays < 0 ? 'הסתיימה' : 'בתוקף',
      policyAgent: ['סוכנות אורן', 'סוכנות גל', 'ישיר'][i % 3],

      // --- the annual client fee ---------------------------------------------
      monthlyFee: String(fee),
      monthlyFeeFrom: iso(feeFrom),
      monthlyFeeTo: iso(shiftM(feeFrom, 12)),

      // --- accounting ---------------------------------------------------------
      companyFee: '110',
      companyFeeFrom: iso(shiftM(today, -6)),
      companyFeeTo: iso(shiftM(today, 6)),
      placementFee: String([2840, 3200, 2840][i % 3]),
      payer: ['המשפחה', 'ביטוח לאומי', 'המשפחה'][i % 3],
      standingOrder: i % 3 ? 'כן' : 'לא',

      socialWorker: SOCIAL_WORKERS[i % SOCIAL_WORKERS.length],
      referralDate: iso(shiftM(start, -1)),
      referrer: ['ביטוח לאומי', 'המלצה', 'אתר', 'קופת חולים'][i % 4],

      payments, visits, socialVisits, workerPaymentsDone,
    },
  };
}

// The thirty cases, plus two deliberate re-submissions of the same person so
// the duplicate merging is visible on real-looking data.
export function demoCases(today = new Date()) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(buildCase(i, base));

  for (const src of [rows[3], rows[11]]) {
    const dup = JSON.parse(JSON.stringify(src));
    // Same passport, name spelled slightly differently — how it really happens.
    dup.fields.nameHe = dup.fields.nameHe.replace(' ', '  ').trim() + ' ';
    dup.fields.caseNumber = String(Number(dup.fields.caseNumber) + 500);
    dup.fields.payments = [];
    dup.fields.visits = [];
    rows.push(dup);
  }
  return rows;
}

export async function seedDemoData() {
  const existing = await countDemoData();
  if (existing) throw new Error(`כבר קיימים ${existing} תיקי הדגמה. מחקו אותם קודם.`);
  const rows = demoCases().map((c) => ({
    kind: 'family',
    status: 'new',
    data: c,
  }));
  const { error } = await sb().from('agent_submissions').insert(rows);
  if (error) throw new Error('יצירת נתוני ההדגמה נכשלה: ' + error.message);
  return rows.length;
}

export async function countDemoData() {
  const { data, error } = await sb()
    .from('agent_submissions').select('id,data').neq('kind', 'config').limit(500);
  if (error) throw new Error('בדיקת נתוני ההדגמה נכשלה: ' + error.message);
  return (data || []).filter((r) => r.data?.demo === true).length;
}

export async function clearDemoData() {
  const { data, error } = await sb()
    .from('agent_submissions').select('id,data').neq('kind', 'config').limit(500);
  if (error) throw new Error('טעינה נכשלה: ' + error.message);
  const ids = (data || []).filter((r) => r.data?.demo === true).map((r) => r.id);
  if (!ids.length) return 0;
  const { error: delErr } = await sb().from('agent_submissions').delete().in('id', ids);
  if (delErr) throw new Error('מחיקת נתוני ההדגמה נכשלה: ' + delErr.message);
  return ids.length;
}
