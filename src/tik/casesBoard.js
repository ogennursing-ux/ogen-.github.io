// Data layer for the Cases Board (#board): a single control room that shows
// every case from the chat and its stage — missing details / ready / sent for
// signing / signed. Reads the shared Supabase project (agent_submissions +
// sign_requests) and reuses mergeHalves so split-link halves appear as one case.
import { createClient } from '@supabase/supabase-js';
import { mergeHalves } from './agentInbox.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// Essentials a case must have before a contract can be produced ("ready").
export const ESSENTIALS = [
  ['שם המעסיק', (f) => f.employerName || f.fullName],
  ['ת״ז המעסיק', (f) => f.idNumber],
  ['טלפון המעסיק', (f) => f.contactPhone],
  ['שם העובד/ת', (f) => f.nameHe || f.nameEn],
  ['דרכון העובד/ת', (f) => f.passportNo],
  ['שכר חודשי', (f) => f.salary],
  ['תאריך תחילת העסקה', (f) => f.startDate],
];
// Documents that must be attached too.
export const DOC_ESSENTIALS = [
  ['צילום דרכון', 'passport'],
  ['צילום ת״ז מטופל', 'id'],
];

// What is still missing for a case to be "ready" (empty array = ready).
export function missingForCase(c) {
  const f = c.data?.fields || {};
  const files = c.data?.files || [];
  const miss = [];
  for (const [label, get] of ESSENTIALS) {
    const v = get(f);
    if (v == null || !String(v).trim()) miss.push(label);
  }
  for (const [label, cat] of DOC_ESSENTIALS) {
    if (!files.some((x) => x.category === cat)) miss.push(label);
  }
  return miss;
}

// Signature progress from an attached sign_request row.
export function signProgress(sr) {
  const list = sr?.signers?.list || [];
  const signed = list.filter((s) => s.signed).length;
  return { list, signed, total: list.length };
}

// The stage of a case, in order: missing → ready → sent → partial → signed.
export function caseStage(c) {
  if (c.sign) {
    const { signed, total } = signProgress(c.sign);
    if (total && signed >= total) return 'signed';
    if (signed > 0) return 'partial';
    return 'sent';
  }
  return missingForCase(c).length ? 'missing' : 'ready';
}

export const STAGE_LABEL = {
  missing: '🟡 חסרים פרטים',
  ready: '🔵 מוכן להפקת חוזה',
  sent: '✍️ נשלח לחתימה',
  partial: '✍️ נחתם חלקית',
  signed: '✅ חתום',
};
export const STAGE_ORDER = ['missing', 'ready', 'sent', 'partial', 'signed'];

// Load every case (excluding the config row and dismissed ones), merge the
// split-link halves, and attach the sign_request (if any) + computed stage.
export async function loadCases() {
  const { data: subs, error } = await sb()
    .from('agent_submissions')
    .select('*')
    .neq('kind', 'config')
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw new Error('טעינת המקרים נכשלה: ' + error.message);

  const cases = mergeHalves(subs || []);
  const ids = [...new Set(cases.map((c) => c.data?.signRequestId).filter(Boolean))];
  const byId = {};
  if (ids.length) {
    const { data: reqs } = await sb().from('sign_requests').select('id,status,signers,title').in('id', ids);
    for (const r of reqs || []) byId[r.id] = r;
  }
  for (const c of cases) {
    c.sign = c.data?.signRequestId ? byId[c.data.signRequestId] || null : null;
    c.missing = missingForCase(c);
    c.stage = caseStage(c);
  }
  return cases;
}

// Remember a created signing request on the case's underlying row(s), so it
// survives a page reload and re-merge.
export async function attachSigning(caseObj, signId, link) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const newData = { ...(row?.data || {}), signRequestId: signId, signLink: link };
    await sb().from('agent_submissions').update({ data: newData }).eq('id', id);
  }
}
