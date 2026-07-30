// Fills the quarterly report to משרד הפנים (רשות האוכלוסין) that private
// caregiving agencies file each quarter, listing the home visits the social
// worker carried out.
//
// It uses the government's OWN .xlsx as a permanent template and only injects
// values into it — it never rebuilds the sheet. The template ships with 500
// pre-formatted blank data rows (9–508); we drop each visit into the next blank
// row, reusing that row's own cell styles, so a filled report is pixel-identical
// to a hand-filled one: the same borders, the same shaded status/placement
// columns, the same header, the managers' declaration sheet untouched. Unused
// rows stay blank, exactly as in a report filled by hand.
//
// The office downloads the file and signs it afterwards, so no digital signature
// is embedded.

import JSZip from 'jszip';
import templateUrl from './assets/interior-quarterly-template.xlsx?url';

const SHEET = 'xl/worksheets/sheet2.xml'; // the "דוח רבעוני" sheet
const FIRST_DATA_ROW = 9;
const ROWS_AVAILABLE = 500; // the template ships rows 9..508

// The cell styles used on a FILLED row. They mirror the template's own blank
// data rows border-for-border (B/H/M open a group, G/L/R close it, N/O are the
// status & placement columns, the rest are plain bordered cells) but add the
// light-blue fill (#E0E9F8) the real filed reports shade a filled line with —
// added to the template's styles as fill 5 with the border-matched xfs 60–63.
// The # column (A) stays plain, and untouched rows keep their original white
// styles, exactly like a report filled by hand.
const A_STYLE = 14;
const COL_STYLE = {
  B: 61, C: 60, D: 60, E: 60, F: 60, G: 62,
  H: 61, I: 60, J: 60, K: 60, L: 62,
  M: 61, N: 63, O: 60, P: 60, Q: 60, R: 62,
};
const COLS = Object.keys(COL_STYLE); // B..R, in order

// A social-worker visit kind → the form's own status words.
const STATUS = { placement: 'טרום השמה', day30: 'אחרי', periodic: 'שוטף' };
// The placement's origin → the form's own three options.
const PLACEMENT = {
  'השמה מהארץ': 'השמה מהארץ',
  'השמה מחו״ל': 'השמה מחול',
  'השמה מחול': 'השמה מחול',
  'העברה מלשכה אחרת': 'השמה מהארץ',
  'רישום לתאגיד': 'רישום בלבד',
  'רישום בלבד': 'רישום בלבד',
};
const DEFAULT_ROLE = 'ע.סוציאלי';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// digits only — the form keeps ID / household phone as plain numbers.
const digits = (v) => String(v || '').replace(/\D/g, '');

// The form's data cells are all "General" format, so a date must be written as
// text (dd/mm/yyyy) — a raw serial would show as a bare number, the very bug
// that made the old output look wrong.
function fmtDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// One cell, keeping the template's own style; empty cells stay empty (still
// styled, so the border/shading is preserved).
const cell = (ref, s, val) => (val === '' || val == null
  ? `<c r="${ref}" s="${s}"/>`
  : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`);

// Split a full name into last / first, the way the form wants two columns.
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last: parts[0] || '', first: '' };
  return { last: parts[0], first: parts.slice(1).join(' ') };
}

// Turn a visit-report row (from buildVisitReport) into the form's fields.
export function visitToRow(v) {
  const c = v.caseObj || {};
  const f = c.data?.fields || {};
  const fam = splitName(v.familyName || f.employerName || c.family?.fullName);
  const wk = splitName(c.worker?.nameEn || f.nameEn || v.workerName); // English on the form
  return {
    idNumber: c.family?.idNumber || f.idNumber || '',
    familyLast: fam.last, familyFirst: fam.first,
    city: c.family?.city || f.city || '',
    street: f.street || '',
    familyPhone: c.family?.phone || f.contactPhone || f.mobile || '',
    workerLast: wk.last, workerFirst: wk.first,
    workerPhone: c.worker?.phone || f.workerPhone || '',
    passport: c.worker?.passportNo || f.passportNo || '',
    nationality: c.worker?.nationality || f.nationality || '',
    visitDate: v.doneDate || null,
    status: STATUS[v.kind?.key] || 'שוטף',
    placementType: PLACEMENT[f.placementType]
      || (f.placementFromIsrael === 'לא' ? 'השמה מחול' : 'השמה מהארץ'),
    startDate: f.startDate || null,
    doneBy: v.socialWorker || f.socialWorker || '',
    doneRole: f.socialWorkerRole || DEFAULT_ROLE,
  };
}

// The value that goes in each column of a data row, in column order.
function rowValues(index, v) {
  return {
    B: digits(v.idNumber), C: v.familyLast, D: v.familyFirst, E: v.city, F: v.street, G: digits(v.familyPhone),
    H: v.workerLast, I: v.workerFirst, J: v.workerPhone, K: v.passport, L: v.nationality,
    M: fmtDate(v.visitDate), N: v.status, O: v.placementType, P: fmtDate(v.startDate), Q: v.doneBy, R: v.doneRole,
  };
}

// Rebuild one existing data row with values, preserving the row's own opening
// attributes (height, spans) and column A's running number.
function fillRow(rowNum, index, v, openAttrs) {
  const vals = rowValues(index, v);
  const c = [`<c r="A${rowNum}" s="${A_STYLE}"><v>${index}</v></c>`];
  for (const col of COLS) c.push(cell(`${col}${rowNum}`, COL_STYLE[col], vals[col]));
  return `<row r="${rowNum}"${openAttrs}>${c.join('')}</row>`;
}

// Set a header cell (agency / year / quarter) without disturbing its style.
function setHeaderCell(xml, ref, value) {
  const styleMatch = xml.match(new RegExp(`<c r="${ref}"[^>]*?s="(\\d+)"`));
  const style = styleMatch ? ` s="${styleMatch[1]}"` : '';
  const replacement = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  const re = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>.*?</c>)`);
  return re.test(xml) ? xml.replace(re, replacement) : xml;
}

export async function buildInteriorWorkbook({ agency, year, quarter, visits }) {
  const buf = await fetch(templateUrl).then((r) => {
    if (!r.ok) throw new Error('טעינת תבנית הדוח למשרד הפנים נכשלה');
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file(SHEET).async('string');

  xml = setHeaderCell(xml, 'C4', agency || '');
  xml = setHeaderCell(xml, 'C5', year || '');
  xml = setHeaderCell(xml, 'C6', quarter || '');

  // Inject each visit into the next pre-formatted blank row; leave the rest blank.
  const rows = visits.slice(0, ROWS_AVAILABLE).map(visitToRow);
  rows.forEach((v, i) => {
    const rowNum = FIRST_DATA_ROW + i;
    const re = new RegExp(`<row r="${rowNum}"([^>]*)>.*?</row>`, 's');
    const m = xml.match(re);
    const openAttrs = m ? m[1] : ' spans="1:21" x14ac:dyDescent="0.2"';
    xml = m ? xml.replace(re, fillRow(rowNum, i + 1, v, openAttrs))
      : xml.replace('</sheetData>', `${fillRow(rowNum, i + 1, v, openAttrs)}</sheetData>`);
  });

  zip.file(SHEET, xml);
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadInteriorReport(opts) {
  const blob = await buildInteriorWorkbook(opts);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `דוח-רבעוני-משרד-הפנים-${opts.quarter || ''}.xlsx`.replace(/\s/g, '');
  // Firefox (and some mobile browsers) ignore .click() on an anchor that is not
  // in the document, so attach it before clicking and remove it after.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
