// The accounting export (יצוא קובץ להנהלת חשבונות, report 406) — the modern
// replacement for the old ASP "Movein.dat" exporter. It reads the frozen tax
// documents (invoices / receipts / credits) the office issued and writes a flat
// data file for the bookkeeping software, in the three modes the original had:
//
//   • current (שוטף)  — every document not yet exported; the file is produced
//     and those documents are then MARKED exported, so they are never sent
//     twice by accident.
//   • range (לפי תאריך) — re-export a date range regardless of the exported
//     flag (the old "restore / previous transfer" mode); nothing is marked.
//   • full (דוח מלא)   — every document in chronological order, for control and
//     a cross-cut backup; nothing is marked.
//
// Errors are caught and re-thrown as a single clean Hebrew message — an ADODB-
// style crash never surfaces and the database shape is never exposed.
//
// The office's documents are immutable (a frozen taxdoc row), so "exported" is
// NOT written back onto them. Instead each run appends an export-batch record
// (kind: 'acct_export') listing the document ids it covered; "not yet exported"
// is simply "not in any batch". This keeps the audit trail append-only, exactly
// like the rest of the invoicing module.

import { createClient } from '@supabase/supabase-js';
import { loadDocuments, DOC_TYPES, companyDetails } from './invoices.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb = null;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const currentUser = () => { try { return localStorage.getItem('ogen_me') || 'משרד'; } catch { return 'משרד'; } };

export const EXPORT_MODES = {
  current: { key: 'current', label: 'ייצוא שוטף', hint: 'כל המסמכים שטרם יוצאו — ומסמנת אותם כיוצאו' },
  range: { key: 'range', label: 'לפי טווח תאריכים', hint: 'ייצוא מחדש של תקופה, בלי לשנות מה שכבר יוצא' },
  full: { key: 'full', label: 'דוח מלא', hint: 'כל המסמכים כרונולוגית — לבקרה וגיבוי' },
};

// ---- reading the export log --------------------------------------------------
async function loadExportBatches() {
  try {
    const { data, error } = await sb()
      .from('agent_submissions').select('id,data,created_at')
      .eq('kind', 'acct_export').order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, ...r.data, createdAt: r.created_at }));
  } catch {
    // A missing log is not an error — it just means nothing was exported yet.
    return [];
  }
}

// The set of document ids already sent to the bookkeeping software.
async function exportedIdSet() {
  const batches = await loadExportBatches();
  const set = new Set();
  for (const b of batches) for (const id of (b.docIds || [])) set.add(id);
  return set;
}

// ---- the file format (Movein-style flat file) --------------------------------
// One line per document. The layout is documented and isolated here so it can be
// matched to the exact bookkeeping software once a real sample is provided —
// only this function changes. Fields are pipe-delimited, amounts in agorot,
// dates YYYYMMDD; a credit carries its sign so the batch nets out.
const pad = (v, n) => String(v ?? '').replace(/[|\r\n]/g, ' ').slice(0, n).padEnd(n, ' ');
const ymd = (v) => { const d = v ? new Date(v) : new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
const agorot = (v, sign) => String(Math.round(Math.abs(Number(v) || 0) * 100) * (sign < 0 ? -1 : 1));

function movementLine(doc) {
  const t = DOC_TYPES[doc.docType] || {};
  const sign = t.sign || 1;
  return [
    ymd(doc.issuedAt),                                   // תאריך
    String(t.bkm || 0),                                  // קוד מסמך (מבנה אחיד)
    pad(doc.display || doc.number, 20),                  // מספר מסמך
    pad(doc.customer?.name, 40),                         // שם לקוח
    pad((doc.customer?.taxId || '').replace(/\D/g, ''), 9), // ת״ז/ח.פ לקוח
    agorot(doc.net, sign),                               // לפני מע״מ (אגורות)
    agorot(doc.vat, sign),                               // מע״מ (אגורות)
    agorot(doc.gross, sign),                             // סה״כ (אגורות)
    pad(doc.paymentMethodLabel || '', 16),               // אמצעי תשלום
    pad(doc.reference || t.label || '', 40),             // פירוט
  ].join('|');
}

export function buildMoveinFile(documents, { config = {} } = {}) {
  const company = companyDetails(config);
  const primaryId = (company.taxId || '').replace(/\D/g, '').padStart(9, '0');
  const ordered = [...documents].sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
  const lines = ordered.map(movementLine);
  let totalGross = 0; let totalVat = 0;
  for (const d of ordered) { const s = (DOC_TYPES[d.docType]?.sign || 1); totalGross += (Number(d.gross) || 0) * s; totalVat += (Number(d.vat) || 0) * s; }
  // trailer: business id, record count, control totals (agorot)
  lines.push(['Z', primaryId, String(ordered.length), agorot(totalGross, 1), agorot(totalVat, 1)].join('|'));
  return lines.join('\r\n') + '\r\n';
}

// ---- selecting the documents for each mode -----------------------------------
async function selectDocuments(mode, { from, to } = {}) {
  const all = await loadDocuments(); // frozen taxdocs, newest first
  if (mode === 'full') return [...all].sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
  if (mode === 'range') {
    const f = from ? new Date(from) : null;
    const t = to ? new Date(`${to}T23:59:59`) : null;
    return all.filter((d) => {
      const dt = new Date(d.issuedAt);
      return (!f || dt >= f) && (!t || dt <= t);
    }).sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
  }
  // current: everything not already in an export batch
  const done = await exportedIdSet();
  return all.filter((d) => !done.has(d.id)).sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
}

// Record that these documents were exported (only the "current" mode marks).
async function markExported(docs, mode) {
  const { error } = await sb().from('agent_submissions').insert({
    id: uid(), kind: 'acct_export', status: 'exported', source: 'office',
    data: { at: new Date().toISOString(), by: currentUser(), mode, count: docs.length, docIds: docs.map((d) => d.id) },
  });
  if (error) throw error;
}

// ---- the one public entry point ----------------------------------------------
// Returns { count, filename, blob }. Throws a clean Hebrew Error on any failure.
export async function runAccountingExport(mode, { from, to, config = {} } = {}) {
  try {
    if (mode === 'range' && !from && !to) throw new Error('לייצוא לפי תאריך יש לבחור טווח.');
    const docs = await selectDocuments(mode, { from, to });
    if (!docs.length) {
      throw new Error(mode === 'current'
        ? 'אין מסמכים חדשים לייצוא — הכול כבר יוצא.'
        : 'לא נמצאו מסמכים לתקופה שנבחרה.');
    }
    const content = buildMoveinFile(docs, { config });
    // UTF-8 with BOM keeps Hebrew readable; the accountant confirms the encoding.
    const blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
    if (mode === 'current') await markExported(docs, mode);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return { count: docs.length, filename: `Movein_${stamp}.dat`, blob };
  } catch (e) {
    // Never surface a raw DB / ADODB-style error or the table shape.
    const msg = e?.message && /מסמכים|תאריך|תקופה/.test(e.message)
      ? e.message
      : 'ייצוא הקובץ נכשל. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה.';
    throw new Error(msg);
  }
}

// How many documents are waiting to be exported (for the button's badge).
export async function pendingExportCount() {
  try {
    const [all, done] = await Promise.all([loadDocuments(), exportedIdSet()]);
    return all.filter((d) => !done.has(d.id)).length;
  } catch { return 0; }
}

export async function loadExportHistory() { return loadExportBatches(); }

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
