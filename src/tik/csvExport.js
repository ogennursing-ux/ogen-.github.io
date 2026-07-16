// Export workers / families to a CSV that opens cleanly in Excel (Hebrew).
// A UTF-8 BOM is prepended so Excel detects the encoding and shows Hebrew
// correctly instead of gibberish.

export const WORKER_COLS = [
  ['nameHe', 'שם בעברית'], ['nameEn', 'שם באנגלית'], ['passportNo', 'מספר דרכון'],
  ['nationality', 'אזרחות'], ['dob', 'תאריך לידה'], ['gender', 'מין'],
  ['phone', 'טלפון'], ['email', 'אימייל'], ['passportExpiry', 'תוקף דרכון'],
  ['visaExpiry', 'תוקף אשרה'], ['permitExpiry', 'תוקף היתר'], ['insuranceExpiry', 'תוקף ביטוח'],
  ['employer', 'מעסיק'], ['patientName', 'שם מטופל'], ['address', 'כתובת'],
  ['startDate', 'תחילת העסקה'], ['salary', 'שכר'], ['notes', 'הערות'],
];

export const FAMILY_COLS = [
  ['fullName', 'שם מלא'], ['idNumber', 'ת.זהות'], ['dob', 'תאריך לידה'], ['gender', 'מין'],
  ['city', 'יישוב'], ['street', 'רחוב'], ['phone', 'טלפון'], ['mobile', 'נייד'], ['email', 'אימייל'],
  ['contactName', 'איש קשר'], ['contactMobile', 'נייד איש קשר'], ['contactRelation', 'קרבה'],
  ['visaExpiry', 'תוקף אשרה'], ['insuranceExpiry', 'תוקף ביטוח'], ['permitExpiry', 'תוקף היתר'],
  ['status', 'סטטוס'], ['coordinator', 'רכז/ת'], ['notes', 'הערות'],
];

function esc(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(cols, rows) {
  const header = cols.map(([, label]) => esc(label)).join(',');
  const body = rows.map((r) => cols.map(([key]) => esc(r[key])).join(',')).join('\r\n');
  return '﻿' + header + '\r\n' + body; // BOM for Excel
}

function download(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportWorkersCsv(workers) {
  download(toCsv(WORKER_COLS, workers || []), `עובדים-${stamp()}.csv`);
}
export function exportFamiliesCsv(families) {
  download(toCsv(FAMILY_COLS, families || []), `משפחות-${stamp()}.csv`);
}
