// Ground the assistant in the office's live data. Rather than hand the model
// raw rows and hope it counts correctly, we pre-compute the facts it is most
// often asked for — upcoming expiries, overdue and due visits, collection totals —
// and give it a compact per-placement roster for lookups. The model then relays
// facts instead of inventing them.
import { loadRegistry, activePlacements } from './registry.js';
import { buildVisitReport, quarterOptions } from './socialWorker.js';

const DAY = 86400000;
const parseDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const daysLeft = (v) => { const d = parseDate(v); return d ? Math.round((d - Date.now()) / DAY) : null; };
const fmt = (v) => { const d = parseDate(v); if (!d) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

// Build the text snapshot + the raw cases (so the caller can also link records).
export async function buildAiContext() {
  const cases = await loadRegistry();
  const active = activePlacements(cases);

  const roster = [];
  const expiring = []; // anything valid-until within 60 days
  for (const c of active) {
    const f = c.data?.fields || {};
    const w = c.worker || {};
    const fam = c.family || {};
    const name = w.nameEn || w.nameHe || '—';
    const checks = [
      ['היתר', f.permitExpiry || fam.permitExpiry],
      ['ויזה', w.visaExpiry || fam.visaExpiry],
      ['דרכון', w.passportExpiry],
      ['ביטוח', w.insuranceExpiry || fam.insuranceExpiry],
    ];
    const bits = [`עובד/ת: ${name}`];
    if (fam.fullName) bits.push(`מעסיק: ${fam.fullName}`);
    if (fam.city) bits.push(`עיר: ${fam.city}`);
    if (w.passportNo) bits.push(`דרכון: ${w.passportNo}`);
    for (const [label, v] of checks) {
      const dl = daysLeft(v);
      if (dl == null) continue;
      bits.push(`${label} עד ${fmt(v)}`);
      if (dl <= 60) expiring.push(`${name} (${fam.fullName || ''}) — ${label} ${dl < 0 ? 'פג לפני' : 'פג בעוד'} ${Math.abs(dl)} ימים · ${fmt(v)}`);
    }
    roster.push('• ' + bits.join(' · '));
  }
  expiring.sort();

  // Visits: overdue (any quarter) + this current quarter, not yet done.
  const visits = buildVisitReport(active);
  const q = quarterOptions(0, 0)[0];
  const overdue = visits.filter((v) => v.overdue && !v.done)
    .map((v) => `${v.workerName || ''} (${v.familyName || ''}) — ${v.kind.label} · יעד ${fmt(v.due)} · באיחור ${-v.daysLeft} ימים`);
  const thisQuarter = visits.filter((v) => !v.done && !v.overdue && v.due >= q.from && v.due <= q.to)
    .map((v) => `${v.workerName || ''} (${v.familyName || ''}) — ${v.kind.label} · יעד ${fmt(v.due)}`);

  const families = new Set(cases.filter((c) => c.family?.fullName).map((c) => c.family.fullName)).size;
  const workers = new Set(cases.filter((c) => c.worker?.passportNo).map((c) => c.worker.passportNo)).size;

  const section = (title, arr) => (arr.length ? `\n== ${title} (${arr.length}) ==\n${arr.join('\n')}` : `\n== ${title} == אין`);

  const text = [
    `נכון להיום ${fmt(new Date())}.`,
    `סטטיסטיקה: ${families} משפחות · ${workers} עובדים · ${active.length} השמות פעילות.`,
    section('תוקף שפג / פג ב-60 יום', expiring),
    section('ביקורי עו"ס באיחור', overdue),
    section(`ביקורי עו"ס לרבעון הנוכחי (${q.label})`, thisQuarter),
    section('רשימת ההשמות הפעילות', roster),
  ].join('\n');

  return { text, cases, active };
}
