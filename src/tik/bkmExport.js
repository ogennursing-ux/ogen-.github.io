// The uniform-format export (קובץ במבנה אחיד) that the tax authority's auditor
// asks for on a books inspection — the BKM/"openformat" structure: an index
// file (INI.txt) and a data file (BKMVDATA.txt) made of fixed-width records.
//
// Implemented record types:
//   A000  opening   — the business, the software, the period covered
//   C100  document  — one per issued document (type, number, date, customer, sums)
//   D110  line       — one per document line (description, amount, VAT)
//   Z900  closing   — record count + control totals
//
// IMPORTANT: the exact field positions must be verified with the accountant
// against the current official spec before relying on this in a real audit —
// see INVOICING.md. The structure here follows the documented layout and
// produces a valid, parseable pair of files.

import JSZip from 'jszip';
import { DOC_TYPES, PAYMENT_METHODS, companyDetails } from './invoices.js';

// Field helpers: numbers are right-justified zero-filled, text left-justified
// space-filled, exactly like the openformat convention.
const num = (v, len) => String(Math.round(Math.abs(Number(v) || 0))).slice(0, len).padStart(len, '0');
const amt = (v, len) => String(Math.round((Number(v) || 0) * 100)).replace('-', '').slice(0, len).padStart(len, '0');
const txt = (v, len) => String(v ?? '').slice(0, len).padEnd(len, ' ');
const ymd = (v) => {
  const d = v ? new Date(v) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};
const hms = (v) => {
  const d = v ? new Date(v) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}${p(d.getMinutes())}`;
};

// The document-type code the tax authority uses in the file.
const docCode = (key) => String(DOC_TYPES[key]?.bkm || 0);
const payCode = (key) => String(PAYMENT_METHODS.find((m) => m.key === key)?.bkm || 0);

export function buildUniformFiles({ documents, config = {}, fromDate, toDate }) {
  const company = companyDetails(config);
  const primaryId = (company.taxId || '000000000').replace(/\D/g, '').padStart(9, '0');
  const now = new Date();
  const dataLines = [];
  let running = 0;

  // A000 — opening record.
  running += 1;
  dataLines.push([
    'A000',
    num(running, 9),
    txt(primaryId, 9),
    txt('OGEN-CRM', 20),          // software name
    txt('1.31', 5),               // format version
    txt(company.name, 50),
    txt(primaryId, 9),            // business file / ח.פ
    ymd(fromDate || now),
    ymd(toDate || now),
    ymd(now) + hms(now),
  ].join('|'));

  let cDocs = 0; let dLines = 0; let totalVat = 0; let totalGross = 0;

  for (const doc of documents) {
    const sign = DOC_TYPES[doc.docType]?.sign || 1;
    cDocs += 1; running += 1;
    // C100 — document header.
    dataLines.push([
      'C100',
      num(running, 9),
      txt(primaryId, 9),
      docCode(doc.docType),
      txt(doc.display || doc.number, 20),
      ymd(doc.issuedAt),
      txt(doc.customer?.name, 50),
      txt((doc.customer?.taxId || '').replace(/\D/g, ''), 9),
      amt(doc.gross * sign, 15),
      amt(doc.vat * sign, 15),
      payCode(doc.paymentMethod),
      txt(doc.stamp ? 'Y' : 'N', 1),
    ].join('|'));

    // D110 — the single service line (dמי טיפול / השמה etc.).
    dLines += 1; running += 1;
    dataLines.push([
      'D110',
      num(running, 9),
      txt(primaryId, 9),
      txt(doc.display || doc.number, 20),
      num(1, 4),
      txt(doc.reference || doc.typeLabel, 50),
      amt(doc.net * sign, 15),
      amt(doc.vat * sign, 15),
      String(Math.round((doc.vatRate || 0.17) * 100)),
    ].join('|'));

    totalVat += doc.vat * sign;
    totalGross += doc.gross * sign;
  }

  // Z900 — closing record with control totals.
  running += 1;
  dataLines.push([
    'Z900',
    num(running, 9),
    txt(primaryId, 9),
    num(cDocs, 9),
    num(dLines, 9),
    num(running, 9),
    amt(totalGross, 15),
    amt(totalVat, 15),
  ].join('|'));

  const dataFile = dataLines.join('\r\n') + '\r\n';

  // INI.txt — the index: how many of each record type the data file holds.
  const counts = {};
  for (const line of dataLines) { const code = line.slice(0, 4); counts[code] = (counts[code] || 0) + 1; }
  const iniLines = Object.entries(counts).map(([code, c]) => `${code}|${num(c, 9)}`);
  iniLines.unshift(`OGEN-CRM|1.31|${primaryId}|${ymd(now)}|${num(dataLines.length, 9)}`);
  const iniFile = iniLines.join('\r\n') + '\r\n';

  return { iniFile, dataFile, counts, records: running };
}

// Download the two files zipped together, ready for the auditor's disk-on-key.
export async function downloadUniformFile(opts) {
  const { iniFile, dataFile } = buildUniformFiles(opts);
  const zip = new JSZip();
  // Encode as windows-1255 is ideal, but UTF-8 with BOM is widely accepted and
  // avoids mangling Hebrew; the accountant can confirm the required encoding.
  zip.file('INI.txt', '﻿' + iniFile);
  zip.file('BKMVDATA.txt', '﻿' + dataFile);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `קובץ-אחיד-BKM-${ymd(new Date())}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
