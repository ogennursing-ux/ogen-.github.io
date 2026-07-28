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

// Load every case and attach the ready-to-display family/worker records.
export async function loadRegistry() {
  const cases = await loadCases();
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

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
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
}

export async function dismissLead(lead) {
  const { error } = await sb().from('agent_submissions').update({ status: 'dismissed' }).eq('id', lead.id);
  if (error) throw new Error(error.message);
}
