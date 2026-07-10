// Read a scanned identity/immigration document (passport, visa, work permit)
// with Google's Gemini vision model and return the worker fields it can see.
//
// The key is the user's own Google AI Studio key, stored locally (see Settings
// in TikApp). This calls the Generative Language REST API directly from the
// browser — no backend — using structured JSON output so the result maps
// straight onto the worker record.

const KEY_STORAGE = 'tik_gemini_key';
const MODEL_STORAGE = 'tik_gemini_model';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export function getGeminiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}
export function setGeminiKey(v) {
  try {
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}
export function getGeminiModel() {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}
export function setGeminiModel(v) {
  try {
    if (v && v !== DEFAULT_MODEL) localStorage.setItem(MODEL_STORAGE, v);
    else localStorage.removeItem(MODEL_STORAGE);
  } catch {
    /* ignore */
  }
}

// The fields Gemini is asked to return. Keys match the worker record.
const FIELD_KEYS = [
  'nameEn',
  'nameHe',
  'passportNo',
  'nationality',
  'dob',
  'gender',
  'placeOfBirth',
  'fatherName',
  'motherName',
  'maritalStatus',
  'passportIssueDate',
  'issuePlace',
  'passportExpiry',
  'visaExpiry',
  'permitExpiry',
];

const DATE_KEYS = new Set(['dob', 'passportIssueDate', 'passportExpiry', 'visaExpiry', 'permitExpiry']);

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: FIELD_KEYS.reduce((acc, k) => {
    acc[k] = { type: 'string' };
    return acc;
  }, {}),
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Normalise anything date-ish (e.g. "05 AUG 2032", "05/08/2032", "2032-08-05")
// to the YYYY-MM-DD that the <input type="date"> expects.
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
function normalizeDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  if ((m = s.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{2,4})$/))) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if ((m = s.match(/^(\d{1,2})[\/.\- ]([A-Za-z]{3})[A-Za-z]*[\/.\- ](\d{2,4})$/))) {
    const [, d, mon, y4] = m;
    const mo = MONTHS[mon.toLowerCase()];
    let y = y4;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    if (mo) return `${y}-${mo}-${d.padStart(2, '0')}`;
  }
  return ''; // unrecognised — leave blank rather than store garbage
}

function normalizeGender(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['ז', 'm', 'male', 'זכר'].includes(s)) return 'ז';
  if (['נ', 'f', 'female', 'נקבה'].includes(s)) return 'נ';
  return '';
}

// Turn Gemini's raw object into a clean worker-field patch (only non-empty).
export function toWorkerPatch(raw) {
  const patch = {};
  for (const k of FIELD_KEYS) {
    let v = raw && raw[k] != null ? String(raw[k]).trim() : '';
    if (!v) continue;
    if (DATE_KEYS.has(k)) {
      v = normalizeDate(v);
    } else if (k === 'gender') {
      v = normalizeGender(v);
    }
    if (v) patch[k] = v;
  }
  return patch;
}

const CATEGORY_HINT = {
  passport: 'This is a PASSPORT. Read the printed data and the MRZ (the two <<< lines at the bottom).',
  visa: 'This is a VISA / entry permit sticker or page.',
  permit: 'This is an employment permit (היתר העסקה).',
  insurance: 'This is a health-insurance document for the worker.',
};

/**
 * Extract worker fields from a document image via Gemini.
 * @param {Blob} blob        the image (image/*)
 * @param {string} category  passport|visa|permit|insurance|other
 * @returns {Promise<{patch: object, raw: object}>}
 */
// Shared call: send an image + prompt + JSON schema to Gemini, return the parsed
// object. Handles the key check and error messages.
async function callGemini(blob, prompt, schema) {
  const key = getGeminiKey();
  if (!key) throw new Error('לא הוגדר מפתח Gemini. פתח/י את ההגדרות (⚙) והזן/י מפתח.');
  if (!blob || !blob.type?.startsWith('image/')) {
    throw new Error('הקריאה האוטומטית עובדת על תמונות (JPG/PNG). ל-PDF, צלם/י או ייצא/י כתמונה.');
  }
  const b64 = await blobToBase64(blob);
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: blob.type, data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error('החיבור ל-Gemini נכשל. בדוק/י חיבור אינטרנט. (' + (e?.message || e) + ')');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    if (res.status === 400 && /API key not valid/i.test(detail)) throw new Error('מפתח ה-Gemini אינו תקין. בדוק/י אותו בהגדרות.');
    if (res.status === 429) throw new Error('חרגת ממכסת השימוש ב-Gemini. נסה/י שוב מאוחר יותר.');
    throw new Error('שגיאת Gemini (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('לא הצלחתי לפענח את תשובת Gemini. נסה/י תמונה ברורה יותר.');
  }
}

// Text-only Gemini call (no image) — used to parse a free-text message.
async function callGeminiText(prompt, schema) {
  const key = getGeminiKey();
  if (!key) throw new Error('לא הוגדר מפתח Gemini.');
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('שגיאת Gemini (' + res.status + ')');
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  try { return JSON.parse(text); } catch { return {}; }
}

// Parse a free-text message (e.g. a Telegram message from the agent) into
// worker or family fields. Returns {} on any failure, so the caller can fall
// back to keeping the raw text.
export async function extractFromText(text, target = 'worker') {
  if (!getGeminiKey() || !text) return {};
  if (target === 'family') {
    const raw = await callGeminiText(
      'Extract patient/family details from this Hebrew free text into JSON ' +
      '(keys: fullName, idNumber, dob, gender, city, street, phone, contactName, contactMobile; ' +
      'dates as YYYY-MM-DD; empty string if missing). Text: """' + text + '"""',
      FAMILY_SCHEMA,
    ).catch(() => ({}));
    return toFamilyPatch(raw);
  }
  const raw = await callGeminiText(
    'Extract foreign-worker details from this Hebrew free text into JSON ' +
    '(keys: nameHe, nameEn, passportNo, nationality, dob, gender, phone, email, visaExpiry, permitExpiry; ' +
    'dates as YYYY-MM-DD; empty string if missing). Text: """' + text + '"""',
    RESPONSE_SCHEMA,
  ).catch(() => ({}));
  return toWorkerPatch(raw);
}

export async function extractDocument(blob, category) {
  const prompt =
    'You are reading a scanned identity/immigration document of a foreign care worker in Israel. ' +
    (CATEGORY_HINT[category] || '') +
    ' The document may be printed OR handwritten. Read EVERY field visible (printed data and the MRZ) and return them as JSON:\n' +
    '- nameEn: full name in Latin letters (as printed)\n' +
    '- nameHe: full name in Hebrew letters. If the document shows Hebrew, use it; otherwise transliterate the Latin name into Hebrew letters.\n' +
    '- passportNo: passport/document number\n' +
    '- nationality: nationality or issuing country, in Hebrew if you know it, else as printed\n' +
    '- dob: date of birth\n' +
    "- gender: 'ז' for male, 'נ' for female\n" +
    '- placeOfBirth: place/city of birth, in Hebrew if you know it, else as printed\n' +
    "- fatherName: father's name if shown, else empty\n" +
    "- motherName: mother's name if shown, else empty\n" +
    '- maritalStatus: marital status in Hebrew, else empty\n' +
    '- passportIssueDate: date the passport/document was issued\n' +
    '- issuePlace: place/authority of issue, in Hebrew if you know it, else as printed\n' +
    '- passportExpiry: passport expiry date (only for a passport)\n' +
    '- visaExpiry: visa expiry date (only for a visa)\n' +
    '- permitExpiry: work-permit expiry date (only for a permit)\n' +
    'Return every date as YYYY-MM-DD. If a field is not visible, return an empty string. Do not guess.';
  const raw = await callGemini(blob, prompt, RESPONSE_SCHEMA);
  return { patch: toWorkerPatch(raw), raw };
}

// ---- family / patient documents (Israeli ID, permit, insurance) ----

const FAMILY_FIELD_KEYS = [
  'fullName', 'idNumber', 'dob', 'gender', 'city', 'street', 'zip', 'phone',
  'contactName', 'contactMobile', 'permitExpiry', 'insuranceExpiry',
];
const FAMILY_SCHEMA = {
  type: 'object',
  properties: [...FAMILY_FIELD_KEYS, 'rawText'].reduce((a, k) => { a[k] = { type: 'string' }; return a; }, {}),
};
const FAMILY_DATE_KEYS = new Set(['dob', 'permitExpiry', 'insuranceExpiry']);

export function toFamilyPatch(raw) {
  const patch = {};
  for (const k of FAMILY_FIELD_KEYS) {
    let v = raw && raw[k] != null ? String(raw[k]).trim() : '';
    if (!v) continue;
    if (FAMILY_DATE_KEYS.has(k)) v = normalizeDate(v);
    else if (k === 'gender') v = normalizeGender(v);
    if (v) patch[k] = v;
  }
  return patch;
}

const FAMILY_HINT = {
  id: 'This is an Israeli identity card / appendix (תעודת זהות / ספח).',
  permit: 'This is an employment permit (היתר העסקה).',
  insurance: 'This is an insurance document.',
};

// Extract patient/family fields. Also returns rawText — everything Gemini can
// read (useful when details are handwritten and do not map to a field, so the
// user can copy the words and place them manually).
export async function extractFamilyDocument(blob, category) {
  const prompt =
    'You are reading a scanned document of an elderly care patient / their family in Israel. ' +
    (FAMILY_HINT[category] || '') +
    ' The document may be printed OR HANDWRITTEN. Read carefully, including handwriting, and return JSON:\n' +
    '- fullName: full name of the patient (Hebrew)\n' +
    '- idNumber: Israeli ID number (ת.ז), digits only\n' +
    '- dob: date of birth\n' +
    "- gender: 'ז' for male, 'נ' for female\n" +
    '- city: city / town of residence\n' +
    '- street: street and house/apartment\n' +
    '- zip: postal code\n' +
    '- phone: any phone number of the patient\n' +
    '- contactName: a contact person name if present\n' +
    '- contactMobile: a contact person phone if present\n' +
    '- permitExpiry: permit validity date if present\n' +
    '- insuranceExpiry: insurance validity date if present\n' +
    '- rawText: ALL text you can read on the document, exactly as written (including handwriting), line by line\n' +
    'Return every date as YYYY-MM-DD. If a field is not visible, return an empty string. Do not guess field values, but DO include everything you see in rawText.';
  const raw = await callGemini(blob, prompt, FAMILY_SCHEMA);
  return { patch: toFamilyPatch(raw), raw, rawText: raw?.rawText ? String(raw.rawText) : '' };
}
