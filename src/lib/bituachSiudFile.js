// Generator + parser for the Israeli National Insurance ("ביטוח לאומי")
// nursing-care ("סיעוד") fixed-width data file — the same format as the
// exported sample `oz_siud_manot_<id>_<batch>.txt`.
//
// The file is a single data record + a trailer, encoded in **ISO-8859-8**
// (Hebrew), space-padded to fixed widths, with Tab (0x09) separators between
// the first few segments and CRLF line endings.
//
// We reproduce the sample byte-for-byte by starting from the sample's exact
// byte layout (TEMPLATE_LINE1) and overlaying only the fields that can be
// extracted from an ID card / passport (id, names, birth date, phone,
// address). The remaining bytes are opaque National-Insurance codes we keep
// verbatim until an official field spec is available — see docs/siud-file-format.md.
//
// No external dependencies. Runs in the browser, Node and Deno.

// --- Base template captured from the sample (exact ISO-8859-8 bytes) --------

const LINE1_B64 =
  'NTAwMjE2MDk1NTY4MDkwMjAyMzE1RkEwODEwOTQ0ICAgICAgCUtPQklMT1YgICAgICAgICAgICAJRk9SSUdKT04gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCffl4ens5eEgICAgICAgICAgIAn05fjp4mDl7zExOTg5MTAxMjIwMDU1ICA5NzQ3ODA3MDAyMDI2MDQzMDEwMjY5MjM4NjIgICAgICAgICAgICAgICAgICAgICAgICAgICAgIODl7Ong7CAgICAgICAgICAgICAgIOnk5ePkMTE5NDE1MDAwICAgICAgICAgICAgICAgICD67CDg4enhIC0g6fTlICAgICDj6fjkIO7w5+0g4Pjh5CAgICAgMTAgICAgIDA1NDc4MjQ2NTIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAwMCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA=';

const FOOTER_B64 = 'NTAwMjE2MDk1NTY4MDk5OTAwMDE=';

// Byte offset of the 9-digit id inside both the data record and the trailer.
const ID_OFFSET = 3;
const ID_WIDTH = 9;

// Overlayable fields: byte offset (== char offset, single-byte encoding),
// width, alignment and expected script. Offsets verified against the sample.
export const FIELD_MAP = {
  id:              { offset: 3,   width: 9,  align: 'left',  script: 'ascii' },
  lastNameLatin:   { offset: 37,  width: 19, align: 'left',  script: 'ascii' },
  firstNameLatin:  { offset: 57,  width: 51, align: 'left',  script: 'ascii' },
  lastNameHebrew:  { offset: 109, width: 18, align: 'left',  script: 'hebrew' },
  // NOTE: in the sample the Hebrew first name butts directly against the
  // packed numeric block, so its width could only be inferred (8). If a real
  // spec gives a different width, change it here — everything downstream is
  // template-relative and keeps its byte position.
  firstNameHebrew: { offset: 128, width: 8,  align: 'left',  script: 'hebrew' },
  birthDate:       { offset: 137, width: 8,  align: 'left',  script: 'ascii' }, // YYYYMMDD
  city:            { offset: 260, width: 18, align: 'left',  script: 'hebrew' },
  street:          { offset: 278, width: 19, align: 'left',  script: 'hebrew' },
  house:           { offset: 297, width: 7,  align: 'left',  script: 'ascii' },
  phone:           { offset: 304, width: 10, align: 'left',  script: 'ascii' },
};

// --- ISO-8859-8 (Hebrew) single-byte encoding ------------------------------

// Hebrew block U+05D0..U+05EA maps linearly onto 0xE0..0xFA in ISO-8859-8.
const HEBREW_OFFSET = 0x05d0 - 0xe0; // 0x4F0

/** Encode a JS string to an ISO-8859-8 byte array. */
export function encodeIso88598(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp <= 0x7f) {
      out[i] = cp; // ASCII: digits, latin letters, space, '`', '-', etc.
    } else if (cp >= 0x05d0 && cp <= 0x05ea) {
      out[i] = cp - HEBREW_OFFSET; // Hebrew letters (incl. final forms)
    } else {
      out[i] = 0x3f; // '?' for anything the format can't represent
    }
  }
  return out;
}

/** Decode an ISO-8859-8 byte array (or slice) back to a JS string. */
export function decodeIso88598(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0xe0 && b <= 0xfa) s += String.fromCharCode(b + HEBREW_OFFSET);
    else s += String.fromCharCode(b);
  }
  return s;
}

// --- base64 helpers that work in browser, Node and Deno --------------------

function b64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64')); // Node
}

export function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64'); // Node
}

// --- field writing ----------------------------------------------------------

function normalize(value, field) {
  let s = value == null ? '' : String(value);
  if (field.script === 'ascii') s = s.toUpperCase();
  // Left-align, pad right with spaces, truncate to width.
  if (s.length > field.width) s = s.slice(0, field.width);
  else s = s + ' '.repeat(field.width - s.length);
  return s;
}

function overlayField(bytes, field, value) {
  const encoded = encodeIso88598(normalize(value, field));
  bytes.set(encoded, field.offset);
}

// --- public API -------------------------------------------------------------

/**
 * Build the nursing-care ("סיעוד") file for one person.
 *
 * @param {object} record
 * @param {string} record.id              9-digit national id
 * @param {string} [record.lastNameLatin]  surname in Latin letters
 * @param {string} [record.firstNameLatin] given name in Latin letters
 * @param {string} [record.lastNameHebrew] surname in Hebrew
 * @param {string} [record.firstNameHebrew] given name in Hebrew
 * @param {string} [record.birthDate]      date of birth as YYYYMMDD
 * @param {string} [record.city]           city (Hebrew)
 * @param {string} [record.street]         street + building name (Hebrew)
 * @param {string} [record.house]          house / apartment number
 * @param {string} [record.phone]          phone number (digits)
 * @returns {Uint8Array} the file content, ISO-8859-8 encoded, CRLF-terminated.
 */
export function buildSiudFileBytes(record) {
  if (!record || !/^\d{9}$/.test(String(record.id || ''))) {
    throw new Error('record.id must be a 9-digit national id');
  }

  const line1 = b64ToBytes(LINE1_B64); // fresh copy of the template
  const footer = b64ToBytes(FOOTER_B64);

  for (const [key, field] of Object.entries(FIELD_MAP)) {
    if (key === 'id') continue; // handled below (also appears in trailer)
    if (record[key] != null && record[key] !== '') overlayField(line1, field, record[key]);
  }

  // Stamp the id into both the record and the trailer at the same offset.
  const idBytes = encodeIso88598(normalize(record.id, FIELD_MAP.id));
  line1.set(idBytes, ID_OFFSET);
  footer.set(idBytes, ID_OFFSET);

  const CRLF = new Uint8Array([0x0d, 0x0a]);
  const total = line1.length + CRLF.length + footer.length + CRLF.length;
  const out = new Uint8Array(total);
  let p = 0;
  out.set(line1, p); p += line1.length;
  out.set(CRLF, p); p += CRLF.length;
  out.set(footer, p); p += footer.length;
  out.set(CRLF, p);
  return out;
}

/** Convenience: same as buildSiudFileBytes but returns base64 (handy for HTTP/Make). */
export function buildSiudFileBase64(record) {
  return bytesToBase64(buildSiudFileBytes(record));
}

/** Suggested filename, matching the sample: `oz_siud_manot_<id>_<batch>.txt`. */
export function siudFileName(id, batch = '90') {
  return `oz_siud_manot_${id}_${batch}.txt`;
}

/** Parse a file (Uint8Array) back into the fields we know how to read. */
export function parseSiudFileBytes(bytes) {
  const nl = findCrlf(bytes);
  const line1 = nl >= 0 ? bytes.subarray(0, nl) : bytes;
  const out = {};
  for (const [key, field] of Object.entries(FIELD_MAP)) {
    const slice = line1.subarray(field.offset, field.offset + field.width);
    out[key] = decodeIso88598(slice).replace(/[ ]+$/, '');
  }
  return out;
}

function findCrlf(bytes) {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) return i;
  }
  return -1;
}
