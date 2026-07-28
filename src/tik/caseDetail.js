// Data layer for the case detail view (documents history, payments/invoices,
// visits/appointments, notes, case ownership) — the pieces that make the
// registry match what the office's old system (Tik-Tak) already does.
// Everything is stored inside the case's existing agent_submissions row(s),
// under data.fields, so no new tables are needed.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Merge a patch into a case's fields, writing to every underlying row (a
// split-link case has two halves that both need to stay in sync).
export async function patchCaseFields(caseObj, patch) {
  const ids = caseObj.ids && caseObj.ids.length ? caseObj.ids : [caseObj.id];
  for (const id of ids) {
    const { data: row } = await sb().from('agent_submissions').select('data').eq('id', id).maybeSingle();
    const fields = { ...(row?.data?.fields || {}), ...patch };
    const newData = { ...(row?.data || {}), fields };
    await sb().from('agent_submissions').update({ data: newData }).eq('id', id);
  }
}

// ---- Insurance companies (real ones seen in the office's own system) --------
export const INSURANCE_COMPANIES = ['הראל', 'הילית', 'מנורה מבטחים', 'כלל ביטוח', 'הפניקס', 'איילון', 'AIG'];

// ---- Document history (passport / visa / permit / insurance) ---------------
// Each type keeps a repeatable log (like the old system's "טופס קובץ החלפת
// דרכון") AND mirrors its latest expiry onto the flat field the renewals
// report and the contract already read (e.g. passportExpiry) — so nothing
// else needs to change.
export const DOC_TYPES = [
  { key: 'passport', label: 'דרכון', expiryField: 'passportExpiry', numberField: 'passportNo', hasNumber: true },
  { key: 'visa', label: 'ויזה / אשרה', expiryField: 'visaExpiry', hasNumber: false },
  { key: 'permit', label: 'היתר העסקה', expiryField: 'permitExpiry', numberField: 'permitNumber', hasNumber: true },
  { key: 'insurance', label: 'ביטוח רפואי', expiryField: 'insuranceExpiry', hasNumber: false, hasCompany: true },
];
export const EVENT_TYPES = ['ראשון', 'חידוש', 'החלפה'];

// ---- File attachments ---------------------------------------------------------
// Scans/photos are uploaded to the same Supabase storage bucket the signing
// system uses, and only the path is kept on the case — so a 26-page case row
// never balloons with base64 blobs.
const FILE_BUCKET = 'documents';

export async function uploadCaseFile(caseObj, docKey, file) {
  const ext = (file.name || '').split('.').pop() || 'bin';
  const path = `cases/${caseObj.id}/${docKey}-${uid()}.${ext}`;
  const { error } = await sb().storage.from(FILE_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error('העלאת הקובץ נכשלה: ' + error.message);
  return { path, name: file.name || 'קובץ', size: file.size, type: file.type || '' };
}

// A temporary signed URL to view/download an attachment.
export async function fileUrl(path) {
  const { data, error } = await sb().storage.from(FILE_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function removeCaseFile(path) {
  await sb().storage.from(FILE_BUCKET).remove([path]).catch(() => {});
}

export function documentHistory(caseObj, docKey) {
  const arr = caseObj.data?.fields?.documents?.[docKey];
  return Array.isArray(arr) ? [...arr].sort((a, b) => new Date(b.expiry || 0) - new Date(a.expiry || 0)) : [];
}

// Add a document-history entry and update the mirrored flat expiry field.
export async function addDocumentEntry(caseObj, docKey, entry) {
  const type = DOC_TYPES.find((t) => t.key === docKey);
  const current = caseObj.data?.fields?.documents || {};
  const list = Array.isArray(current[docKey]) ? current[docKey] : [];
  const row = { id: uid(), addedAt: new Date().toISOString(), ...entry };
  const documents = { ...current, [docKey]: [...list, row] };
  const patch = { documents };
  if (type?.expiryField && entry.expiry) patch[type.expiryField] = entry.expiry;
  if (type?.numberField && entry.number) patch[type.numberField] = entry.number;
  await patchCaseFields(caseObj, patch);
}

// ---- Payments & invoices -----------------------------------------------------
export const PAYMENT_METHODS = ['הוראת קבע', "המחאה", 'אשראי', 'מזומן', 'העברה בנקאית'];
export const VAT_RATE = 0.17; // current Israeli VAT rate

// amount is the gross total the customer is charged (VAT included), matching
// how prices are communicated (e.g. "2,840 ₪ סה"כ").
export function vatBreakdown(amountGross) {
  const gross = Number(amountGross) || 0;
  const net = Math.round((gross / (1 + VAT_RATE)) * 100) / 100;
  const vat = Math.round((gross - net) * 100) / 100;
  return { net, vat, gross };
}

export function payments(caseObj) {
  const arr = caseObj.data?.fields?.payments;
  return Array.isArray(arr) ? [...arr].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];
}

export async function addPayment(caseObj, payment) {
  const list = payments(caseObj);
  const row = { id: uid(), addedAt: new Date().toISOString(), ...payment };
  await patchCaseFields(caseObj, { payments: [...list, row] });
  return row;
}

// ---- Visits & appointments ----------------------------------------------------
export const VISIT_TYPES = ['ביקור בית', 'פגישה', 'שיחת טלפון'];

export function visits(caseObj) {
  const arr = caseObj.data?.fields?.visits;
  return Array.isArray(arr) ? [...arr].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];
}

export async function addVisit(caseObj, visit) {
  const list = visits(caseObj);
  const row = { id: uid(), addedAt: new Date().toISOString(), ...visit };
  await patchCaseFields(caseObj, { visits: [...list, row] });
  return row;
}

// ---- Notes log -----------------------------------------------------------------
export function notes(caseObj) {
  const arr = caseObj.data?.fields?.notesLog;
  return Array.isArray(arr) ? [...arr].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)) : [];
}

export async function addNote(caseObj, text) {
  const list = notes(caseObj);
  const row = { id: uid(), text, at: new Date().toISOString() };
  await patchCaseFields(caseObj, { notesLog: [...list, row] });
  return row;
}

// ---- Case ownership (רכז/ת) ----------------------------------------------------
export async function assignRakaz(caseObj, name) {
  await patchCaseFields(caseObj, { assignedTo: name });
}

// ---- Sequential case number (best-effort — fine for a single-office scale) ---
export async function getOrAssignCaseNumber(caseObj, allCases) {
  const existing = caseObj.data?.fields?.caseNumber;
  if (existing) return existing;
  const nums = allCases.map((c) => Number(c.data?.fields?.caseNumber) || 0);
  const next = Math.max(0, ...nums) + 1;
  await patchCaseFields(caseObj, { caseNumber: next });
  return next;
}

// ---- Duplicate a case (e.g. same family, new placement) -----------------------
export async function duplicateCase(caseObj) {
  const newId = uid();
  const fields = { ...(caseObj.data?.fields || {}) };
  delete fields.caseNumber; // gets its own number
  delete fields.documents; delete fields.payments; delete fields.visits; delete fields.notesLog;
  delete fields.signRequestId; delete fields.signLink;
  const { error } = await sb().from('agent_submissions').insert({
    id: newId, kind: 'family', source: 'office', status: 'new',
    data: { fields, meta: { duplicatedFrom: caseObj.id }, updatedAt: new Date().toISOString() },
  });
  if (error) throw new Error(error.message);
  return newId;
}
