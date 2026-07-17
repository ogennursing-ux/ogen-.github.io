// Export workers / families to a CSV that opens cleanly in Excel (Hebrew).
// A UTF-8 BOM is prepended so Excel detects the encoding and shows Hebrew
// correctly instead of gibberish.

// Order and labels follow the client's extraction spec. A third element
// 'date' marks fields that must be formatted DD/MM/YYYY on output.
export const WORKER_COLS = [
  ['firstNameHe', 'שם פרטי (עברית)'], ['firstNameEn', 'שם פרטי (אנגלית)'],
  ['lastNameHe', 'שם משפחה (עברית)'], ['lastNameEn', 'שם משפחה (אנגלית)'],
  ['passportNo', 'מספר דרכון'],
  ['passportIssueDate', 'תאריך הוצאת דרכון', 'date'],
  ['passportExpiry', 'תאריך פקיעת דרכון', 'date'],
  ['dob', 'תאריך לידה', 'date'],
  ['addrStreet', 'רחוב (Street)'], ['addrCity', 'עיר (City)'],
  ['addrRegion', 'מחוז/אזור (State/Region)'], ['addrPostal', 'מיקוד (Postal Code)'],
  ['addrCountry', 'מדינה (Country)'],
  ['languages', 'שפות'], ['maritalStatus', 'מצב משפחתי'], ['spouseName', 'שם בן/בת הזוג'],
  ['fatherName', 'שם האב'], ['motherName', 'שם האם'],
  ['nationality', 'אזרחות'], ['phone', 'מספר טלפון'], ['gender', 'מין'],
  ['overseasAgency', 'שם חברת כוח האדם בחו"ל'],
  ['visaExpiry', 'תוקף אשרה', 'date'], ['permitExpiry', 'תוקף היתר', 'date'],
  ['insuranceExpiry', 'תוקף ביטוח', 'date'],
  ['employer', 'מעסיק'], ['patientName', 'שם מטופל'], ['salary', 'שכר חודשי'],
  ['daysPerWeek', 'ימים בשבוע'], ['hoursPerDay', 'שעות ביום'],
  ['weeklyDayOff', 'יום חופש שבועי'], ['weeklyAdvance', 'מקדמה שבועית'],
  ['notes', 'הערות'],
];

// Order and labels follow the client's family extraction spec.
export const FAMILY_COLS = [
  ['firstName', 'שם פרטי'], ['lastName', 'שם משפחה'],
  ['idNumber', 'תעודת זהות'], ['dob', 'תאריך לידה', 'date'], ['gender', 'מין'],
  ['idIssueDate', 'תאריך הוצאת תעודת זהות', 'date'],
  ['street', 'כתובת'], ['city', 'עיר מגורים'],
  ['permitIssueDate', 'תאריך הוצאת ההיתר', 'date'], ['permitExpiry', 'תאריך סיום ההיתר', 'date'],
  // additional useful details
  ['phone', 'טלפון'], ['mobile', 'נייד'], ['email', 'אימייל'],
  ['contactName', 'איש קשר'], ['contactMobile', 'נייד איש קשר'], ['contactRelation', 'קרבה'],
  ['permitNumber', 'מספר היתר'],
  ['visaExpiry', 'תוקף אשרה', 'date'], ['insuranceExpiry', 'תוקף ביטוח', 'date'],
  ['status', 'סטטוס'], ['coordinator', 'רכז/ת'], ['notes', 'הערות'],
];

// YYYY-MM-DD -> DD/MM/YYYY (per the client's spec). Anything else passes through.
export function toDMY(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
export function fmtCell(col, rec) {
  const [key, , type] = col;
  const v = rec[key];
  if (type === 'date') return toDMY(v);
  if (key === 'gender') return v === 'ז' ? 'זכר' : v === 'נ' ? 'נקבה' : (v || '');
  return v == null ? '' : String(v);
}

function esc(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(cols, rows) {
  const header = cols.map(([, label]) => esc(label)).join(',');
  const body = rows.map((r) => cols.map((col) => esc(fmtCell(col, r))).join(',')).join('\r\n');
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
