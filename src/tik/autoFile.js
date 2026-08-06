// Auto-file: drop a document, let the AI read it, and file it into the right
// worker's history by itself. Builds on the existing pieces — extractDocument
// (AI reads the scan), the case registry (to find the owner by passport), and
// addDocumentEntry (writes it into the file + updates the flat expiry).
import { extractDocument } from './gemini.js';
import { addDocumentEntry, uploadCaseFile, DOC_TYPES, eventsFor } from './caseDetail.js';

const EXPIRY_FIELD = { passport: 'passportExpiry', visa: 'visaExpiry', permit: 'permitExpiry', insurance: 'insuranceExpiry' };
const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

// Guess the document type from which expiry the AI found.
export function detectDocType(fields) {
  if (fields.permitExpiry) return 'permit';
  if (fields.visaExpiry) return 'visa';
  if (fields.insuranceExpiry) return 'insurance';
  return 'passport'; // passport, or an id doc with a number
}

export const expiryOf = (docKey, fields) => fields[EXPIRY_FIELD[docKey]] || '';

// Read one file and match it to a case by passport number.
export async function analyzeDocument(file, cases) {
  // extractDocument returns { patch, raw }; the cleaned patch wins over raw.
  const res = await extractDocument(file, 'other');
  const fields = { ...(res.raw || {}), ...(res.patch || {}) };
  const docKey = detectDocType(fields);
  const passport = norm(fields.passportNo);
  const match = passport ? cases.find((c) => norm(c.worker?.passportNo) === passport) : null;
  return {
    file,
    fields,
    docKey,
    passport: fields.passportNo || '',
    personName: fields.nameEn || fields.nameHe || '',
    expiry: expiryOf(docKey, fields),
    caseId: match?.id || '',
  };
}

// File a reviewed item into its chosen case: upload the scan + write the entry.
export async function fileDocument(item, caseObj) {
  const type = DOC_TYPES.find((t) => t.key === item.docKey);
  const attachment = await uploadCaseFile(caseObj, item.docKey, item.file);
  await addDocumentEntry(caseObj, item.docKey, {
    event: eventsFor(item.docKey)[0],
    number: (type?.numberField && item.fields[type.numberField]) || item.passport || '',
    expiry: item.expiry || '',
    note: 'תויק אוטומטית ע"י AI',
    attachment,
  });
}
