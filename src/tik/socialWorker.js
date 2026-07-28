// Social-worker visit schedule.
//
// Every placement generates a fixed series of required visits, all counted from
// the placement (start) date:
//   1. ביקור השמה   — at the placement itself
//   2. ביקור 30 יום  — within 30 days of the placement
//   3. ביקור שוטף    — every 6 months from the placement, ongoing
//
// The office works in quarters: a visit belongs to the quarter its due date
// falls in, and that quarter's report is filed shortly after the quarter ends.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

export const VISIT_KINDS = {
  placement: { key: 'placement', label: 'ביקור השמה', short: 'השמה', icon: '🤝' },
  day30: { key: 'day30', label: 'ביקור 30 יום', short: '30 יום', icon: '📅' },
  periodic: { key: 'periodic', label: 'ביקור תקופתי', short: 'שוטף', icon: '🔄' },
};

// How a visit was actually carried out. The quarterly report is filed
// separately for each channel, so the office records it per visit.
export const VISIT_CHANNELS = {
  physical: { key: 'physical', label: 'פיזי', icon: '🚶' },
  phone: { key: 'phone', label: 'טלפוני', icon: '📞' },
  digital: { key: 'digital', label: 'דיגיטלי', icon: '💻' },
};
export const DEFAULT_CHANNEL = 'physical';

// How many days after a visit's due date it is still considered "on time".
const GRACE_DAYS = 0;
// Report for a quarter is filed by the 10th of the month after it ends.
const REPORT_DUE_DAY = 10;

const parseDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const addMonths = (d, n) => { const c = new Date(d); c.setMonth(c.getMonth() + n); return c; };
const DAY = 86400000;
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Quarter of a date: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
export function quarterOf(date) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  const year = date.getFullYear();
  return { q, year, id: `${year}-Q${q}`, label: `רבעון ${q}/${year}` };
}
export function quarterRange(year, q) {
  const from = new Date(year, (q - 1) * 3, 1);
  const to = new Date(year, q * 3, 0, 23, 59, 59, 999);
  return { from, to };
}
// The quarter that contains today, plus the ones around it, for the picker.
export function quarterOptions(back = 4, forward = 2) {
  const now = todayStart();
  const base = quarterOf(now);
  const out = [];
  for (let i = -back; i <= forward; i++) {
    let q = base.q + i; let year = base.year;
    while (q < 1) { q += 4; year -= 1; }
    while (q > 4) { q -= 4; year += 1; }
    out.push({ ...quarterRange(year, q), q, year, id: `${year}-Q${q}`, label: `רבעון ${q}/${year}`, current: i === 0 });
  }
  return out;
}
export function reportDueFor(year, q) {
  const { to } = quarterRange(year, q);
  return new Date(to.getFullYear(), to.getMonth() + 1, REPORT_DUE_DAY);
}

// Every visit a single placement owes, from its start date up to the horizon.
export function requiredVisitsFor(caseObj, horizonMonths = 36) {
  const f = caseObj.data?.fields || {};
  const start = parseDate(f.startDate);
  if (!start) return [];
  const done = f.socialVisits || {};
  const today = todayStart();
  const limit = addMonths(today, 6); // list a little into the future, not forever

  const mk = (id, kind, due) => {
    const rec = done[id] || {};
    const doneDate = parseDate(rec.date);
    const daysLeft = Math.round((due - today) / DAY);
    return {
      id, kind: VISIT_KINDS[kind], due, doneDate, note: rec.note || '',
      channel: VISIT_CHANNELS[rec.channel] || VISIT_CHANNELS[DEFAULT_CHANNEL],
      quarter: quarterOf(due),
      daysLeft,
      done: !!doneDate,
      overdue: !doneDate && addDays(due, GRACE_DAYS) < today,
      soon: !doneDate && daysLeft >= 0 && daysLeft <= 30,
    };
  };

  const list = [mk('placement', 'placement', start), mk('day30', 'day30', addDays(start, 30))];
  for (let m = 6; m <= horizonMonths; m += 6) {
    const due = addMonths(start, m);
    if (due > limit) break;
    list.push(mk(`periodic-${m}`, 'periodic', due));
  }
  return list;
}

// All required visits across all placements, flattened into report rows.
export function buildVisitReport(cases) {
  const rows = [];
  for (const c of cases) {
    const visits = requiredVisitsFor(c);
    if (!visits.length) continue;
    for (const v of visits) {
      rows.push({
        ...v,
        rowId: `${c.id}-${v.id}`,
        caseObj: c,
        workerName: c.worker?.nameHe || c.worker?.nameEn || '',
        familyName: c.family?.fullName || c.data?.fields?.employerName || '',
        city: c.family?.city || '',
        socialWorker: c.data?.fields?.socialWorker || '',
        caseNumber: c.data?.fields?.caseNumber || '',
      });
    }
  }
  rows.sort((a, b) => a.due - b.due);
  return rows;
}

// Save one visit's completion date (and optional note).
export async function saveVisit(caseObj, visitId, date, note, channel) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const prev = row?.data?.fields?.socialVisits || {};
    const next = { ...prev };
    if (date) next[visitId] = { date, note: note || '', channel: channel || DEFAULT_CHANNEL };
    else delete next[visitId];
    const fields = { ...(row?.data?.fields || {}), socialVisits: next };
    await sb().from('agent_submissions').update({ data: { ...(row?.data || {}), fields } }).eq('id', id);
  }
}

// Save several visits at once — the office fills a batch then saves in one go.
export async function saveVisitsBatch(entries) {
  // entries: [{ caseObj, visitId, date, note, channel }]
  const byCase = new Map();
  for (const e of entries) {
    const key = e.caseObj.id;
    if (!byCase.has(key)) byCase.set(key, { caseObj: e.caseObj, items: [] });
    byCase.get(key).items.push(e);
  }
  for (const { caseObj, items } of byCase.values()) {
    const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
    for (const id of ids) {
      const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
      const next = { ...(row?.data?.fields?.socialVisits || {}) };
      for (const it of items) {
        if (it.date) next[it.visitId] = { date: it.date, note: it.note || '', channel: it.channel || DEFAULT_CHANNEL };
        else delete next[it.visitId];
      }
      const fields = { ...(row?.data?.fields || {}), socialVisits: next };
      await sb().from('agent_submissions').update({ data: { ...(row?.data || {}), fields } }).eq('id', id);
    }
  }
}

// Quarterly report filing status, stored per quarter on the config-free side:
// kept on each case so a case can be marked as included in a filed report.
export async function setQuarterFiled(caseObj, quarterId, filed) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const prev = row?.data?.fields?.quartersFiled || {};
    const fields = { ...(row?.data?.fields || {}), quartersFiled: { ...prev, [quarterId]: !!filed } };
    await sb().from('agent_submissions').update({ data: { ...(row?.data || {}), fields } }).eq('id', id);
  }
}
