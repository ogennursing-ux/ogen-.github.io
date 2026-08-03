// מנות — the population-authority (רשות האוכלוסין) transmission interface.
//
// Every worker action (transfer, replacement, bringing from abroad) is filed to
// משרד הפנים as a "מנה": a fixed-width .txt record encoded in Windows-1255, sent
// together with a matching Hebrew cover letter (the email body). This module
// builds both from a case.
//
// ── CALIBRATION NOTE ────────────────────────────────────────────────────────
// The record is a fixed 704-character line. The exact column offsets below are
// reconstructed from the spec's reverse-engineered examples, whose spacing was
// mangled when copied into the PDF — so the FIELD WIDTHS here are PROVISIONAL.
// The cover letter, the action codes, the encoding and the workflow are exact;
// only the column offsets need locking against one real .txt sample. Everything
// is expressed through the SEGMENTS table so that locking them is a one-place
// edit. Until then, `MANOT.calibrated` stays false and the UI warns before use.
import { encodeCp1255 } from './cp1255.js';

export const MANOT = {
  corpId: '216095568',
  company: 'עוגן סיעוד ועובדים זרים בע"מ',
  companyShort: 'עוגן סיעוד ועובדים זרים',
  footer: '50021609556809990001',
  lineLen: 704,
  filePrefix: 'oz_siud_manot_216095568',
  calibrated: false, // flip to true once offsets are verified against a real file
};

// The 6-digit action code sits right after the corporation id. "מחליף מלשכה
// אחרת" and its 51–63-month variant share a code — they differ only in the
// cover-letter wording.
export const MANOT_ACTIONS = {
  transfer: { code: '090202', label: 'מעבר בין מעסיקים', letter: 'מעבר בין מעסיקים' },
  replace: { code: '090205', label: 'מחליף מלשכה אחרת', letter: 'מחליף מלשכה אחרת' },
  replace5163: { code: '090205', label: 'מחליף מלשכה אחרת · 51-63 חודש', letter: 'מחליף מלשכה אחרת 51-63 חודש' },
  abroad: { code: '090104', label: 'הברקה · הזמנת עובד מחו״ל', letter: 'הברקה', foreignAddress: true },
};

// Origin-country → the 3-digit prefix code. Seeded from the spec's examples;
// extend as real codes are confirmed. A case can override with its own value.
export const COUNTRY_CODES = {
  'הודו': '110',
  'פיליפינים': '131',
  'אוזבקיסטן': '315',
  'סרי לנקה': '112',
  'נפאל': '',
  'תאילנד': '',
  'מולדובה': '',
};

// ---- small helpers -------------------------------------------------------------

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');
// Split a full name into surname (first token) + given names (the rest), the way
// the government file and the cover letter present it ("SURNAME GIVEN NAMES").
const splitName = (full) => {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  return { last: parts[0] || '', first: parts.slice(1).join(' ') };
};
// Worker gender → the leading 1/2 digit used before the birth date and city block.
const genderDigit = (g) => (g === 'נקבה' || g === 'F' ? '2' : g === 'זכר' || g === 'M' ? '1' : '0');
// A date (ISO or dd/mm/yyyy or free text) → YYYYMMDD digits.
const ymd = (v) => {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + m[2] + m[3];
  m = /^(\d{2})[/.](\d{2})[/.](\d{4})/.exec(s);
  if (m) return m[3] + m[2] + m[1];
  return digitsOf(s).slice(0, 8);
};
// Fit a value to an exact width: truncate if long, pad with spaces if short.
const fit = (value, width) => {
  const s = String(value ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
};

// ---- pull the fields a מנה needs out of a case --------------------------------

export function extractManotData(caseObj, overrides = {}) {
  const f = caseObj?.data?.fields || {};
  const w = caseObj?.worker || {};
  const fam = caseObj?.family || {};
  const eng = splitName(w.nameEn || f.nameEn || '');
  const heb = splitName(w.nameHe || f.nameHe || '');
  const emp = splitName(fam.fullName || f.employerName || '');
  return {
    passport: w.passportNo || f.passportNo || '',
    engLast: eng.last, engFirst: eng.first,
    engFather: String(w.fatherName || f.fatherName || '').toUpperCase(),
    hebLast: heb.last, hebFirst: heb.first,
    gender: w.gender || f.workerGender || '',
    dob: w.dob || f.workerDob || '',
    nationality: w.nationality || f.nationality || '',
    countryCode: overrides.countryCode ?? f.manotCountryCode ?? COUNTRY_CODES[w.nationality || f.nationality] ?? '',
    permitNumber: fam.permitNumber || f.permitNumber || '',
    permitExpiry: fam.permitExpiry || f.permitExpiry || '',
    employerId: digitsOf(fam.idNumber || f.idNumber),
    employerLast: emp.last, employerFirst: emp.first,
    city: fam.city || f.city || '',
    citySymbol: overrides.citySymbol ?? f.manotCitySymbol ?? '',
    street: fam.street || f.street || '',
    phone: digitsOf(fam.phone || fam.mobile || f.contactPhone),
    // Cover-letter signer is the case coordinator (רכז).
    signer: fam.coordinator || f.coordinator || overrides.signer || '',
    // Home-country address, only for הברקה.
    originCity: overrides.originCity ?? f.manotOriginCity ?? '',
    originArea: overrides.originArea ?? f.manotOriginArea ?? '',
    originPostal: overrides.originPostal ?? f.manotOriginPostal ?? '',
  };
}

// ---- the fixed-width record ----------------------------------------------------

// Ordered segments of the 704-char line. `width` values are PROVISIONAL (see the
// calibration note); `get` reads the value from the extracted data. Editing this
// one table is all it takes to lock the layout against a real sample.
export function segmentsFor(action, d) {
  const a = MANOT_ACTIONS[action] || MANOT_ACTIONS.transfer;
  const segs = [
    { key: 'prefix', width: 3, get: () => '500' },
    { key: 'corp', width: 9, get: () => MANOT.corpId },
    { key: 'action', width: 6, get: () => a.code },
    { key: 'country', width: 3, get: () => fit(d.countryCode, 3) },
    { key: 'passport', width: 15, get: () => d.passport },
    { key: 'engLast', width: 20, get: () => d.engLast },
    { key: 'engFirst', width: 20, get: () => d.engFirst },
    { key: 'engFather', width: 20, get: () => d.engFather },
    { key: 'hebLast', width: 22, get: () => d.hebLast },
    { key: 'hebFirst', width: 20, get: () => d.hebFirst },
    { key: 'genderBirth', width: 9, get: () => genderDigit(d.gender) + ymd(d.dob) },
    { key: 'permit', width: 24, get: () => digitsOf(d.permitNumber) + ymd(d.permitExpiry) },
    { key: 'employerId', width: 10, get: () => '1' + fit(d.employerId, 9) },
    { key: 'employerLast', width: 18, get: () => d.employerLast },
    { key: 'employerFirst', width: 18, get: () => d.employerFirst },
    { key: 'cityBlock', width: 9, get: () => genderDigit(d.gender) + fit(d.citySymbol, 8) },
    { key: 'cityName', width: 20, get: () => d.city },
    { key: 'street', width: 30, get: () => d.street },
    { key: 'phone', width: 12, get: () => d.phone },
  ];
  if (a.foreignAddress) {
    segs.push(
      { key: 'originCity', width: 20, get: () => d.originCity },
      { key: 'originArea', width: 20, get: () => d.originArea },
      { key: 'originPostal', width: 10, get: () => d.originPostal },
    );
  }
  return segs;
}

// Build the single 704-char data line for one action + case data.
export function buildRecordLine(action, d) {
  const segs = segmentsFor(action, d);
  let line = segs.map((s) => fit(s.get(), s.width)).join('');
  // Trailing marker seen in every example, then pad (or trim) to the exact length.
  line += '000';
  return fit(line, MANOT.lineLen);
}

// The Hebrew cover letter (email body). The record and this text must match.
export function manotCoverLetter(action, d) {
  const a = MANOT_ACTIONS[action] || MANOT_ACTIONS.transfer;
  const emp = [d.employerLast, d.employerFirst].filter(Boolean).join(' ');
  const eng = [d.engLast, d.engFirst].filter(Boolean).join(' ');
  const subject = `${emp} ת.ז.:${d.employerId}-${a.letter} לעובד ${eng} דרכון ${d.passport} -תאגיד:${MANOT.companyShort} ${MANOT.corpId}`;
  const body = [
    subject,
    `הנדון ${a.letter} לעובד ${eng} מס.דרכון ${d.passport}`,
    'מצורף להלן הקובץ',
    'בברכה',
    d.signer || '',
    MANOT.company,
  ].join('\n');
  return { subject, body };
}

// The full file bytes: the data line, then the fixed footer, CRLF-separated,
// encoded in Windows-1255.
export function buildManotFileBytes(records) {
  const lines = records.map((r) => buildRecordLine(r.action, r.data));
  lines.push(MANOT.footer);
  return encodeCp1255(lines.join('\r\n') + '\r\n');
}

export function manotFileName(seq = 1) {
  return `${MANOT.filePrefix}_${String(seq).padStart(2, '0')}.txt`;
}

export function downloadManotFile(records, seq = 1) {
  const bytes = buildManotFileBytes(records);
  const blob = new Blob([bytes], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = manotFileName(seq);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
