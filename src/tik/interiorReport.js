// Fills the quarterly report to משרד הפנים that private caregiving agencies file
// each quarter, listing the home visits the social worker carried out. It uses
// the government's own .xlsx as the template — the exact one the office sends —
// so the output looks identical to a hand-filled report: the same columns, the
// same date cells, the same status vocabulary, and the managers' declaration
// sheet untouched. We open it with JSZip, drop the quarter's visits into the
// visits sheet and the agency/year/quarter into the header, and hand back a
// ready-to-file workbook.

import JSZip from 'jszip';
import templateUrl from './assets/interior-quarterly-template.xlsx?url';

const SHEET = 'xl/worksheets/sheet2.xml';
const FIRST_DATA_ROW = 9;

// The cell styles the government template uses on a filled row: plain data
// cells, the two date columns, and the running-number column.
const S_DATA = 53;   // text / number data cell
const S_DATE = 54;   // date cell (formats a serial number as a date)
const S_NUM = 13;    // the # column
const ROW_HEIGHT = '39.6';

// A social-worker visit kind → the form's own status words. The placement
// visit is filed as "טרום השמה", the 30-day visit as "אחרי", the rest "שוטף".
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

// Excel stores a date as the number of days since 1899-12-30; the cell's date
// format then renders it. Using a real serial (not text) makes the column
// behave like a date, exactly as in a hand-filled report.
function excelSerial(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

const textCell = (ref, val) => (val === '' || val == null
  ? `<c r="${ref}" s="${S_DATA}"/>`
  : `<c r="${ref}" s="${S_DATA}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`);
const numCell = (ref, val) => (val === '' || val == null || Number.isNaN(Number(val))
  ? `<c r="${ref}" s="${S_DATA}"/>`
  : `<c r="${ref}" s="${S_DATA}"><v>${Number(val)}</v></c>`);
const dateCell = (ref, dateVal) => {
  const s = excelSerial(dateVal);
  return s == null ? `<c r="${ref}" s="${S_DATE}"/>` : `<c r="${ref}" s="${S_DATE}"><v>${s}</v></c>`;
};

// digits only — the form keeps the household phone as a plain number.
const digits = (v) => String(v || '').replace(/\D/g, '');

function rowXml(rowNum, index, v) {
  const c = [];
  c.push(`<c r="A${rowNum}" s="${S_NUM}"><v>${index}</v></c>`);
  c.push(numCell(`B${rowNum}`, digits(v.idNumber)));          // תעודת זהות
  c.push(textCell(`C${rowNum}`, v.familyLast));               // שם משפחה (מטופל)
  c.push(textCell(`D${rowNum}`, v.familyFirst));              // שם פרטי
  c.push(textCell(`E${rowNum}`, v.city));                     // יישוב
  c.push(textCell(`F${rowNum}`, v.street));                   // רחוב
  c.push(numCell(`G${rowNum}`, digits(v.familyPhone)));       // טלפון
  c.push(textCell(`H${rowNum}`, v.workerLast));               // שם משפחה (עובד, אנגלית)
  c.push(textCell(`I${rowNum}`, v.workerFirst));              // שם פרטי
  c.push(textCell(`J${rowNum}`, v.workerPhone));              // פלאפון
  c.push(textCell(`K${rowNum}`, v.passport));                 // מספר דרכון
  c.push(textCell(`L${rowNum}`, v.nationality));              // ארץ מוצא
  c.push(dateCell(`M${rowNum}`, v.visitDate));                // תאריך הביקור
  c.push(textCell(`N${rowNum}`, v.status));                   // סטטוס ביקור
  c.push(textCell(`O${rowNum}`, v.placementType));            // סוג השמה
  c.push(dateCell(`P${rowNum}`, v.startDate));                // תאריך השמה
  c.push(textCell(`Q${rowNum}`, v.doneBy));                   // מבצע הביקור
  c.push(textCell(`R${rowNum}`, v.doneRole));                 // תפקיד מבצע הביקור
  return `<row r="${rowNum}" spans="1:21" ht="${ROW_HEIGHT}" x14ac:dyDescent="0.25">${c.join('')}</row>`;
}

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

  // The template is stripped to its header (rows 1–8); append one row per visit.
  const rows = visits.map(visitToRow)
    .map((v, i) => rowXml(FIRST_DATA_ROW + i, i + 1, v))
    .join('');
  xml = xml.replace('</sheetData>', rows + '</sheetData>');

  zip.file(SHEET, xml);
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadInteriorReport(opts) {
  const blob = await buildInteriorWorkbook(opts);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `דוח-רבעוני-משרד-הפנים-${opts.quarter || ''}.xlsx`.replace(/\s/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
