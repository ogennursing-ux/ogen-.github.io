// Fills the official quarterly report (דוח רבעוני למת״ש) that private caregiving
// agencies must file, using the government's own .xlsx as the template. We open
// the template with JSZip, drop the quarter's visits into its visits sheet and
// the agency/year/quarter into its header, and hand back a ready-to-file file —
// so the exact official layout, the managers' declaration sheet and the
// formatting are preserved untouched.
//
// This is the "שידור קבוצתי למת״ש": one batch (מנה) of visits, per quarter.

import JSZip from 'jszip';
import templateUrl from './assets/matash-quarterly-template.xlsx?url';

const SHEET = 'xl/worksheets/sheet2.xml';

// The visits sheet's columns, in order, each with the style id the template's
// blank rows already use — so a filled row looks like the empty ones around it.
const COLS = [
  ['B', 16], ['C', 1], ['D', 1], ['E', 1], ['F', 1], ['G', 17],
  ['H', 16], ['I', 1], ['J', 1], ['K', 1], ['L', 17],
  ['M', 16], ['N', 41], ['O', 43], ['P', 1], ['Q', 1], ['R', 17],
];
const FIRST_DATA_ROW = 9;

// A social-worker visit kind, said the way the government form says it.
const STATUS = { placement: 'לאחר השמה', day30: 'לאחר השמה', periodic: 'שוטף' };
// The placement's origin, mapped to the form's three options.
const PLACEMENT = {
  'השמה מהארץ': 'עובד ממאגר',
  'השמה מחו״ל': 'עובד מחו"ל',
  'העברה מלשכה אחרת': 'עובד ממאגר',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cell = (ref, style, value) => (value === '' || value == null
  ? `<c r="${ref}" s="${style}"/>`
  : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`);

// One visit → the 17 filled cells B..R for its row.
function rowXml(rowNum, v) {
  const values = [
    v.idNumber, v.familyLast, v.familyFirst, v.city, v.street, v.familyPhone,
    v.workerLast, v.workerFirst, v.workerPhone, v.passport, v.nationality,
    v.visitDate, v.status, v.placementType, v.startDate, v.doneBy, v.doneRole,
  ];
  const cells = COLS.map(([col, style], i) => cell(`${col}${rowNum}`, style, values[i])).join('');
  return `<row r="${rowNum}" spans="1:21" x14ac:dyDescent="0.2"><c r="A${rowNum}" s="14"><v>${rowNum - FIRST_DATA_ROW + 1}</v></c>${cells}</row>`;
}

// dd/mm/yyyy, the way the form is filled by hand.
function fmtDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Split a full name into last / first the way the form wants two columns.
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { last: parts[0] || '', first: '' };
  return { last: parts[0], first: parts.slice(1).join(' ') };
}

// Turn a visit-report row (from buildVisitReport) into the form's fields.
export function visitToMatashRow(v) {
  const c = v.caseObj || {};
  const f = c.data?.fields || {};
  const fam = splitName(v.familyName || f.employerName || c.family?.fullName);
  // The foreign worker's name is entered in English on the form.
  const wk = splitName(c.worker?.nameEn || f.nameEn || v.workerName);
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
    visitDate: fmtDate(v.doneDate),
    status: STATUS[v.kind?.key] || 'שוטף',
    placementType: PLACEMENT[f.placementType] || f.placementType || '',
    startDate: fmtDate(f.startDate),
    doneBy: v.socialWorker || f.socialWorker || '',
    doneRole: f.socialWorkerRole || 'עובד/ת סוציאלי/ת',
  };
}

// Set a single header cell (agency / year / quarter) without disturbing its style.
function setHeaderCell(xml, ref, value) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>.*?</c>)`);
  const styleMatch = xml.match(new RegExp(`<c r="${ref}"[^>]*?s="(\\d+)"`));
  const style = styleMatch ? ` s="${styleMatch[1]}"` : '';
  const replacement = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return re.test(xml) ? xml.replace(re, replacement) : xml;
}

export async function buildMatashWorkbook({ agency, year, quarter, visits }) {
  const buf = await fetch(templateUrl).then((r) => {
    if (!r.ok) throw new Error('טעינת תבנית מת״ש נכשלה');
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file(SHEET).async('string');

  // Header: agency name, report year, report quarter.
  xml = setHeaderCell(xml, 'C4', agency || '');
  xml = setHeaderCell(xml, 'C5', year || '');
  xml = setHeaderCell(xml, 'C6', quarter || '');

  // Replace each blank data row with a filled one, in order.
  const rows = visits.map(visitToMatashRow);
  rows.forEach((v, i) => {
    const rowNum = FIRST_DATA_ROW + i;
    const re = new RegExp(`<row r="${rowNum}"[^>]*>.*?</row>`);
    if (re.test(xml)) xml = xml.replace(re, rowXml(rowNum, v));
  });

  zip.file(SHEET, xml);
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadMatashReport(opts) {
  const blob = await buildMatashWorkbook(opts);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `דוח-רבעוני-מתש-${opts.quarter || ''}.xlsx`.replace(/\s/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
