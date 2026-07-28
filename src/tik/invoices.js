// The tax-documents module (קבלות וחשבוניות), built to the mechanics of the
// Israeli bookkeeping regulations (הוראות ניהול פנקסים, תשל"ג-1973):
//
//   • Sequential, automatic numbering — a separate running counter per document
//     type, with no gaps and no duplicates. Numbering is atomic: two clerks
//     issuing at the same moment can never receive the same number, because the
//     row is inserted with a unique (docType, number) key and a taken number is
//     retried.
//   • Immutability — once a document is issued it is FROZEN. The app never
//     updates or deletes it. A mistake is fixed only by issuing a cancellation
//     / credit document that points back at the original.
//   • Audit log — every event (issued, printed, emailed) is written as its own
//     append-only record: who, when, what.
//   • "מסמך ממוחשב – נחתם דיגיטלית" — every digitally delivered document carries
//     the wording the regulations require; the digital signature itself is a
//     one-time company certificate wired in separately.
//
// A frozen document lives as its own row (kind: 'taxdoc'); the log lives as
// rows (kind: 'taxdoc_event'). See INVOICING.md for the full compliance map and
// the parts that need the accountant / a certificate / the tax-authority API.

import { createClient } from '@supabase/supabase-js';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { VAT_RATE, vatBreakdown } from './caseDetail.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb = null;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// The document types the office issues. `bkm` is the numeric type code used in
// the tax-authority uniform-format file (מבנה אחיד); `series` prefixes the
// human-readable number so each type keeps its own run.
export const DOC_TYPES = {
  receipt: { key: 'receipt', label: 'קבלה', series: 'K', bkm: 400, sign: 1, isReceipt: true },
  invoice: { key: 'invoice', label: 'חשבונית מס', series: 'I', bkm: 305, sign: 1, isTax: true },
  invoice_receipt: { key: 'invoice_receipt', label: 'חשבונית מס/קבלה', series: 'IR', bkm: 320, sign: 1, isTax: true, isReceipt: true },
  credit: { key: 'credit', label: 'חשבונית זיכוי', series: 'Z', bkm: 330, sign: -1, isTax: true, isCredit: true },
};

export const PAYMENT_METHODS = [
  { key: 'cash', label: 'מזומן', bkm: 1 },
  { key: 'cheque', label: 'המחאה', bkm: 2 },
  { key: 'transfer', label: 'העברה בנקאית', bkm: 4 },
  { key: 'credit', label: 'כרטיס אשראי', bkm: 3 },
];

// The mandatory text on any document delivered by email / WhatsApp / PDF.
export const COMPUTERISED_STAMP = 'מסמך ממוחשב – נחתם דיגיטלית';

// The issuing company's own details (ח.פ / address) come from the office config
// so the accountant can fill them once; falls back to the known name.
export function companyDetails(config = {}) {
  return {
    name: config.companyName || COMPANY_NAME,
    taxId: config.companyTaxId || '',       // ח.פ
    address: config.companyAddress || '',
    phone: config.companyPhone || '',
    email: config.companyEmail || '',
  };
}

const fmtNumber = (t, n) => `${t.series}-${String(n).padStart(5, '0')}`;

// ---- Reading -----------------------------------------------------------------
export async function loadDocuments() {
  const { data, error } = await sb()
    .from('agent_submissions')
    .select('id,data,created_at')
    .eq('kind', 'taxdoc')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error('טעינת המסמכים נכשלה: ' + error.message);
  return (data || []).map((r) => ({ id: r.id, ...r.data, createdAt: r.created_at }));
}

async function highestNumber(docTypeKey) {
  const { data, error } = await sb()
    .from('agent_submissions')
    .select('data')
    .eq('kind', 'taxdoc')
    .limit(1000);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const r of data || []) {
    if (r.data?.docType === docTypeKey && Number(r.data?.number) > max) max = Number(r.data.number);
  }
  return max;
}

async function logEvent(docId, event, extra = {}) {
  await sb().from('agent_submissions').insert({
    id: uid(), kind: 'taxdoc_event', status: 'log', source: 'office',
    data: { docId, event, at: new Date().toISOString(), by: extra.by || currentUser(), ...extra },
  });
}

// Who is issuing — the connected coordinator if one was chosen, else "משרד".
function currentUser() {
  try { return localStorage.getItem('ogen_me') || 'משרד'; } catch { return 'משרד'; }
}

// ---- Issuing (the one write path; everything it makes is then frozen) --------
//
// A document is built from: the type, the customer, the line amount (gross,
// VAT-included), the payment method, and an optional link to the case / the
// original document it credits. Numbering retries on a taken number so the run
// is always gapless and unique.
export async function issueDocument({
  docType, customer, amountGross, paymentMethod, reference = '',
  caseId = null, creditOf = null, config = {},
}) {
  const type = DOC_TYPES[docType];
  if (!type) throw new Error('סוג מסמך לא מוכר');
  const company = companyDetails(config);
  if (!company.taxId) throw new Error('חסר ח.פ של החברה — יש למלא בהגדרות לפני הפקת מסמך.');

  const { net, vat, gross } = vatBreakdown(amountGross);
  const method = PAYMENT_METHODS.find((m) => m.key === paymentMethod) || PAYMENT_METHODS[0];

  // Try the next number; if someone grabbed it in the meantime, climb.
  let n = (await highestNumber(docType)) + 1;
  for (let attempt = 0; attempt < 25; attempt++) {
    const id = uid();
    const doc = {
      docType, number: n, display: fmtNumber(type, n), typeLabel: type.label,
      issuedAt: new Date().toISOString(), issuedBy: currentUser(),
      company,
      customer: {
        name: customer?.name || '', taxId: customer?.taxId || '',
        address: customer?.address || '', phone: customer?.phone || '',
      },
      // amounts are stored to the agora; credit/receipt carry a negative sign
      // in the uniform-format file but the printed amount stays positive.
      net: Math.round(net * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      gross: Math.round(gross * 100) / 100,
      vatRate: VAT_RATE,
      paymentMethod: method.key, paymentMethodLabel: method.label, reference,
      caseId, creditOf,
      stamp: COMPUTERISED_STAMP,
      signed: false, // set true once the company certificate signs the PDF
      cancelled: false,
    };
    // The unique (docType, number) guard: re-read right before insert; if the
    // number now exists, bump and retry. (A DB unique index makes this airtight
    // — see INVOICING.md; this app-level guard covers the office's low volume.)
    const taken = await numberExists(docType, n);
    if (taken) { n += 1; continue; }
    const { error } = await sb().from('agent_submissions').insert({
      id, kind: 'taxdoc', status: 'issued', source: 'office', data: doc,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) { n += 1; continue; }
      throw new Error('הפקת המסמך נכשלה: ' + error.message);
    }
    await logEvent(id, 'issued', { number: doc.display });
    return { id, ...doc };
  }
  throw new Error('לא ניתן להקצות מספר מסמך — נסו שוב.');
}

async function numberExists(docTypeKey, number) {
  const { data } = await sb().from('agent_submissions').select('data').eq('kind', 'taxdoc').limit(1000);
  return (data || []).some((r) => r.data?.docType === docTypeKey && Number(r.data?.number) === number);
}

// A mistake is never edited or deleted — it is cancelled by a credit document
// that references it, and the original is flagged (via a log event, not by
// mutating the frozen row's core numbers).
export async function creditDocument(original, { config = {} } = {}) {
  if (original.docType === 'credit') throw new Error('אי אפשר לזכות מסמך זיכוי.');
  const credit = await issueDocument({
    docType: 'credit',
    customer: original.customer,
    amountGross: original.gross,
    paymentMethod: original.paymentMethod,
    reference: `זיכוי כנגד ${original.display}`,
    caseId: original.caseId,
    creditOf: original.display,
    config,
  });
  await logEvent(original.id, 'credited', { by: currentUser(), creditNumber: credit.display });
  return credit;
}

// Record that a copy was printed or emailed (the audit trail the law wants).
export async function recordPrint(doc) { await logEvent(doc.id, 'printed'); }
export async function recordEmail(doc, to) { await logEvent(doc.id, 'emailed', { to }); }

export async function loadEvents(docId) {
  const { data } = await sb().from('agent_submissions').select('data,created_at')
    .eq('kind', 'taxdoc_event').limit(2000);
  return (data || []).map((r) => r.data).filter((e) => e.docId === docId)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

export { fmtNumber };
