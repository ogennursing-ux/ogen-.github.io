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

// Build the placeholder -> value map the template can reference.
export function buildValueMap(worker, opts = {}) {
  const map = {};
  for (const [k, v] of Object.entries(worker || {})) {
    if (v == null) {
      map[k] = '';
    } else if (DATE_FIELDS.has(k)) {
      map[k] = fmtDate(v);
    } else if (k === 'gender') {
      map[k] = v === 'ז' ? 'זכר' : v === 'נ' ? 'נקבה' : '';
    } else {
      map[k] = String(v);
    }
  }
  map.today = fmtDate(new Date().toISOString());
  map.companyName = opts.companyName || '';
  return map;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// List of placeholder keys available to templates (for the on-screen help).
export const PLACEHOLDER_KEYS = [
  'nameHe', 'nameEn', 'passportNo', 'nationality', 'dob', 'gender',
  'placeOfBirth', 'fatherName', 'motherName', 'maritalStatus',
  'passportIssueDate', 'issuePlace', 'passportExpiry', 'visaExpiry',
  'permitExpiry', 'insuranceExpiry', 'employer', 'patientName', 'address',
  'startDate', 'salary', 'phone', 'email', 'notes', 'today', 'companyName',
];

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
 * @param {object} worker              the worker record
 * @param {object} [opts]              { companyName }
 * @returns {Promise<Blob>}            the filled .docx
 */
export async function mergeDocx(template, worker, opts = {}) {
  const buf = template instanceof Blob ? await template.arrayBuffer() : template;
  const zip = await JSZip.loadAsync(buf);
  const map = buildValueMap(worker, opts);

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
