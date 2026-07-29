// The quarterly fee-collection report filed with משרד הפנים: one row per foreign
// worker the agency collected money from, with the amount and the AGENCY's own
// bank account (the same on every row — the account the money sits in / is
// refunded from), for the ministry to identify the transfer.
//
// Like the visits report, it injects into the government's own .xlsx template
// (30 pre-formatted rows) rather than rebuilding it, so the output is identical
// to a hand-filled sheet. Columns:
//   A מס"ד · B שם הלשכה · C ח.פ · D שם העובד · E שם משפחה · F מס' דרכון ·
//   G הסכום לתשלום · H שם בנק · I מספר בנק · J מס' סניף · K מס' ח-ן
// The office downloads and signs afterwards.

import JSZip from 'jszip';
import templateUrl from './assets/fee-quarterly-template.xlsx?url';

const SHEET = 'xl/worksheets/sheet1.xml';
const FIRST_DATA_ROW = 5;
const ROWS_AVAILABLE = 30;   // the template ships rows 5..34
const S = 3;                 // the template's bordered data-cell style

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cell = (ref, val) => (val === '' || val == null
  ? `<c r="${ref}" s="${S}"/>`
  : `<c r="${ref}" s="${S}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`);

// Split a full (English) name into first / last for the form's two columns.
export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] || '', last: '' };
  // passport names are usually "SURNAME GIVEN"; keep the first token as surname.
  return { last: parts[0], first: parts.slice(1).join(' ') };
}

function fillRow(rowNum, index, r, openAttrs) {
  const c = [`<c r="A${rowNum}" s="${S}"><v>${index}</v></c>`];
  const vals = {
    B: r.agency, C: r.taxId, D: r.firstName, E: r.lastName, F: r.passport,
    G: r.amount, H: r.bankName, I: r.bankNumber, J: r.bankBranch, K: r.bankAccount,
  };
  for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) c.push(cell(`${col}${rowNum}`, vals[col]));
  return `<row r="${rowNum}"${openAttrs}>${c.join('')}</row>`;
}

// workers: [{ firstName, lastName, passport, amount }]. The agency + bank fields
// are constant and come from the office config.
export async function buildFeeWorkbook({ agency, taxId, bank = {}, workers = [] }) {
  const buf = await fetch(templateUrl).then((r) => {
    if (!r.ok) throw new Error('טעינת תבנית דוח הגבייה נכשלה');
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file(SHEET).async('string');

  const rows = workers.slice(0, ROWS_AVAILABLE).map((w) => ({
    agency: agency || '', taxId: taxId || '',
    firstName: w.firstName || '', lastName: w.lastName || '', passport: w.passport || '',
    amount: w.amount === '' || w.amount == null ? '' : String(w.amount),
    bankName: bank.name || '', bankNumber: bank.number || '', bankBranch: bank.branch || '', bankAccount: bank.account || '',
  }));

  rows.forEach((r, i) => {
    const rowNum = FIRST_DATA_ROW + i;
    const re = new RegExp(`<row r="${rowNum}"([^>]*)>.*?</row>`, 's');
    const m = xml.match(re);
    const openAttrs = m ? m[1] : ' spans="1:22" x14ac:dyDescent="0.2"';
    xml = m ? xml.replace(re, fillRow(rowNum, i + 1, r, openAttrs))
      : xml.replace('</sheetData>', `${fillRow(rowNum, i + 1, r, openAttrs)}</sheetData>`);
  });

  zip.file(SHEET, xml);
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadFeeReport(opts) {
  const blob = await buildFeeWorkbook(opts);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `דוח-גביית-עובדים-${opts.quarter || ''}.xlsx`.replace(/\s/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
