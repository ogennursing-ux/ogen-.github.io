// The home screen's to-do list: everything with a date that the office needs
// to act on, gathered from the same places the reports read — renewals, the
// worker's instalments, social-worker visits, inter-visa returns, the annual
// client fee, birthdays and open leads — and sorted into four buckets by how
// urgent it is.

import { RENEWAL_TYPES, computeRenewalRows, activePlacements } from './registry.js';
import { buildVisitReport } from './socialWorker.js';

const DAY = 24 * 60 * 60 * 1000;
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const plusMonths = (d, n) => { const c = new Date(d); c.setMonth(c.getMonth() + n); return c; };

// Which bucket a date falls into, relative to today.
// The home screen shows only what needs attention now — what's overdue and
// what's due today. The week / month look-ahead was dropped at the office's
// request so the entry screen stays calm.
export const BUCKETS = [
  { key: 'overdue', label: 'עבר התאריך', tone: 'bad' },
  { key: 'today', label: 'להיום', tone: 'warn' },
];

function bucketOf(due, today) {
  if (!due) return null;
  const days = Math.round((due - today) / DAY);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return null; // beyond today — kept off the home screen
}

// A birthday inside the next month, whatever year the person was born.
function nextBirthday(dob, today) {
  const d = parseDate(dob);
  if (!d) return null;
  const cand = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (cand < today) cand.setFullYear(cand.getFullYear() + 1);
  return cand;
}

export function buildAgenda(cases, leads = []) {
  const today = todayStart();
  const items = [];
  const push = (t) => {
    const bucket = bucketOf(t.due, today);
    if (bucket) items.push({ ...t, bucket, days: Math.round((t.due - today) / DAY) });
  };

  // Renewals + the worker's next owed instalment, straight from the renewals
  // engine (which already folds the three instalments into one "next" cell).
  for (const row of computeRenewalRows(cases)) {
    for (const t of RENEWAL_TYPES) {
      const cell = row.cells[t.key];
      if (!cell || !cell.due) continue;
      push({
        id: `${row.id}-${t.key}`, kind: 'חידוש', icon: t.icon || '🔔',
        label: t.label, who: row.workerName || row.employerName,
        due: cell.due, caseObj: row.caseObj, recordKind: 'worker',
      });
    }
    const wp = row.cells.wpayNext;
    if (wp && wp.due) push({
      id: `${row.id}-wpayNext`, kind: 'תשלום עובד/ת', icon: '💵',
      label: `תשלום עובד/ת ${wp.number}`, who: row.workerName || row.employerName,
      due: wp.due, caseObj: row.caseObj, recordKind: 'worker',
    });
  }

  // Social-worker visits that are due and not yet done.
  for (const v of buildVisitReport(activePlacements(cases))) {
    if (v.done) continue;
    push({
      id: `sw-${v.rowId}`,
      kind: 'ביקור עו״ס',
      icon: '🧑‍⚕️',
      label: `ביקור ${v.kind.label}`,
      who: v.workerName || v.familyName,
      due: v.due,
      caseObj: v.caseObj,
      recordKind: 'worker',
    });
  }

  // Per-case dates the renewals engine doesn't cover: inter-visa return, the
  // annual client fee, and birthdays.
  for (const c of cases) {
    const f = c.data?.fields || {};
    const who = c.worker?.nameEn || c.worker?.nameHe || c.family?.fullName || '';

    const back = parseDate(f.interVisaBack);
    if (back) push({
      id: `iv-${c.id}`, kind: 'אינטרויזה', icon: '✈️',
      label: 'חזרה מחו״ל', who, due: back, caseObj: c, recordKind: 'worker',
    });

    // The monthly fee runs a year; if only a start is filled, the end is +12m.
    const feeEnd = parseDate(f.monthlyFeeTo)
      || (parseDate(f.monthlyFeeFrom) ? plusMonths(parseDate(f.monthlyFeeFrom), 12) : null);
    if (feeEnd) push({
      id: `fee-${c.id}`, kind: 'תשלום חודשי', icon: '💳',
      label: 'חידוש תשלום חודשי', who: c.family?.fullName || f.employerName || who,
      due: feeEnd, caseObj: c, recordKind: 'family',
    });

    const bday = nextBirthday(f.workerDob || f.dob, today);
    if (bday) push({
      id: `bd-${c.id}`, kind: 'יום הולדת', icon: '🎂',
      label: 'יום הולדת', who, due: bday, caseObj: c, recordKind: 'worker',
    });
  }

  // Open leads waiting to be handled — they have no due date, so they sit in
  // "today" as something to look at now.
  for (const l of leads) {
    const f = l.data?.fields || {};
    items.push({
      id: `lead-${l.id}`, kind: 'פנייה', icon: '📞',
      label: 'פנייה חדשה לטיפול', who: f.name || f.employerName || 'פנייה',
      due: parseDate(l.created_at) || today, caseObj: null, recordKind: null,
      bucket: 'today', days: 0, lead: l,
    });
  }

  items.sort((a, b) => a.due - b.due);

  // Group into the four buckets, keeping only buckets that have something.
  const groups = BUCKETS.map((b) => ({ ...b, items: items.filter((i) => i.bucket === b.key) }))
    .filter((g) => g.items.length);
  return { groups, total: items.length };
}
