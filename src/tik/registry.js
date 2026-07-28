// Data layer for the Source Registry (#registry): search every family/worker
// that ever came through the chat, and a renewals report that flags anything
// approaching its expiry (permit, visa, passport, insurance, the annual
// company-fee renewal). Reuses the same cases loadCases() reads from
// (agent_submissions merged by mergeHalves), so no separate table is needed.
import { createClient } from '@supabase/supabase-js';
import { loadCases } from './casesBoard.js';
import { recordsFromChat } from './chatRecords.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// mergeHalves only joins the two halves of a split link. Two *full* submissions
// for the same person (same passport, e.g. the name typed slightly differently
// each time) both survive it, so the same worker shows up twice. Fold those
// together here: newest row wins, older rows fill in whatever it is missing.
//
// Merging is deliberately cautious. A placeholder identifier — 000000000 in the
// employer's ID field, a passport typed as "0" — is not an identity, and
// treating it as one collapses every unrelated file that shares it into a
// single row. Two files also stay apart when they disagree on an identifier
// they both carry: the same caregiver placed with two different families is
// two placements, not one file entered twice.

// An identifier only counts if it could plausibly belong to one person:
// long enough, and not the same character repeated.
function realId(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length < 5) return '';
  if (/^(\d)\1*$/.test(digits)) return '';   // 000000000, 111111111
  return digits;
}
function realPassport(v) {
  const t = String(v || '').replace(/[\s-]/g, '').toUpperCase();
  if (t.length < 5) return '';
  if (!/\d/.test(t)) return '';               // a passport always carries digits
  if (/^(.)\1*$/.test(t)) return '';
  return t;
}

const dedupeKey = (c) => {
  const f = c.data?.fields || {};
  const pass = realPassport(f.passportNo);
  if (pass) return `p:${pass}`;
  const id = realId(f.idNumber);
  if (id) return `i:${id}`;
  return null;
};

// Two rows may only merge if nothing they both state contradicts.
function compatible(a, b) {
  const fa = a.data?.fields || {};
  const fb = b.data?.fields || {};
  const pairs = [
    [realPassport(fa.passportNo), realPassport(fb.passportNo)],
    [realId(fa.idNumber), realId(fb.idNumber)],
  ];
  return pairs.every(([x, y]) => !x || !y || x === y);
}

export function dedupeCases(cases) {
  const byKey = new Map();
  const out = [];
  for (const c of cases) {
    const key = dedupeKey(c);
    if (!key) { out.push(c); continue; }
    const groups = byKey.get(key);
    if (!groups) { byKey.set(key, [[c]]); out.push(c); continue; }
    // Within a key, a row joins the first group it does not contradict;
    // otherwise it stands on its own.
    const home = groups.find((g) => g.every((other) => compatible(c, other)));
    if (home) home.push(c);
    else { groups.push([c]); out.push(c); }
  }

  const groupFor = (c) => {
    const key = dedupeKey(c);
    if (!key) return null;
    return (byKey.get(key) || []).find((g) => g.includes(c)) || null;
  };

  return out.map((c) => {
    const group = groupFor(c);
    if (!group || group.length < 2) return c;
    // Newest first; earlier rows only fill blanks so nothing already known is lost.
    const ordered = [...group].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const fields = {};
    for (const r of [...ordered].reverse()) {
      for (const [k, v] of Object.entries(r.data?.fields || {})) {
        if (v != null && v !== '') fields[k] = v;
      }
    }
    const files = ordered.flatMap((r) => r.data?.files || []);
    const primary = ordered[0];
    return {
      ...primary,
      ids: [...new Set(ordered.flatMap((r) => r.ids || [r.id]))],
      duplicateOf: group.length,
      data: { ...primary.data, fields, files },
    };
  });
}

// Load every case and attach the ready-to-display family/worker records.
export async function loadRegistry() {
  const cases = dedupeCases(await loadCases());
  for (const c of cases) {
    const { worker, family } = recordsFromChat(c.data?.fields || {});
    c.worker = worker;
    c.family = family;
  }
  return cases;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s-]/g, '');

export function searchFamilies(cases, q) {
  const s = norm(q);
  const list = cases.filter((c) => c.family?.fullName);
  if (!s) return list;
  return list.filter((c) => {
    const f = c.family;
    return [f.fullName, f.idNumber, f.phone, f.mobile, f.city, f.street]
      .some((v) => norm(v).includes(s));
  });
}

export function searchWorkers(cases, q) {
  const s = norm(q);
  const list = cases.filter((c) => c.worker?.nameHe || c.worker?.nameEn);
  if (!s) return list;
  return list.filter((c) => {
    const w = c.worker;
    return [w.nameHe, w.nameEn, w.passportNo, w.phone, w.nationality]
      .some((v) => norm(v).includes(s));
  });
}

// ---- Renewals report ----------------------------------------------------------
// Each type reads a date from the case's fields. Non-manual types (collected via
// document scan during the chat) are only shown once a date exists. Manual types
// (not collected anywhere yet) are always shown per case, with an empty state the
// office can fill in.
export const RENEWAL_TYPES = [
  { key: 'visaExpiry', label: 'תוקף ויזה / אשרה', short: 'ס.אשרה', icon: '🛂', months: 2 },
  { key: 'passportExpiry', label: 'תוקף דרכון', short: 'ס.דרכון', icon: '📕', years: 2 },
  { key: 'insuranceExpiry', label: 'תוקף ביטוח רפואי', short: 'ס.ביטוח', icon: '🏥', days: 10, manual: true },
  { key: 'permitExpiry', label: 'תוקף היתר העסקה', short: 'ס.היתר', icon: '📋', months: 3 },
  { key: 'companyFeeRenewalDate', label: 'חידוש דמי תאגיד', short: 'ס.תאגיד', icon: '💳', days: 10, manual: true },
];

// The worker pays the agency in three instalments, counted from the day they
// land in Israel: on arrival, then after 26 months, then after 38 months.
// These dates aren't stored anywhere — they're derived from the arrival date.
export const WORKER_PAYMENTS = [
  { key: 'wpay1', number: 1, label: 'תשלום עובד/ת 1 — בהגעה', short: 'ת.עובד 1', afterMonths: 0 },
  { key: 'wpay2', number: 2, label: 'תשלום עובד/ת 2 — 26 חודשים', short: 'ת.עובד 2', afterMonths: 26 },
  { key: 'wpay3', number: 3, label: 'תשלום עובד/ת 3 — 38 חודשים', short: 'ת.עובד 3', afterMonths: 38 },
];

// The worker's three instalments — but the agency only collects the ones that
// fall WHILE the worker is placed with us (i.e. registered in our תאגיד). A
// worker who transferred to us after, say, 28 months never owes us instalments
// 1 (arrival) or 2 (26 months) — only the ones due on or after they joined.
// The instalment clock runs from arrival; "joined us" is the placement start.
export function workerPaymentPlan(fields, today) {
  const t = today || todayStart();
  const f = fields || {};
  const arrival = parseDate(f.arrivalDate || f.startDate);
  const joinedUs = parseDate(f.startDate || f.arrivalDate);
  if (!arrival) return { installments: [], owed: [], next: null, allPaid: false, hasOwed: false };
  const done = f.workerPaymentsDone || {};
  const installments = WORKER_PAYMENTS.map((wp) => {
    const due = plusMonths(arrival, wp.afterMonths);
    return {
      key: wp.key, number: wp.number, label: wp.label, due,
      // owed to us only if it falls on/after the worker joined our תאגיד
      owed: !joinedUs || due >= joinedUs,
      paid: !!done[wp.key],
    };
  });
  const owed = installments.filter((x) => x.owed);
  const unpaid = owed.filter((x) => !x.paid).sort((a, b) => a.due - b.due);
  return {
    installments, owed, unpaid,
    next: unpaid[0] || null,
    allPaid: owed.length > 0 && unpaid.length === 0,
    hasOwed: owed.length > 0,
  };
}

// Worker instalments are flagged a month ahead, and again — more urgently —
// in the final week.
const WPAY_ALERT_MONTHS = 1;
const WPAY_WEEK_DAYS = 7;

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function plusMonths(d, n) { const c = new Date(d); c.setMonth(c.getMonth() + n); return c; }
function addMonths(d, n) { const c = new Date(d); c.setMonth(c.getMonth() - n); return c; }
function addYears(d, n) { const c = new Date(d); c.setFullYear(c.getFullYear() - n); return c; }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() - n); return c; }
const DAY = 24 * 60 * 60 * 1000;
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// One row PER CASE, with every renewal type as a column — the way the office's
// own renewals report is laid out (a worker appears once, not once per document).
// Each cell carries its own due date / urgency so it can be coloured on its own.
export function computeRenewalRows(cases) {
  const today = todayStart();
  return cases.map((c) => {
    const f = c.data?.fields || {};
    const cells = {};
    let anyOverdue = false; let anyUrgent = false; let anyMissing = false;
    for (const type of RENEWAL_TYPES) {
      const raw = f[type.key];
      const due = parseDate(raw);
      if (!due) {
        cells[type.key] = { due: null, raw: '', daysLeft: null, overdue: false, urgent: false };
        anyMissing = true;
        continue;
      }
      const alertFrom = type.years ? addYears(due, type.years)
        : type.months ? addMonths(due, type.months)
        : addDays(due, type.days);
      const overdue = due < today;
      const urgent = !overdue && alertFrom <= today;
      if (overdue) anyOverdue = true;
      if (urgent) anyUrgent = true;
      cells[type.key] = {
        due, raw: raw || '', daysLeft: Math.round((due - today) / DAY), overdue, urgent,
      };
    }
    // The worker's instalments collapse into ONE cell: the next payment that
    // is owed to us (falls while the worker is in our תאגיד) and not yet paid.
    // Once every owed instalment is paid, the cell reads "שילם הכל".
    const plan = workerPaymentPlan(f, today);
    if (!plan.hasOwed) {
      cells.wpayNext = { due: null, number: null, none: true, derived: true };
    } else if (plan.allPaid) {
      cells.wpayNext = { due: null, number: null, allPaid: true, derived: true };
    } else {
      const n = plan.next;
      const daysLeft = Math.round((n.due - today) / DAY);
      const overdue = n.due < today;
      const urgent = !overdue && n.due <= plusMonths(today, WPAY_ALERT_MONTHS);
      const thisWeek = !overdue && daysLeft <= WPAY_WEEK_DAYS;
      if (overdue) anyOverdue = true;
      if (urgent) anyUrgent = true;
      cells.wpayNext = { due: n.due, number: n.number, key: n.key, daysLeft, overdue, urgent, thisWeek, paid: false, derived: true };
    }

    // Soonest upcoming date drives the row order.
    const dates = Object.values(cells).map((x) => x.due).filter(Boolean);
    return {
      id: c.id, caseObj: c, cells, anyOverdue, anyUrgent, anyMissing,
      workerName: c.worker?.nameHe || c.worker?.nameEn || '',
      employerName: c.family?.fullName || '',
      passportNo: c.worker?.passportNo || '',
      workerPhone: c.worker?.phone || '',
      employerPhone: c.family?.phone || c.family?.mobile || '',
      arrivalDate: parseDate(f.arrivalDate),
      startDate: parseDate(f.startDate),
      caseNumber: f.caseNumber || '',
      soonest: dates.length ? new Date(Math.min(...dates)) : null,
    };
  }).sort((a, b) => {
    if (a.soonest && b.soonest) return a.soonest - b.soonest;
    if (a.soonest) return -1;
    if (b.soonest) return 1;
    return 0;
  });
}

// Placements that are currently running: a worker is matched to a family, the
// worker hasn't been marked as finished, and the case isn't closed.
export function activePlacements(cases) {
  return cases.filter((c) => {
    const f = c.data?.fields || {};
    const hasWorker = !!(c.worker?.nameHe || c.worker?.nameEn);
    const hasFamily = !!c.family?.fullName;
    const ended = f.workerStatus === 'לא מועסק' || f.workerStatus === 'עזב/ה את הארץ'
      || f.caseStatus === 'סגור' || !!f.closedDate;
    return hasWorker && hasFamily && !ended;
  });
}

// ---- Reports -------------------------------------------------------------------
// Everything that happened, or is due, inside a date range: money collected and
// every renewal / worker instalment falling in the window.
export function buildReport(cases, fromStr, toStr) {
  const from = parseDate(fromStr);
  const to = parseDate(toStr);
  if (to) to.setHours(23, 59, 59, 999);
  const inRange = (d) => d && (!from || d >= from) && (!to || d <= to);

  const income = [];
  let total = 0;
  for (const c of cases) {
    for (const p of (c.data?.fields?.payments || [])) {
      const d = parseDate(p.date);
      if (!inRange(d)) continue;
      const amount = Number(p.amount) || 0;
      total += amount;
      income.push({
        id: p.id, date: d, amount, method: p.method || '',
        who: c.family?.fullName || c.data?.fields?.employerName || '',
        caseObj: c,
      });
    }
  }
  income.sort((a, b) => b.date - a.date);

  const due = [];
  const rows = computeRenewalRows(cases);
  for (const r of rows) {
    for (const t of RENEWAL_TYPES) {
      const cell = r.cells[t.key];
      if (!cell || !inRange(cell.due)) continue;
      due.push({
        id: `${r.id}-${t.key}`, type: t, cell, row: r,
        who: r.workerName || r.employerName, caseObj: r.caseObj,
      });
    }
    // The worker's next owed instalment (one cell, carries its number).
    const wp = r.cells.wpayNext;
    if (wp && wp.due && inRange(wp.due)) {
      due.push({
        id: `${r.id}-wpayNext`,
        type: { key: 'wpayNext', label: `תשלום עובד/ת ${wp.number}`, short: `ת.עובד ${wp.number}`, icon: '💵' },
        cell: wp, row: r, who: r.workerName || r.employerName, caseObj: r.caseObj,
      });
    }
  }
  due.sort((a, b) => a.cell.due - b.cell.due);

  const vatRate = 0.17;
  const net = Math.round((total / (1 + vatRate)) * 100) / 100;
  return { income, total, net, vat: Math.round((total - net) * 100) / 100, due };
}

// Mark a worker instalment as paid (or not) — the dates themselves are derived
// from the arrival date, so only the "done" flags are stored.
export async function setWorkerPaymentDone(caseObj, key, done) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const prev = row?.data?.fields?.workerPaymentsDone || {};
    const fields = { ...(row?.data?.fields || {}), workerPaymentsDone: { ...prev, [key]: !!done } };
    await sb().from('agent_submissions').update({ data: { ...(row?.data || {}), fields } }).eq('id', id);
  }
}

// Save a manually-entered renewal date (insurance / company-fee) back onto the
// case's underlying row(s), merging into fields like the cases board does.
export async function saveRenewalDate(caseObj, key, value) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const fields = { ...(row?.data?.fields || {}), [key]: value };
    const newData = { ...(row?.data || {}), fields };
    await sb().from('agent_submissions').update({ data: newData }).eq('id', id);
  }
}

// Create an empty case from the office (not from the chat) — "לקוח חדש" /
// "עובד חדש". Seeds only what the user typed; everything else is filled in on
// the record page.
export async function createCase(seed = {}) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const { error } = await sb().from('agent_submissions').insert({
    id, kind: 'family', source: 'office', status: 'new',
    data: {
      fields: { ...seed, openedDate: new Date().toISOString().slice(0, 10) },
      meta: { createdInOffice: true },
      updatedAt: new Date().toISOString(),
    },
  });
  if (error) throw new Error('יצירת התיק נכשלה: ' + error.message);
  return id;
}

// ---- Leads (inquiries that haven't become an active case yet) ----------------
// Kept separate from agent_submissions "family" cases (kind:'lead'), so the
// leads report doesn't clutter the cases board / registry search.
export async function loadLeads() {
  const { data, error } = await sb()
    .from('agent_submissions').select('*').eq('kind', 'lead')
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error('טעינת הפניות נכשלה: ' + error.message);
  return data || [];
}

export async function createLead({ name, phone, referrer, note }) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const { error } = await sb().from('agent_submissions').insert({
    id, kind: 'lead', source: 'office', status: 'new',
    data: { fields: { name, phone, referrer, note }, createdAt: new Date().toISOString() },
  });
  if (error) throw new Error(error.message);
  return id;
}

// Convert a lead into a real case (kind:'family') so it flows into the normal
// registry/cases-board pipeline, seeding whatever fields the lead already had.
export async function convertLeadToCase(lead) {
  const f = lead.data?.fields || {};
  const { error } = await sb().from('agent_submissions').update({
    kind: 'family',
    data: { ...lead.data, fields: { ...f, employerName: f.employerName || f.name, contactPhone: f.contactPhone || f.phone } },
  }).eq('id', lead.id);
  if (error) throw new Error(error.message);
  return lead.id; // the caller opens the new file
}

export async function dismissLead(lead) {
  const { error } = await sb().from('agent_submissions').update({ status: 'dismissed' }).eq('id', lead.id);
  if (error) throw new Error(error.message);
}
