// Fill a Word (.docx) contract template with a worker's details, preserving the
// document's original formatting, logo and layout.
//
// A .docx is a zip of XML parts. We replace {{placeholders}} inside the text
// parts (document, headers, footers). Word often splits a typed placeholder
// across several <w:t> runs, so for every paragraph that contains a "{{" we
// concatenate its runs, replace, and put the whole result back into the first
// run — this makes split placeholders work. Paragraphs without a placeholder
// are left completely untouched, so their formatting is fully preserved.

import JSZip from 'jszip';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const DATE_FIELDS = new Set([
  'dob', 'passportIssueDate', 'passportExpiry', 'visaExpiry', 'permitExpiry',
  'insuranceExpiry', 'startDate',
]);

const genderWord = (v) => (v === 'ז' ? 'זכר' : v === 'נ' ? 'נקבה' : '');

// Build the placeholder -> value map a template can reference. A care contract
// combines BOTH sides of the same placement: the worker (דרכון) and the
// family/patient (ת.ז). Pass { worker, family } and both are available —
// worker fields keep their own keys, patient fields use patient*/contact* keys.
export function buildValueMap(records = {}, opts = {}) {
  // Back-compat: a bare worker object (not { worker, family }) is treated as the
  // worker.
  const worker = records.worker || (records.family ? null : records);
  const family = records.family || null;
  const map = {};

  if (worker) {
    for (const [k, v] of Object.entries(worker)) {
      if (k === 'signature') continue; // never dump the signature image as text
      if (v == null) map[k] = '';
      else if (DATE_FIELDS.has(k)) map[k] = fmtDate(v);
      else if (k === 'gender') map[k] = genderWord(v);
      else map[k] = String(v);
    }
  }

  if (family) {
    const f = family;
    map.patientName = f.fullName || '';
    map.patientId = f.idNumber || '';
    map.patientDob = fmtDate(f.dob);
    map.patientGender = genderWord(f.gender);
    map.patientCity = f.city || '';
    map.patientStreet = f.street || '';
    map.patientAddress = [f.street, f.city].filter(Boolean).join(', ');
    map.patientPhone = f.phone || f.mobile || '';
    map.patientMobile = f.mobile || '';
    map.patientMaritalStatus = f.maritalStatus || '';
    map.contactName = f.contactName || '';
    map.contactRelation = f.contactRelation || '';
    map.contactPhone = f.contactMobile || '';
    map.contactId = f.contactId || '';
    map.clientNo = f.clientNo || '';
    map.eligibilityLevel = f.eligibilityLevel || '';
    map.contractNote = f.contractNote || '';
    map.patientVisaExpiry = fmtDate(f.visaExpiry);
    map.patientPermitExpiry = fmtDate(f.permitExpiry);
    map.patientInsuranceExpiry = fmtDate(f.insuranceExpiry);
  }

  map.today = fmtDate(new Date().toISOString());
  map.companyName = opts.companyName || '';
  return map;
}

// Hebrew label for each placeholder/field, shared by the template help and the
// PDF placement editor.
export const CONTRACT_FIELD_LABELS = {
  nameHe: 'שם בעברית',
  nameEn: 'שם באנגלית',
  passportNo: 'מספר דרכון',
  nationality: 'אזרחות',
  dob: 'תאריך לידה',
  gender: 'מין',
  placeOfBirth: 'מקום לידה',
  fatherName: 'שם האב',
  motherName: 'שם האם',
  maritalStatus: 'מצב משפחתי',
  passportIssueDate: 'תאריך הנפקת דרכון',
  issuePlace: 'מקום הנפקה',
  passportExpiry: 'תוקף דרכון',
  visaExpiry: 'תוקף אשרה',
  permitExpiry: 'תוקף היתר',
  insuranceExpiry: 'תוקף ביטוח',
  employer: 'מעסיק',
  patientName: 'שם המטופל/ת',
  address: 'כתובת',
  startDate: 'תאריך תחילת עבודה',
  salary: 'שכר חודשי',
  phone: 'טלפון',
  email: 'אימייל',
  notes: 'הערות',
  today: 'תאריך היום',
  companyName: 'שם החברה',
  signature: 'חתימה ✍️',
  // family / patient side of the contract
  patientName: 'שם המטופל',
  patientId: 'ת.ז מטופל',
  patientDob: 'ת.לידה מטופל',
  patientGender: 'מין מטופל',
  patientAddress: 'כתובת מטופל',
  patientCity: 'יישוב מטופל',
  patientStreet: 'רחוב מטופל',
  patientPhone: 'טלפון מטופל',
  patientMaritalStatus: 'מצב משפחתי מטופל',
  contactName: 'שם איש קשר',
  contactRelation: 'קרבה',
  contactPhone: 'טלפון איש קשר',
  contactId: 'ת.ז איש קשר',
  clientNo: 'מספר לקוח',
  eligibilityLevel: 'רמת זכאות',
  contractNote: 'הערה לחוזה',
  patientVisaExpiry: 'תוקף אשרה (מטופל)',
  patientPermitExpiry: 'תוקף היתר (מטופל)',
  patientInsuranceExpiry: 'תוקף ביטוח (מטופל)',
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Worker-side placeholder keys.
export const WORKER_KEYS = [
  'nameHe', 'nameEn', 'passportNo', 'nationality', 'dob', 'gender',
  'placeOfBirth', 'fatherName', 'motherName', 'maritalStatus',
  'passportIssueDate', 'issuePlace', 'passportExpiry', 'visaExpiry',
  'permitExpiry', 'insuranceExpiry', 'employer', 'address',
  'startDate', 'salary', 'phone', 'email', 'notes',
];
// Family/patient-side placeholder keys (both sides feed one contract).
export const PATIENT_KEYS = [
  'patientName', 'patientId', 'patientDob', 'patientGender', 'patientAddress',
  'patientCity', 'patientStreet', 'patientPhone', 'patientMaritalStatus',
  'contactName', 'contactRelation', 'contactPhone', 'contactId', 'clientNo',
  'eligibilityLevel', 'contractNote', 'patientVisaExpiry', 'patientPermitExpiry',
  'patientInsuranceExpiry',
];
// All keys available to templates (for the on-screen help + placement palette).
export const PLACEHOLDER_KEYS = [...WORKER_KEYS, ...PATIENT_KEYS, 'today', 'companyName'];

function replaceInText(text, map) {
  return text.replace(PLACEHOLDER, (whole, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole,
  );
}

// Merge placeholders inside one XML part (document/header/footer).
function mergeXml(xml, map) {
  if (xml.indexOf('{{') === -1) return xml; // nothing to do
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = doc.getElementsByTagName('w:p');

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const texts = p.getElementsByTagName('w:t');
    if (!texts.length) continue;
    let combined = '';
    for (let j = 0; j < texts.length; j++) combined += texts[j].textContent;
    if (combined.indexOf('{{') === -1) continue; // this paragraph has no field

    const replaced = replaceInText(combined, map);
    // Put the whole replaced text into the first run; blank the rest.
    texts[0].textContent = replaced;
    texts[0].setAttribute('xml:space', 'preserve');
    for (let j = 1; j < texts.length; j++) texts[j].textContent = '';
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * @param {Blob|ArrayBuffer} template  the .docx template
 * @param {object} records             { worker, family } — both sides of the placement
 * @param {object} [opts]              { companyName }
 * @returns {Promise<Blob>}            the filled .docx
 */
export async function mergeDocx(template, records, opts = {}) {
  const buf = template instanceof Blob ? await template.arrayBuffer() : template;
  const zip = await JSZip.loadAsync(buf);
  const map = buildValueMap(records, opts);

  // Every main text part: document, all headers and footers.
  const names = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(n),
  );
  for (const name of names) {
    const xml = await zip.file(name).async('string');
    zip.file(name, mergeXml(xml, map));
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
