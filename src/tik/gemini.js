// Read a scanned identity/immigration document (passport, visa, work permit)
// with Google's Gemini vision model and return the worker fields it can see.
//
// The key is the user's own Google AI Studio key, stored locally (see Settings
// in TikApp). This calls the Generative Language REST API directly from the
// browser — no backend — using structured JSON output so the result maps
// straight onto the worker record.

const KEY_STORAGE = 'tik_gemini_key';
const MODEL_STORAGE = 'tik_gemini_model';
const DEFAULT_MODEL = 'gemini-flash-latest';

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

// ---- Groq provider (OpenAI-compatible; keys start with gsk_) ----
const GROQ_KEY = 'tik_groq_key';
const GROQ_TEXT = 'tik_groq_model';
const GROQ_VISION = 'tik_groq_vision';
const DEFAULT_GROQ_TEXT = 'llama-3.3-70b-versatile';
const DEFAULT_GROQ_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct';

const ls = (k, d = '') => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v, d) => { try { if (v && v !== d) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } };

export const getGroqKey = () => ls(GROQ_KEY);
export const setGroqKey = (v) => lsSet(GROQ_KEY, v);
export const getGroqTextModel = () => ls(GROQ_TEXT, DEFAULT_GROQ_TEXT);
export const setGroqTextModel = (v) => lsSet(GROQ_TEXT, v, DEFAULT_GROQ_TEXT);
export const getGroqVisionModel = () => ls(GROQ_VISION, DEFAULT_GROQ_VISION);
export const setGroqVisionModel = (v) => lsSet(GROQ_VISION, v, DEFAULT_GROQ_VISION);

// True if any AI provider is configured. Groq takes priority when both are set.
export const hasAI = () => !!getGroqKey() || !!getGeminiKey();
const useGroq = () => !!getGroqKey();

// Call Groq's chat completions and parse the JSON object it returns.
async function callGroq(messages, model) {
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getGroqKey() },
      body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: 'json_object' } }),
    });
  } catch (e) {
    throw new Error('החיבור ל-Groq נכשל (ייתכן חסימת דפדפן/רשת): ' + (e?.message || e));
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('מפתח ה-Groq אינו תקין. בדוק/י אותו בהגדרות.');
    if (res.status === 429) throw new Error('חרגת ממכסת השימוש ב-Groq. נסה/י שוב מאוחר יותר.');
    if (res.status === 404 || /model/i.test(detail)) throw new Error('דגם ה-Groq אינו זמין. עדכן/י את שם הדגם בהגדרות. ' + detail);
    throw new Error('שגיאת Groq (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  try { return JSON.parse(text); } catch { return {}; }
}

// Groq image extraction: send the image + a prompt that lists the wanted keys.
async function groqVision(blob, promptText, keys) {
  const b64 = await blobToBase64(blob);
  const prompt = promptText + '\nReturn ONLY a JSON object with these keys: ' + keys.join(', ') + '. Empty string if a field is missing. Dates as YYYY-MM-DD.';
  const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${blob.type};base64,${b64}` } }] }];
  return callGroq(messages, getGroqVisionModel());
}
async function groqText(promptText, keys) {
  const prompt = promptText + '\nReturn ONLY a JSON object with these keys: ' + keys.join(', ') + '. Empty string if a field is missing. Dates as YYYY-MM-DD.';
  return callGroq([{ role: 'user', content: prompt }], getGroqTextModel());
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
  if (!hasAI() || !text) return {};
  if (target === 'family') {
    const p = 'Extract patient/family details from this Hebrew free text. Text: """' + text + '"""';
    const keys = ['fullName', 'idNumber', 'dob', 'gender', 'city', 'street', 'phone', 'contactName', 'contactMobile'];
    const raw = await (useGroq() ? groqText(p, keys) : callGeminiText(p + ' (keys: ' + keys.join(', ') + '; dates YYYY-MM-DD; empty if missing)', FAMILY_SCHEMA)).catch(() => ({}));
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
  if (!hasAI()) throw new Error('לא הוגדר מפתח AI. פתח/י ⚙ הגדרות והזן/י מפתח Groq או Gemini.');
  if (!blob || !blob.type?.startsWith('image/')) throw new Error('הקריאה האוטומטית עובדת על תמונות (JPG/PNG). ל-PDF, צלם/י או ייצא/י כתמונה.');
  const raw = useGroq() ? await groqVision(blob, prompt, FIELD_KEYS) : await callGemini(blob, prompt, RESPONSE_SCHEMA);
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
  if (!hasAI()) throw new Error('לא הוגדר מפתח AI. פתח/י ⚙ הגדרות והזן/י מפתח Groq או Gemini.');
  if (!blob || !blob.type?.startsWith('image/')) throw new Error('הקריאה האוטומטית עובדת על תמונות (JPG/PNG).');
  const raw = useGroq() ? await groqVision(blob, prompt, [...FAMILY_FIELD_KEYS, 'rawText']) : await callGemini(blob, prompt, FAMILY_SCHEMA);
  return { patch: toFamilyPatch(raw), raw, rawText: raw?.rawText ? String(raw.rawText) : '' };
}

// ---- smart import: one input (photo / screenshot / free text), AI decides ----
// what it is AND which details belong to the WORKER (foreign caregiver / מטפל)
// and which to the EMPLOYER/PATIENT (Israeli family / מעסיק), filling both.

const SMART_WORKER_KEYS = [
  'nameHe', 'nameEn', 'passportNo', 'nationality', 'dob', 'gender', 'placeOfBirth',
  'fatherName', 'motherName', 'maritalStatus', 'phone', 'email',
  'passportIssueDate', 'issuePlace', 'passportExpiry', 'visaExpiry', 'permitExpiry', 'insuranceExpiry',
];
const SMART_PATIENT_KEYS = [
  'fullName', 'idNumber', 'dob', 'gender', 'maritalStatus', 'city', 'street', 'zip',
  'phone', 'mobile', 'email', 'contactName', 'contactRelation', 'contactMobile', 'contactId',
  'permitExpiry', 'insuranceExpiry',
];
const SMART_DATE_KEYS = new Set([
  'dob', 'passportIssueDate', 'passportExpiry', 'visaExpiry', 'permitExpiry', 'insuranceExpiry',
]);

function smartPatch(obj, keys) {
  const patch = {};
  for (const k of keys) {
    let v = obj && obj[k] != null ? String(obj[k]).trim() : '';
    if (!v) continue;
    if (SMART_DATE_KEYS.has(k)) v = normalizeDate(v);
    else if (k === 'gender') v = normalizeGender(v);
    if (v) patch[k] = v;
  }
  return patch;
}

const objProps = (keys) => keys.reduce((a, k) => { a[k] = { type: 'string' }; return a; }, {});
const SMART_SCHEMA = {
  type: 'object',
  properties: {
    docType: { type: 'string' },
    worker: { type: 'object', properties: objProps(SMART_WORKER_KEYS) },
    patient: { type: 'object', properties: objProps(SMART_PATIENT_KEYS) },
    rawText: { type: 'string' },
  },
};

const SMART_INSTRUCTION =
  'You are importing details for an Israeli home-care placement. The input may be a PHOTO ' +
  '(passport, Israeli ID / תעודת זהות, work permit / היתר העסקה, insurance) OR a SCREENSHOT of a form ' +
  'OR free TEXT the user copied — and it may be printed or HANDWRITTEN. There are TWO people and you must ' +
  'decide, for EACH detail, which one it belongs to:\n' +
  '- "worker" = the FOREIGN CARE WORKER (מטפל/ת). Cues: a Latin/foreign name, passport number, ' +
  'foreign nationality (Philippines, India, Nepal, Sri Lanka, Moldova, …), visa, work permit.\n' +
  '- "patient" = the ISRAELI EMPLOYER / care recipient & family (מעסיק / מטופל). Cues: Israeli ID number ' +
  '(ת.ז, ~9 digits), a Hebrew name, an Israeli address/city, a contact person.\n' +
  'Return ONLY a JSON object of this exact shape:\n' +
  '{ "docType": "<short Hebrew label of the input, e.g. דרכון / תעודת זהות / היתר העסקה / ביטוח / צילום מסך / טקסט>",\n' +
  '  "worker": { ' + SMART_WORKER_KEYS.join(', ') + ' },\n' +
  '  "patient": { ' + SMART_PATIENT_KEYS.join(', ') + ' },\n' +
  '  "rawText": "every line of text you can read, exactly as written" }\n' +
  "Dates as YYYY-MM-DD. gender is 'ז' (male) or 'נ' (female). Use an empty string for any field you cannot see. " +
  'Do NOT invent values. If a detail is ambiguous, place it on the side it best fits, and always fill rawText.';

async function groqVisionRaw(blob, prompt) {
  const b64 = await blobToBase64(blob);
  const messages = [{ role: 'user', content: [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: `data:${blob.type};base64,${b64}` } },
  ] }];
  return callGroq(messages, getGroqVisionModel());
}
const groqTextRaw = (prompt) => callGroq([{ role: 'user', content: prompt }], getGroqTextModel());

/**
 * Smart import from a photo/screenshot OR pasted text.
 * @param {{blob?: Blob, text?: string}} input
 * @returns {Promise<{docType:string, worker:object, patient:object, rawText:string}>}
 */
export async function smartImport({ blob, text } = {}) {
  if (!hasAI()) throw new Error('לא הוגדר מפתח AI. פתח/י ⚙ הגדרות והזן/י מפתח Groq או Gemini.');
  let raw;
  if (blob) {
    if (!blob.type?.startsWith('image/')) {
      throw new Error('קריאת תמונה עובדת על JPG/PNG. ל-PDF צלם/י או ייצא/י כתמונה, או הדבק/י טקסט.');
    }
    raw = useGroq() ? await groqVisionRaw(blob, SMART_INSTRUCTION) : await callGemini(blob, SMART_INSTRUCTION, SMART_SCHEMA);
  } else {
    const t = String(text || '').trim();
    if (!t) throw new Error('אין קלט — הדבק/י טקסט או בחר/י תמונה.');
    const prompt = SMART_INSTRUCTION + '\n\nINPUT TEXT:\n"""' + t + '"""';
    raw = useGroq() ? await groqTextRaw(prompt) : await callGeminiText(prompt, SMART_SCHEMA);
  }
  return {
    docType: raw?.docType ? String(raw.docType).trim() : '',
    worker: smartPatch(raw?.worker, SMART_WORKER_KEYS),
    patient: smartPatch(raw?.patient, SMART_PATIENT_KEYS),
    rawText: raw?.rawText ? String(raw.rawText) : '',
  };
}
