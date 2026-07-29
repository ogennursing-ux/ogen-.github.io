// The report catalogue, laid out and numbered the way the office's own system
// numbers them (1–8 workers, 101–105 clients, 201–251 visits, 301–305 quarterly,
// 401–406 invoicing), plus a personal row that narrows everything to one
// coordinator.
//
// Each report is data, not a component: it declares which parameters it asks
// for and which columns it returns, and ReportPage renders any of them with the
// same two-step flow (parameters → results). Adding a report means adding an
// entry here.
//
// A report marked `soon` is deliberately not calculated yet — the office still
// has to explain the rules (מנות / מת״ש / חשבוניות / טפסים דיגיטליים). Its card,
// its number and its parameters page exist so the place is reserved and the
// fields behind it are already being collected.

import { activePlacements, WORKER_PAYMENTS, workerPaymentPlan } from './registry.js';
import { buildVisitReport, VISIT_CHANNELS, quarterRange } from './socialWorker.js';

const DAY = 24 * 60 * 60 * 1000;
const parseDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const plusMonths = (d, n) => { const c = new Date(d); c.setMonth(c.getMonth() + n); return c; };
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const F = (c) => c.data?.fields || {};
const workerName = (c) => c.worker?.nameHe || c.worker?.nameEn || F(c).nameHe || '';
const familyName = (c) => c.family?.fullName || F(c).employerName || F(c).fullName || '';

// A window built from the from/to parameters. Either end may be left empty.
function windowOf(params) {
  const from = parseDate(params.from);
  const to = parseDate(params.to);
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to, has: (d) => d && (!from || d >= from) && (!to || d <= to) };
}

// "Personal" reports narrow to one coordinator; the general ones don't.
function byRakaz(cases, rakaz) {
  if (!rakaz) return cases;
  return cases.filter((c) => (F(c).assignedTo || '') === rakaz);
}

export function coordinators(cases) {
  const set = new Set();
  for (const c of cases) { const v = F(c).assignedTo; if (v) set.add(v); }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'));
}

// The monthly client fee runs for a year at a time. If the office only filled
// in the start date, the end is a year later — that is the whole rule.
export function monthlyFeeEnd(c) {
  const f = F(c);
  const explicit = parseDate(f.monthlyFeeTo);
  if (explicit) return explicit;
  const start = parseDate(f.monthlyFeeFrom);
  return start ? plusMonths(start, 12) : null;
}

// A birthday inside the window, regardless of the year the person was born.
function birthdayIn(dob, from, to) {
  const d = parseDate(dob);
  if (!d || !from || !to) return null;
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const cand = new Date(y, d.getMonth(), d.getDate());
    if (cand >= from && cand <= to) return cand;
  }
  return null;
}

// Shared column shapes, so every report's table looks like every other one.
const COL = {
  caseNo: { key: 'caseNumber', label: '#', type: 'num' },
  worker: { key: 'worker', label: 'עובד/ת', type: 'strong', link: 'worker' },
  family: { key: 'family', label: 'משפחה / מעסיק', link: 'family' },
  city: { key: 'city', label: 'ישוב' },
  passport: { key: 'passport', label: 'דרכון', ltr: true },
  nationality: { key: 'nationality', label: 'אזרחות' },
  phone: { key: 'phone', label: 'טלפון', ltr: true },
  rakaz: { key: 'rakaz', label: 'רכז/ת' },
  status: { key: 'status', label: 'סטטוס' },
};

// The base row every worker-side report starts from.
const workerRow = (c) => ({
  id: c.id,
  caseObj: c,
  caseNumber: F(c).caseNumber || '',
  worker: workerName(c),
  family: familyName(c),
  city: c.family?.city || F(c).city || '',
  passport: c.worker?.passportNo || F(c).passportNo || '',
  nationality: c.worker?.nationality || F(c).nationality || '',
  phone: c.worker?.phone || F(c).workerPhone || '',
  rakaz: F(c).assignedTo || '',
  status: F(c).workerStatus || F(c).caseStatus || '',
});

const familyRow = (c) => ({
  id: c.id,
  caseObj: c,
  caseNumber: F(c).caseNumber || '',
  family: familyName(c),
  worker: workerName(c),
  city: c.family?.city || F(c).city || '',
  phone: c.family?.phone || F(c).contactPhone || F(c).mobile || '',
  rakaz: F(c).assignedTo || '',
  status: F(c).caseStatus || '',
});

// A report that simply lists whoever has a given date inside the window.
function dateReport({ field, dateLabel, base = workerRow, extra = [] }) {
  return (cases, params) => {
    const w = windowOf(params);
    const out = [];
    for (const c of byRakaz(cases, params.rakaz)) {
      const d = parseDate(typeof field === 'function' ? field(c) : F(c)[field]);
      if (!w.has(d)) continue;
      out.push({ ...base(c), when: d, ...Object.fromEntries(extra.map((e) => [e.key, e.get(c)])) });
    }
    return out.sort((a, b) => a.when - b.when);
  };
}

const whenCol = (label) => ({ key: 'when', label, type: 'date', strong: true });

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------
const R = [
  // ---- 1–8 · עובדים ------------------------------------------------------
  {
    no: '1', group: 'workers', label: 'עובדים שמסתיימת האשרה',
    desc: 'כל עובד/ת שתוקף האשרה שלו נגמר בתקופה שתבחרו.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport, COL.nationality, whenCol('תוקף האשרה'), COL.family, COL.rakaz],
    run: dateReport({ field: 'visaExpiry' }),
  },
  {
    no: '2', group: 'workers', label: 'עובדים שמסתיים ת.דרכון',
    desc: 'כל עובד/ת שתוקף הדרכון שלו נגמר בתקופה.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport, COL.nationality, whenCol('תוקף הדרכון'), COL.family, COL.rakaz],
    run: dateReport({ field: 'passportExpiry' }),
  },
  {
    no: '3', group: 'workers', label: 'עובדים שמסתיים ת.דרכון או האשרה',
    desc: 'המוקדם מבין השניים — כדי לראות בבת אחת את כל מי שצריך טיפול.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport,
      { key: 'what', label: 'מה נגמר' }, whenCol('התאריך'), COL.family, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const f = F(c);
        const cands = [
          { what: 'אשרה', d: parseDate(f.visaExpiry) },
          { what: 'דרכון', d: parseDate(f.passportExpiry) },
        ].filter((x) => w.has(x.d));
        if (!cands.length) continue;
        cands.sort((a, b) => a.d - b.d);
        const both = cands.length > 1 ? 'אשרה + דרכון' : cands[0].what;
        out.push({ ...workerRow(c), what: both, when: cands[0].d });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '4', group: 'workers', label: 'עובדים שמסתיים ת.ביטוח',
    desc: 'תוקף הביטוח הרפואי של העובד/ת נגמר בתקופה.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport,
      { key: 'insurer', label: 'חברת ביטוח' }, whenCol('תוקף הביטוח'), COL.family, COL.rakaz],
    run: dateReport({
      field: 'insuranceExpiry',
      extra: [{ key: 'insurer', get: (c) => F(c).policyInsurer || F(c).insuranceCompany || '' }],
    }),
  },
  {
    no: '5', group: 'workers', label: 'עובדים שחוזרים מאינטרויזה',
    desc: 'עובד/ת שיצא/ה לחו״ל — מי חוזר/ת לארץ בתקופה שתבחרו.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport,
      { key: 'out', label: 'יצא/ה בתאריך', type: 'date' }, whenCol('חוזר/ת בתאריך'),
      { key: 'country', label: 'ארץ' }, COL.family, COL.rakaz],
    run: dateReport({
      field: 'interVisaBack',
      extra: [
        { key: 'out', get: (c) => F(c).interVisaOut || '' },
        { key: 'country', get: (c) => F(c).interVisaCountry || '' },
      ],
    }),
  },
  {
    no: '6', group: 'workers', label: 'עובדים שישודר חידוש אשרה',
    desc: 'האשרה נגמרת בתקופה והחידוש עדיין לא שודר למשרד הפנים.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport, whenCol('תוקף האשרה'),
      { key: 'sendStatus', label: 'מצב השידור', type: 'pill' }, COL.family, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const f = F(c);
        const d = parseDate(f.visaExpiry);
        if (!w.has(d)) continue;
        if (f.visaRenewSentDate) continue; // already transmitted
        out.push({ ...workerRow(c), when: d, sendStatus: f.visaRenewStatus || 'טרם שודר' });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '7', group: 'workers', label: 'עובדים שיש יום הולדת',
    desc: 'ימי הולדת שנופלים בתקופה — בלי קשר לשנת הלידה.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, whenCol('יום ההולדת'),
      { key: 'age', label: 'גיל', type: 'num' }, COL.phone, COL.family, COL.rakaz],
    run: (cases, params) => {
      const { from, to } = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const dob = parseDate(F(c).workerDob || F(c).dob);
        const when = birthdayIn(dob, from, to);
        if (!when) continue;
        out.push({ ...workerRow(c), when, age: when.getFullYear() - dob.getFullYear() });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '8', group: 'workers', label: 'עובדים שיש לחייב',
    desc: 'פעימות התשלום של העובד/ת — רק אלה שנופלות בזמן שהוא/היא אצלנו בתאגיד.',
    params: ['range'],
    columns: [COL.caseNo, COL.worker, COL.passport,
      { key: 'instalment', label: 'הפעימה' }, whenCol('מועד החיוב'),
      { key: 'state', label: 'מצב', type: 'pill' }, COL.family, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const today = todayStart();
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        // Only instalments owed to us (those due while the worker is in our
        // תאגיד) count; a worker who transferred late never owes the early ones.
        for (const p of workerPaymentPlan(F(c), today).owed) {
          if (!w.has(p.due)) continue;
          out.push({
            ...workerRow(c), instalment: `תשלום ${p.number}`, when: p.due,
            state: p.paid ? 'שולם' : p.due < today ? 'עבר' : 'ממתין',
            tone: p.paid ? 'ok' : p.due < today ? 'bad' : 'warn',
          });
        }
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },

  // ---- 9 · הפניות ---------------------------------------------------------
  {
    no: '9', group: 'workers', label: 'דוח הפניות',
    desc: 'כל ההפניות — ההשמה עצמה: מי, אצל מי, מתי התחילה, מתי הסתיימה ולמה.',
    params: ['range', 'rakaz'],
    columns: [
      { key: 'when', label: 'ת.הפניה', type: 'date', strong: true },
      COL.worker, COL.family, COL.rakaz,
      { key: 'rstatus', label: 'סטטוס', type: 'pill' },
      { key: 'workStart', label: 'ת.עבודה', type: 'date' },
      { key: 'workEnd', label: 'ס.עבודה', type: 'date' },
      { key: 'visitBefore', label: 'ביקור־לפני', type: 'date' },
      { key: 'visitAfter', label: 'ביקור אחרי', type: 'date' },
      { key: 'ptype', label: 'סוג השמה' },
      { key: 'reason', label: 'סיבת־סיום' },
      { key: 'openBatch', label: 'מנת פתיחה' },
      { key: 'closeBatch', label: 'מנת סגירה' },
    ],
    run: dateReport({
      field: (c) => F(c).referralDate || F(c).startDate,
      extra: [
        { key: 'rstatus', get: (c) => F(c).referralStatus || F(c).caseStatus || '' },
        { key: 'workStart', get: (c) => F(c).startDate || '' },
        { key: 'workEnd', get: (c) => F(c).endDate || F(c).placementEndDate || '' },
        { key: 'visitBefore', get: (c) => F(c).visitBefore || '' },
        { key: 'visitAfter', get: (c) => F(c).visitAfter || '' },
        { key: 'ptype', get: (c) => F(c).placementType || '' },
        { key: 'reason', get: (c) => F(c).endReason || '' },
        { key: 'openBatch', get: (c) => F(c).openBatch || '' },
        { key: 'closeBatch', get: (c) => F(c).closeBatch || '' },
      ],
    }),
  },

  // ---- 101–105 · לקוחות --------------------------------------------------
  {
    no: '101', group: 'clients', label: 'מעסיקים שמסתיים תש. חודשי',
    desc: 'התשלום החודשי רץ שנה (70 ₪ לחודש = 840 ₪). כאן מי שהשנה שלו נגמרת וצריך לחדש.',
    params: ['range'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' }, COL.city,
      { key: 'fee', label: 'לחודש', type: 'money' }, { key: 'yearly', label: 'לשנה', type: 'money' },
      { key: 'from', label: 'מ־', type: 'date' }, whenCol('נגמר בתאריך'), COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const end = monthlyFeeEnd(c);
        if (!w.has(end)) continue;
        const fee = Number(F(c).monthlyFee) || 70;
        out.push({ ...familyRow(c), fee, yearly: fee * 12, from: F(c).monthlyFeeFrom || '', when: end });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '102', group: 'clients', label: 'מעסיקים שמסתיים תוקף היתר',
    desc: 'תוקף היתר ההעסקה נגמר בתקופה.',
    params: ['range'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' }, COL.city,
      { key: 'permitNumber', label: 'מספר היתר', ltr: true }, whenCol('תוקף ההיתר'), COL.worker, COL.rakaz],
    run: dateReport({
      base: familyRow,
      field: (c) => F(c).permitExpiry || F(c).permitEnd,
      extra: [{ key: 'permitNumber', get: (c) => F(c).permitNumber || '' }],
    }),
  },
  {
    no: '103', group: 'clients', label: 'פוליסות לפי תאריך רישום',
    desc: 'כל פוליסות הביטוח שנרשמו בתקופה — מספר פוליסה, חברה ומסלול.',
    params: ['range'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' },
      { key: 'policyNo', label: 'מספר פוליסה', ltr: true },
      { key: 'insurer', label: 'חברה' }, { key: 'plan', label: 'מסלול' },
      whenCol('ת. רישום'),
      { key: 'start', label: 'התחלה', type: 'date' }, { key: 'end', label: 'סיום', type: 'date' },
      { key: 'days', label: 'ימים', type: 'num' }, { key: 'perDay', label: 'ש״ח ליום', type: 'money' },
      { key: 'total', label: 'סך הכל', type: 'money', strong: true },
      { key: 'agency', label: 'סוכנות' }, { key: 'pstatus', label: 'סטטוס', type: 'pill' }],
    run: dateReport({
      base: familyRow,
      field: 'policyRegDate',
      extra: [
        { key: 'policyNo', get: (c) => F(c).policyNo || '' },
        { key: 'insurer', get: (c) => F(c).policyInsurer || F(c).insuranceCompany || '' },
        { key: 'plan', get: (c) => F(c).policyPlan || '' },
        { key: 'start', get: (c) => F(c).policyStart || '' },
        { key: 'end', get: (c) => F(c).policyEnd || '' },
        { key: 'days', get: (c) => F(c).policyDays || '' },
        { key: 'perDay', get: (c) => F(c).policyPerDay || '' },
        { key: 'total', get: (c) => (Number(F(c).policyDays) || 0) * (Number(F(c).policyPerDay) || 0) || F(c).policyPremium || '' },
        { key: 'agency', get: (c) => F(c).policyAgency || F(c).policyAgent || '' },
        { key: 'pstatus', get: (c) => F(c).policyStatus || '' },
      ],
    }),
  },
  {
    no: '104', group: 'clients', label: 'פוליסות לפי ת. התחלה וסיום',
    desc: 'כל פוליסה שהייתה בתוקף — ולו ליום אחד — בתוך התקופה שתבחרו.',
    params: ['range'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' },
      { key: 'policyNo', label: 'מספר פוליסה', ltr: true },
      { key: 'insurer', label: 'חברה' }, { key: 'plan', label: 'מסלול' },
      { key: 'start', label: 'התחלה', type: 'date', strong: true },
      { key: 'end', label: 'סיום', type: 'date', strong: true },
      { key: 'days', label: 'ימים בתוקף', type: 'num' }, { key: 'pstatus', label: 'סטטוס', type: 'pill' }],
    run: (cases, params) => {
      const { from, to } = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const f = F(c);
        const start = parseDate(f.policyStart);
        const end = parseDate(f.policyEnd);
        if (!start && !end) continue;
        // Overlap, not containment: a policy running across the window counts.
        if (to && start && start > to) continue;
        if (from && end && end < from) continue;
        const days = start && end ? Math.max(0, Math.round((end - start) / DAY)) : '';
        out.push({
          ...familyRow(c), policyNo: f.policyNo || '',
          insurer: f.policyInsurer || f.insuranceCompany || '', plan: f.policyPlan || '',
          start: f.policyStart || '', end: f.policyEnd || '', days,
          pstatus: f.policyStatus || '', when: start || end,
        });
      }
      return out.sort((a, b) => (a.when || 0) - (b.when || 0));
    },
  },
  {
    no: '105', group: 'clients', label: 'דוח היתרים שהוגשו',
    desc: 'בקשות להיתר העסקה שהוגשו בתקופה, עם סטטוס הבקשה.',
    params: ['range'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' }, COL.city,
      whenCol('ת. הגשה'), { key: 'pstatus', label: 'סטטוס הבקשה', type: 'pill' },
      { key: 'permitNumber', label: 'מספר היתר', ltr: true },
      { key: 'pstart', label: 'תחילת ההיתר', type: 'date' }, { key: 'pend', label: 'סיום ההיתר', type: 'date' },
      COL.rakaz],
    run: dateReport({
      base: familyRow,
      field: 'permitSubmitDate',
      extra: [
        { key: 'pstatus', get: (c) => F(c).permitStatus || 'הוגש' },
        { key: 'permitNumber', get: (c) => F(c).permitNumber || '' },
        { key: 'pstart', get: (c) => F(c).permitStart || '' },
        { key: 'pend', get: (c) => F(c).permitEnd || F(c).permitExpiry || '' },
      ],
    }),
  },

  // ---- 201–251 · ביקורים והערות ------------------------------------------
  {
    no: '201', group: 'visits', label: 'ביקורים/הערות על פי חתך',
    desc: 'כל הביקורים וההערות שנרשמו בתקופה, עם סינון לפי רכז/ת.',
    params: ['range', 'rakaz'],
    columns: [COL.caseNo, whenCol('תאריך'), { key: 'what', label: 'סוג' },
      { key: 'note', label: 'הערה' }, COL.family, COL.worker, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        for (const v of (F(c).visits || [])) {
          const d = parseDate(v.date);
          if (!w.has(d)) continue;
          out.push({ ...familyRow(c), when: d, what: v.type || 'ביקור', note: v.note || '' });
        }
        for (const n of (F(c).notes || [])) {
          const d = parseDate(n.date);
          if (!w.has(d)) continue;
          out.push({ ...familyRow(c), when: d, what: 'הערה', note: n.text || n.note || '' });
        }
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '202', group: 'visits', label: 'תחזית ביקורי עובד סוציאלי',
    desc: 'מה מגיע ברבעון: ביקור השמה, ביקור 30 יום וביקורים שוטפים כל חצי שנה.',
    params: ['quarter'], render: 'social',
  },
  {
    no: '203', group: 'visits', label: 'ביקורי עובד סוציאלי שבוצעו',
    desc: 'רק הביקורים שכבר בוצעו בפועל, עם התאריך שבו העו״ס באמת ביקר/ה.',
    params: ['range', 'channel'],
    columns: [COL.caseNo, COL.worker, COL.family, COL.city,
      { key: 'what', label: 'סוג הביקור' }, { key: 'channel', label: 'אופן', type: 'pill' },
      { key: 'due', label: 'מועד יעד', type: 'date' }, whenCol('בוצע בתאריך'),
      { key: 'note', label: 'הערה' }],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const v of buildVisitReport(activePlacements(byRakaz(cases, params.rakaz)))) {
        if (!v.done || !w.has(v.doneDate)) continue;
        if (params.channel && v.channel.key !== params.channel) continue;
        out.push({
          id: v.rowId, caseObj: v.caseObj, caseNumber: v.caseNumber,
          worker: v.workerName, family: v.familyName, city: v.city,
          what: v.kind.label, channel: v.channel.label, due: v.due, when: v.doneDate, note: v.note,
        });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: '251', group: 'visits', label: 'טפסים דיגיטלים',
    desc: 'כל טופס שנשלח לחתימה — מתי יצא, למי, ומתי חזר חתום.',
    note: 'הרשימה מגיעה ממערכת החתימות עצמה, כך שאין מה לרשום פעמיים.',
    params: ['range'], source: 'forms',
    columns: [
      { key: 'sentAt', label: 'ת.שליחה', type: 'date', strong: true },
      { key: 'title', label: 'שם טופס', type: 'strong' },
      { key: 'setName', label: 'שם סט' },
      { key: 'sentTo', label: 'נשלח אל' },
      { key: 'progress', label: 'חתימות' },
      { key: 'stateLabel', label: 'מצב', type: 'pill' },
      { key: 'signedAt', label: 'ת.החתימה', type: 'date' },
      { key: 'note', label: 'הערה' },
    ],
    run: (_cases, params, extra) => {
      const w = windowOf(params);
      return (extra?.forms || [])
        .filter((f) => w.has(parseDate(f.sentAt)))
        .map((f) => ({
          ...f,
          progress: `${f.signedCount}/${f.signerCount}`,
          stateLabel: f.state.label,
          tone: f.state.tone,
        }))
        .sort((a, b) => parseDate(b.sentAt) - parseDate(a.sentAt));
    },
  },

  // ---- 301–305 · רבעוניים -------------------------------------------------
  {
    // The quarterly report filed with משרד הפנים: which placements the social
    // worker visited this quarter. Exports the official government Excel.
    no: '301', group: 'quarterly', label: 'דוח ביקורים רבעוני (למשרד הפנים)',
    desc: 'כל הביקורים ברבעון, ויצוא הדוח הרבעוני הרשמי למשרד הפנים.',
    note: 'הקובץ נוצר מהתבנית הממשלתית עצמה, כולל גיליון הצהרת המנהלים, ומוכן להגשה.',
    params: ['quarter'], render: 'social', interior: true,
  },
  {
    no: '301.1', group: 'quarterly', label: 'דוח ביקורים רבעוני טלפוני',
    desc: 'רק הביקורים שבוצעו טלפונית.',
    params: ['quarter'], render: 'social', channel: 'phone',
  },
  {
    no: '301.2', group: 'quarterly', label: 'דוח ביקורים רבעוני דיגיטלי',
    desc: 'רק הביקורים שבוצעו דיגיטלית.',
    params: ['quarter'], render: 'social', channel: 'digital',
  },
  {
    no: '302', group: 'quarterly', label: 'דוח השמות רבעוני',
    desc: 'כל ההשמות שהתחילו ברבעון.',
    params: ['quarter'],
    columns: [COL.caseNo, COL.worker, COL.passport, COL.nationality, COL.family, COL.city,
      whenCol('תחילת העסקה'), { key: 'salary', label: 'שכר', type: 'money' }, COL.rakaz],
    run: (cases, params) => {
      const q = params.quarterRange;
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        const d = parseDate(F(c).startDate);
        if (!d || !q || d < q.from || d > q.to) continue;
        out.push({ ...workerRow(c), when: d, salary: F(c).salary || '' });
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    // A "מנה" is the quarter's batch of visits filed to מת״ש. Which quarters
    // have been filed is not tracked yet, so this stays informational — the
    // actual filing is done from 305.
    no: '303', group: 'quarterly', label: 'דוח מנות ששודרו',
    desc: 'המנות (רבעונים) שכבר שודרו למת״ש.',
    params: ['quarter'], soon: 'מעקב אחר רבעונים שכבר שודרו — ייבנה בהמשך. השידור עצמו נעשה בדוח 305.',
  },
  {
    no: '304', group: 'quarterly', label: 'דוח מנות שצריך לשדר',
    desc: 'המנות (רבעונים) שעדיין ממתינות לשידור.',
    params: ['quarter'], soon: 'מעקב אחר רבעונים שממתינים לשידור — ייבנה בהמשך. השידור עצמו נעשה בדוח 305.',
  },
  {
    no: '305', group: 'quarterly', label: 'שידור קבוצתי למת״ש',
    desc: 'הפקת קובץ השידור הקבוצתי ושליחתו למת״ש.',
    params: ['quarter'], soon: 'מת״ש הוא יעד נפרד ממשרד הפנים — צריך לראות את מבנה הקובץ ולאן נשלח.',
  },

  // ---- 401–406 · חשבוניות -------------------------------------------------
  {
    no: '401', group: 'invoices', label: 'חשבוניות/קבלות חתך',
    desc: 'כל מסמכי החיוב בתקופה, לפי חתך.',
    params: ['range'],
  },
  {
    no: '402', group: 'invoices', label: 'חשבונית מס/קבלה',
    desc: 'הפקת חשבונית מס/קבלה.',
    params: ['range'],
  },
  {
    no: '403', group: 'invoices', label: 'חשבונית מס',
    desc: 'הפקת חשבונית מס.',
    params: ['range'],
  },
  {
    no: '404', group: 'invoices', label: 'חשבונית זיכוי',
    desc: 'הפקת חשבונית זיכוי.',
    params: ['range'],
  },
  {
    no: '405', group: 'invoices', label: 'קבלה',
    desc: 'כל הקבלות שהופקו בתקופה, כולל פירוט מע״מ.',
    params: ['range', 'rakaz'],
    columns: [whenCol('תאריך'), { key: 'family', label: 'שם', type: 'strong', link: 'family' },
      { key: 'amount', label: 'סכום', type: 'money', strong: true },
      { key: 'net', label: 'לפני מע״מ', type: 'money' }, { key: 'vat', label: 'מע״מ', type: 'money' },
      { key: 'method', label: 'אמצעי תשלום', type: 'pill' }, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        for (const p of (F(c).payments || [])) {
          const d = parseDate(p.date);
          if (!w.has(d)) continue;
          const amount = Number(p.amount) || 0;
          const net = Math.round((amount / 1.17) * 100) / 100;
          out.push({
            ...familyRow(c), id: p.id, when: d, amount,
            net, vat: Math.round((amount - net) * 100) / 100, method: p.method || '',
          });
        }
      }
      return out.sort((a, b) => a.when - b.when);
    },
    totals: ['amount', 'net', 'vat'],
  },
  {
    no: '406', group: 'invoices', label: 'יצוא קובץ להנה״ח',
    desc: 'קובץ תנועות (Movein.dat) לתוכנת הנהלת החשבונות — שוטף / לפי תאריך / דוח מלא.',
  },

  // ---- אישיים ------------------------------------------------------------
  {
    no: 'א1', group: 'personal', label: 'עובדים פנויים',
    desc: 'עובדים ועובדות שאינם מושמים כרגע ומחכים להשמה.',
    params: ['rakaz'],
    columns: [COL.caseNo, COL.worker, COL.passport, COL.nationality, COL.phone,
      { key: 'visaExpiry', label: 'תוקף אשרה', type: 'date' }, COL.status, COL.rakaz],
    run: (cases, params) => {
      const placed = new Set(activePlacements(cases).map((c) => c.id));
      return byRakaz(cases, params.rakaz)
        .filter((c) => (workerName(c) && !placed.has(c.id)))
        .map((c) => ({ ...workerRow(c), visaExpiry: F(c).visaExpiry || '' }))
        .sort((a, b) => a.worker.localeCompare(b.worker, 'he'));
    },
  },
  {
    no: 'א2', group: 'personal', label: 'לקוחות מעסיקים',
    desc: 'הלקוחות שמעסיקים עובד/ת כרגע.',
    params: ['rakaz'],
    columns: [COL.caseNo, { key: 'family', label: 'מעסיק', type: 'strong', link: 'family' }, COL.city,
      COL.phone, COL.worker, { key: 'since', label: 'מתחילת', type: 'date' }, COL.rakaz],
    run: (cases, params) => byRakaz(activePlacements(cases), params.rakaz)
      .map((c) => ({ ...familyRow(c), since: F(c).startDate || '' }))
      .sort((a, b) => a.family.localeCompare(b.family, 'he')),
  },
  {
    no: 'א3', group: 'personal', label: 'ביקורי החודש',
    desc: 'הביקורים שבוצעו החודש, לפי רכז/ת.',
    params: ['range', 'rakaz'],
    columns: [COL.caseNo, whenCol('תאריך'), { key: 'what', label: 'סוג' },
      COL.family, COL.worker, { key: 'note', label: 'הערה' }, COL.rakaz],
    run: (cases, params) => {
      const w = windowOf(params);
      const out = [];
      for (const c of byRakaz(cases, params.rakaz)) {
        for (const v of (F(c).visits || [])) {
          const d = parseDate(v.date);
          if (!w.has(d)) continue;
          out.push({ ...familyRow(c), when: d, what: v.type || 'ביקור', note: v.note || '' });
        }
      }
      return out.sort((a, b) => a.when - b.when);
    },
  },
  {
    no: 'א4', group: 'personal', label: 'הפניות החודש',
    desc: 'כמה הפניות נפתחו בתקופה, ומי טיפל/ה בהן.',
    params: ['range', 'rakaz'],
    columns: [whenCol('ת. ההפניה'), { key: 'family', label: 'לקוח', type: 'strong', link: 'family' },
      COL.city, { key: 'source', label: 'גורם מפנה' }, COL.status, COL.rakaz],
    run: dateReport({
      base: familyRow,
      field: (c) => F(c).referralDate || F(c).openDate || F(c).created_at,
      extra: [{ key: 'source', get: (c) => F(c).referrer || F(c).referralSource || '' }],
    }),
  },
  {
    no: 'א5', group: 'personal', label: 'התחלות עמדה החודש',
    desc: 'השמות שהתחילו בתקופה.',
    params: ['range', 'rakaz'],
    columns: [COL.caseNo, whenCol('תחילת עבודה'), COL.worker, COL.family, COL.city,
      { key: 'salary', label: 'שכר', type: 'money' }, COL.rakaz],
    run: dateReport({
      field: 'startDate',
      extra: [{ key: 'salary', get: (c) => F(c).salary || '' }],
    }),
  },
  {
    no: 'א6', group: 'personal', label: 'סיום עמדה החודש',
    desc: 'השמות שהסתיימו בתקופה, עם סיבת הסיום.',
    params: ['range', 'rakaz'],
    columns: [COL.caseNo, whenCol('ת. סיום'), COL.worker, COL.family, COL.city,
      { key: 'reason', label: 'סיבת סיום' }, COL.rakaz],
    run: dateReport({
      field: (c) => F(c).endDate || F(c).placementEndDate || F(c).closedDate,
      extra: [{ key: 'reason', get: (c) => F(c).endReason || F(c).closeReason || '' }],
    }),
  },
  {
    no: 'א7', group: 'personal', label: 'השמות 3-10',
    desc: 'כמה סגירות עשה כל רכז/ת בתקופה — שורה אחת לכל רכז/ת.',
    note: 'גרסה ראשונה — נדייק אחרי שנראה את המסך המקורי.',
    params: ['range'],
    columns: [{ key: 'rakaz', label: 'רכז/ת', type: 'strong' },
      { key: 'closings', label: 'סגירות', type: 'num', strong: true },
      { key: 'started', label: 'התחילו עבודה', type: 'num' },
      { key: 'ended', label: 'סיימו', type: 'num' }],
    run: (cases, params) => {
      const w = windowOf(params);
      const map = new Map();
      const bump = (who, key) => {
        const k = who || '(ללא רכז/ת)';
        if (!map.has(k)) map.set(k, { id: k, rakaz: k, closings: 0, started: 0, ended: 0 });
        map.get(k)[key]++;
      };
      for (const c of cases) {
        const f = F(c);
        const who = f.assignedTo;
        const start = parseDate(f.startDate);
        const end = parseDate(f.endDate || f.placementEndDate || f.closedDate);
        if (w.has(start)) { bump(who, 'started'); bump(who, 'closings'); }
        if (w.has(end)) bump(who, 'ended');
      }
      return [...map.values()].sort((a, b) => b.closings - a.closings);
    },
  },

  // ---- דוחות המשרד --------------------------------------------------------
  {
    no: 'מ1', group: 'office', label: 'הכנסות',
    desc: 'כמה כסף נכנס בתקופה, לפני ואחרי מע״מ.',
    params: ['range'], render: 'income',
  },
  {
    no: 'מ2', group: 'office', label: 'חידושים ותשלומים',
    desc: 'ויזה, דרכון, ביטוח, היתר, תאגיד ותשלומי העובד/ת בתקופה.',
    params: ['range'], render: 'due',
  },
  {
    no: 'מ3', group: 'office', label: 'השמות פעילות',
    desc: 'כל העובדים המועסקים כרגע.',
    params: [], render: 'placements',
  },
  {
    no: 'מ4', group: 'office', label: 'יומן פגישות',
    desc: 'כל הביקורים, החידושים והפגישות על לוח שנה חודשי.',
    params: [], render: 'calendar',
  },
];


// ---------------------------------------------------------------------------
// Statistical reports — "ריכוז X לפי Y"
// ---------------------------------------------------------------------------
// Every one of these is the same question: take a population, group it by one
// field, and count. So there is one engine and a table of what to group.

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const monthKey = (v) => {
  const d = parseDate(v);
  if (!d) return '';
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};
const dayKey = (v) => {
  const d = parseDate(v);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// The populations a statistical report can count.
const POPULATIONS = {
  // one entry per caregiver file
  workers: (cases, w) => cases
    .filter((c) => workerName(c))
    .filter((c) => !w.from || w.has(parseDate(F(c).startDate)) || !F(c).startDate),
  // one entry per client file
  clients: (cases) => cases.filter((c) => familyName(c)),
  // one entry per recorded visit
  visits: (cases, w) => cases.flatMap((c) => (F(c).visits || [])
    .filter((v) => w.has(parseDate(v.date)))
    .map((v) => ({ c, v, date: parseDate(v.date) }))),
  // one entry per placement / referral
  referrals: (cases, w) => cases
    .filter((c) => w.has(parseDate(F(c).referralDate || F(c).startDate))),
  // one entry per payment document
  invoices: (cases, w) => cases.flatMap((c) => (F(c).payments || [])
    .filter((p) => w.has(parseDate(p.date)))
    .map((p) => ({ c, p, date: parseDate(p.date) }))),
};

// Sort so the biggest group is first, but keep date-like groupings in order.
function tally(items, keyOf2, { chronological = false } = {}) {
  const map = new Map();
  for (const it of items) {
    const k = keyOf2(it) || '(לא צוין)';
    if (!map.has(k)) map.set(k, { id: k, group: k, count: 0, first: it });
    map.get(k).count++;
  }
  const rows = [...map.values()];
  const total = rows.reduce((n, r) => n + r.count, 0) || 1;
  for (const r of rows) { r.pct = Math.round((r.count / total) * 1000) / 10; delete r.first; }
  if (chronological) {
    rows.sort((a, b) => String(a.group).localeCompare(String(b.group), 'he'));
  } else {
    rows.sort((a, b) => b.count - a.count || String(a.group).localeCompare(String(b.group), 'he'));
  }
  return rows;
}

// The chart above the table already carries the magnitude, so the table stays
// a table: the value, and what share of the whole it is.
const STAT_COLUMNS = (label) => [
  { key: 'group', label, type: 'strong' },
  { key: 'count', label: 'כמות', type: 'num', strong: true },
  { key: 'pct', label: 'אחוז', type: 'pct' },
];

function statReport({ no, label, population, groupBy, groupLabel, chronological, desc }) {
  return {
    no: String(no), group: 'stats', label,
    desc: desc || `כמה ${label.replace('ריכוז ', '')} — שורה לכל ערך, עם כמות ואחוז.`,
    params: ['range'],
    columns: STAT_COLUMNS(groupLabel),
    totals: [],
    run: (cases, params) => {
      const w = windowOf(params);
      const items = POPULATIONS[population](byRakaz(cases, params.rakaz), w);
      return tally(items, groupBy, { chronological });
    },
  };
}

const STATS = [
  // ---- 11–18 · עובדים ----------------------------------------------------
  statReport({ no: 11, label: 'ריכוז עובדים לפי סניף', population: 'workers', groupLabel: 'סניף', groupBy: (c) => F(c).branch }),
  statReport({ no: 12, label: 'ריכוז עובדים לפי סטטוס', population: 'workers', groupLabel: 'סטטוס', groupBy: (c) => F(c).workerStatus }),
  statReport({ no: 13, label: 'ריכוז עובדים לפי רכז/ת', population: 'workers', groupLabel: 'רכז/ת', groupBy: (c) => F(c).assignedTo }),
  statReport({ no: 14, label: 'ריכוז עובדים לפי סיבת סיום', population: 'workers', groupLabel: 'סיבת סיום', groupBy: (c) => F(c).endReason || F(c).closeReason }),
  statReport({ no: 15, label: 'ריכוז עובדים לפי חברת ביטוח', population: 'workers', groupLabel: 'חברת ביטוח', groupBy: (c) => F(c).policyInsurer || F(c).insuranceCompany }),
  statReport({ no: 16, label: 'ריכוז עובדים לפי תאריך פתיחה', population: 'workers', groupLabel: 'חודש פתיחה', chronological: true, groupBy: (c) => monthKey(F(c).startDate) }),
  statReport({ no: 17, label: 'ריכוז עובדים לפי ישוב', population: 'workers', groupLabel: 'ישוב', groupBy: (c) => c.family?.city || F(c).city }),
  statReport({ no: 18, label: 'ריכוז עובדים לפי אזרחות', population: 'workers', groupLabel: 'אזרחות', groupBy: (c) => c.worker?.nationality || F(c).nationality }),

  // ---- 31–37 · לקוחות ----------------------------------------------------
  statReport({ no: 31, label: 'ריכוז לקוחות לפי סניף', population: 'clients', groupLabel: 'סניף', groupBy: (c) => F(c).branch }),
  statReport({ no: 32, label: 'ריכוז לקוחות לפי סטטוס', population: 'clients', groupLabel: 'סטטוס', groupBy: (c) => F(c).caseStatus }),
  statReport({ no: 33, label: 'ריכוז לקוחות לפי תאריך פתיחה', population: 'clients', groupLabel: 'חודש פתיחה', chronological: true, groupBy: (c) => monthKey(F(c).openDate || F(c).referralDate) }),
  statReport({ no: 35, label: 'ריכוז לקוחות לפי ישוב', population: 'clients', groupLabel: 'ישוב', groupBy: (c) => c.family?.city || F(c).city }),
  statReport({ no: 36, label: 'ריכוז לקוחות לפי נותן הזכאות', population: 'clients', groupLabel: 'נותן הזכאות', groupBy: (c) => F(c).eligibilityBy || F(c).payer }),
  statReport({ no: 37, label: 'ריכוז לקוחות מעסיקים לפי חודש', population: 'clients', groupLabel: 'חודש תחילת העסקה', chronological: true, groupBy: (c) => monthKey(F(c).startDate) }),

  // ---- 62–68 · ביקורים ---------------------------------------------------
  statReport({ no: 62, label: 'ריכוז ביקורים לפי סניף', population: 'visits', groupLabel: 'סניף', groupBy: (x) => F(x.c).branch }),
  statReport({ no: 64, label: 'ריכוז ביקורים לפי רכז/ת', population: 'visits', groupLabel: 'רכז/ת', groupBy: (x) => F(x.c).assignedTo }),
  statReport({ no: 67, label: 'ריכוז ביקורים לפי תאריך', population: 'visits', groupLabel: 'תאריך', chronological: true, groupBy: (x) => dayKey(x.date) }),
  statReport({ no: 68, label: 'ריכוז ביקורים לפי חודש', population: 'visits', groupLabel: 'חודש', chronological: true, groupBy: (x) => monthKey(x.date) }),

  // ---- 81–88 · הפניות ----------------------------------------------------
  statReport({ no: 81, label: 'ריכוז הפניות לפי סניף', population: 'referrals', groupLabel: 'סניף', groupBy: (c) => F(c).branch }),
  statReport({ no: 82, label: 'ריכוז הפניות לפי סטטוס', population: 'referrals', groupLabel: 'סטטוס', groupBy: (c) => F(c).referralStatus || F(c).caseStatus }),
  statReport({ no: 83, label: 'ריכוז הפניות לפי רכז/ת', population: 'referrals', groupLabel: 'רכז/ת', groupBy: (c) => F(c).assignedTo }),
  statReport({ no: 84, label: 'ריכוז הפניות לפי סוג השמה', population: 'referrals', groupLabel: 'סוג השמה', groupBy: (c) => F(c).placementType }),
  statReport({ no: 85, label: 'ריכוז הפניות לפי תאריך הפניה', population: 'referrals', groupLabel: 'חודש הפניה', chronological: true, groupBy: (c) => monthKey(F(c).referralDate || F(c).startDate) }),
  statReport({ no: 86, label: 'ריכוז הפניות לפי סיבת סיום', population: 'referrals', groupLabel: 'סיבת סיום', groupBy: (c) => F(c).endReason || F(c).closeReason }),
  statReport({ no: 87, label: 'ריכוז הפניות לפי סניף מפורט', population: 'referrals', groupLabel: 'סניף · סטטוס', groupBy: (c) => `${F(c).branch || '—'} · ${F(c).referralStatus || F(c).caseStatus || '—'}` }),
  statReport({ no: 88, label: 'ריכוז הפניות לפי סניף ורכז מפורט', population: 'referrals', groupLabel: 'סניף · רכז/ת', groupBy: (c) => `${F(c).branch || '—'} · ${F(c).assignedTo || '—'}` }),

  // ---- 931–935 · חשבוניות ------------------------------------------------
  statReport({ no: 931, label: 'ריכוז חשבוניות לפי חודש', population: 'invoices', groupLabel: 'חודש', chronological: true, groupBy: (x) => monthKey(x.date) }),
  statReport({ no: 932, label: 'ריכוז חשבוניות לפי סניף', population: 'invoices', groupLabel: 'סניף', groupBy: (x) => F(x.c).branch }),
  statReport({ no: 933, label: 'ריכוז חשבוניות לפי מ.לקוח', population: 'invoices', groupLabel: 'לקוח', groupBy: (x) => familyName(x.c) }),
  statReport({ no: 935, label: 'ריכוז חשבוניות לפי סוג', population: 'invoices', groupLabel: 'אמצעי תשלום', groupBy: (x) => x.p.method }),

  // ---- 201–206 · טפסים ו־SMS ---------------------------------------------
  {
    no: '201', group: 'stats', label: 'ריכוז טפסים חתומים לפי חודש',
    desc: 'כמה טפסים נחתמו בכל חודש.',
    params: ['range'], source: 'forms',
    columns: STAT_COLUMNS('חודש'),
    run: (_cases, params, extra) => {
      const w = windowOf(params);
      const done = (extra?.forms || []).filter((f) => f.signedAt && w.has(parseDate(f.signedAt)));
      return tally(done, (f) => monthKey(f.signedAt), { chronological: true });
    },
  },
  {
    no: '202', group: 'stats', label: 'ריכוז SMS לפי רכז',
    desc: 'כמה הודעות SMS נשלחו על ידי כל רכז/ת.',
    params: ['range'], soon: 'המערכת שולחת היום בוואטסאפ ובמייל, לא ב־SMS.',
  },
  {
    no: '203', group: 'stats', label: 'ריכוז SMS לפי חודש',
    desc: 'כמה הודעות SMS נשלחו בכל חודש.',
    params: ['range'], soon: 'המערכת שולחת היום בוואטסאפ ובמייל, לא ב־SMS.',
  },
  {
    no: '205', group: 'stats', label: 'ריכוז SMS קבוצתי',
    desc: 'משלוחי SMS קבוצתיים.',
    params: ['range'], soon: 'המערכת שולחת היום בוואטסאפ ובמייל, לא ב־SMS.',
  },
  {
    no: '206', group: 'stats', label: 'ריכוז SMS הודעות',
    desc: 'תוכן ההודעות שנשלחו.',
    params: ['range'], soon: 'המערכת שולחת היום בוואטסאפ ובמייל, לא ב־SMS.',
  },
];

R.push(...STATS);

// A stable ASCII key per report, used in the URL (#report/<key>). The numbered
// reports keep their number; the personal and office ones get a p/o prefix,
// because a Hebrew letter in a hash would have to survive URL encoding.
// Numbers repeat across groups (201 is both a visits report and a forms tally),
// and the personal ones are numbered in Hebrew, which a URL would have to
// encode. So the key carries the group's letter as well as the number.
const KEY_PREFIX = { personal: 'p', office: 'o', stats: 's' };
const keyOf = (r, i) => {
  const prefix = KEY_PREFIX[r.group] || 'r';
  const num = String(r.no).replace(/\./g, '_');
  return /^[\w.]+$/.test(num) ? prefix + num : prefix + (i + 1);
};

export const REPORT_GROUPS = [
  { id: 'workers', title: 'דוחות עובדים', icon: '👷', scope: 'כלליים' },
  { id: 'clients', title: 'דוחות לקוחות', icon: '🏠', scope: 'כלליים' },
  { id: 'visits', title: 'דוחות ביקורים/הערות', icon: '🧑‍⚕️', scope: 'כלליים' },
  { id: 'quarterly', title: 'דוחות רבעוניים', icon: '📆', scope: 'כלליים' },
  { id: 'invoices', title: 'דוחות חשבוניות', icon: '🧾', scope: 'כלליים' },
  { id: 'personal', title: 'דוחות אישיים', icon: '👤', scope: 'לפי רכז/ת' },
  { id: 'office', title: 'דוחות המשרד', icon: '📊', scope: 'כלליים' },
  { id: 'stats', title: 'דוחות סטטיסטיים', icon: '📈', scope: 'ריכוזים' },
].map((g) => ({
  ...g,
  reports: R.filter((r) => r.group === g.id).map((r, i) => ({
    ...r, key: keyOf(r, i),
    // The invoicing reports open the tax-documents desk, not a params page.
    ...(g.id === 'invoices' ? { to: '#invoices' } : {}),
  })),
}));

export const REPORTS = Object.fromEntries(
  REPORT_GROUPS.flatMap((g) => g.reports).map((r) => [r.key, r]),
);

// Run a report and hand back its rows. Quarter reports get the quarter's own
// date range attached, so a report can be written against either shape.
export function runReport(report, cases, params, extra) {
  if (!report.run) return [];
  const p = { ...params };
  if (p.quarter) {
    const [y, q] = String(p.quarter).split('-Q');
    const range = quarterRange(Number(y), Number(q));
    p.quarterRange = range;
    p.from = p.from || range.from.toISOString().slice(0, 10);
    p.to = p.to || range.to.toISOString().slice(0, 10);
  }
  if (report.channel) p.channel = report.channel;
  return report.run(cases, p, extra);
}

export { VISIT_CHANNELS };
