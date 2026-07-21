// Fill עוגן's official 26-page placement packet by stamping the file's data
// onto the real blank template (bundled as an asset) — no legal text is
// retyped, so the wording stays exactly as approved. Values are rendered to a
// canvas and embedded as transparent PNGs so Hebrew and Latin both render
// correctly regardless of pdf-lib's built-in fonts.

import { PDFDocument } from 'pdf-lib';
import templateUrl from './assets/contract-template.pdf?url';

const SS = 3;    // supersample for crisp text
const LIFT = 4;  // raise values so they sit on the label's line, not below it

let _templateBytes = null;
async function loadTemplate() {
  if (_templateBytes) return _templateBytes;
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error('לא ניתן לטעון את תבנית החוזה.');
  _templateBytes = new Uint8Array(await res.arrayBuffer());
  return _templateBytes;
}

async function ensureFont() {
  if (document.fonts?.ready) {
    try { await document.fonts.load('400 11px Heebo'); await document.fonts.ready; } catch { /* fallback */ }
  }
}

// Render one value to a transparent PNG. Returns { bytes, width, height }.
function valueImage(text, { size = 10, weight = 500, color = '#111827', dir = 'rtl' } = {}) {
  const font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const str = String(text);
  const w = Math.max(1, Math.ceil(m.measureText(str).width)) + 4;
  const h = Math.ceil(size * 1.5);
  const c = document.createElement('canvas');
  c.width = w * SS; c.height = h * SS;
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.direction = dir;
  if (dir === 'rtl') { ctx.textAlign = 'right'; ctx.fillText(str, w - 2, h / 2); }
  else { ctx.textAlign = 'left'; ctx.fillText(str, 2, h / 2); }
  const b64 = c.toDataURL('image/png').split(',')[1];
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: w, height: h };
}

function fmtDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const mm = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return mm ? `${mm[3]}/${mm[2]}/${mm[1].slice(2)}` : s;
}

const workerNameEn = (w) => w?.nameEn || [w?.lastNameEn, w?.firstNameEn].filter(Boolean).join(' ') || w?.nameHe || '';
const clean = (v) => (v == null ? '' : String(v).trim());

// Field map, page by page. Each entry: { page, x, y, val, dir, align, size }.
// x/y are PDF points (origin bottom-left). align 'right' → x is the right edge
// (RTL Hebrew, value grows leftward); align 'left' → x is the left edge (LTR).
function buildFields(family, worker, opts) {
  const F = [];
  const date = fmtDate(opts.date || new Date().toISOString().slice(0, 10));
  const add = (page, x, y, val, o = {}) => { const v = clean(val); if (v) F.push({ page, x, y, val: v, dir: o.dir || 'rtl', align: o.align || (o.dir === 'ltr' ? 'left' : 'right'), size: o.size || 9.5 }); };

  const wName = workerNameEn(worker);
  const wCountry = clean(worker.nationality);
  const wPass = clean(worker.passportNo);
  const wCity = clean(worker.addrCity || worker.city);
  const wStreet = clean(worker.addrStreet) || wCity;
  const wDob = worker.dob ? fmtDate(worker.dob) : '';
  const eName = clean(family.fullName || [family.firstName, family.lastName].filter(Boolean).join(' '));
  const eId = clean(family.idNumber);
  const eStreet = clean(family.street);
  const eCity = clean(family.city);
  const ePhone = clean(family.phone || family.mobile);
  const gName = clean(family.contactName);
  const gId = clean(family.contactId);
  const gPhone = clean(family.contactMobile);
  const gRel = clean(family.contactRelation);
  // Split names for the government forms that ask first/last separately.
  const parts = (s) => clean(s).split(/\s+/).filter(Boolean);
  const eLast = clean(family.lastName) || parts(family.fullName).slice(-1)[0] || '';
  const eFirst = clean(family.firstName) || parts(family.fullName).slice(0, -1).join(' ') || '';
  const wLast = clean(worker.lastNameHe) || clean(worker.lastNameEn) || parts(worker.nameHe || worker.nameEn).slice(-1)[0] || '';
  const wFirst = clean(worker.firstNameHe) || clean(worker.firstNameEn) || parts(worker.nameHe || worker.nameEn).slice(0, -1).join(' ') || '';
  const eZip = clean(family.zip);
  const eMobile = clean(family.mobile);
  const wGender = clean(worker.gender);
  // Employment terms (from the worker record; the intake chat fills these).
  const startDate = worker.startDate ? fmtDate(worker.startDate) : (family.placementStart ? fmtDate(family.placementStart) : '');
  const daysWk = clean(worker.daysPerWeek);
  const hoursDay = clean(worker.hoursPerDay);
  const salary = clean(worker.salary || family.offeredSalary);

  // ---------- Page 1 — מכתב השמה / Certificate of Placement ----------
  // Hebrew (RTL, align right = value ends just left of the label).
  add(0, 265, 727, date);                       // registered on (intro date)
  add(0, 548, 611, wName);                       // worker: מר/גב'
  add(0, 325, 611, wPass);                       // worker: דרכון מספר
  add(0, 172, 611, wCountry);                    // worker: ארץ מוצא
  add(0, 522, 593, wStreet);                     // worker: רחוב ומספר
  add(0, 458, 593, wCity);                       // worker: עיר
  add(0, 340, 593, wDob);                        // worker: ת.לידה
  add(0, 546, 540, eName);                       // employer: מר/גב'
  add(0, 471, 540, eId);                         // employer: ת.ז
  add(0, 522, 519, eStreet);                     // employer: רחוב ומספר
  add(0, 417, 519, eCity);                       // employer: עיר
  add(0, 243, 519, ePhone);                      // employer: טלפון
  add(0, 535, 448, gName);                       // guardian: שם
  add(0, 444, 448, gId);                         // guardian: ת.ז
  add(0, 550, 426, gPhone);                      // guardian: טלפון
  add(0, 394, 426, gRel);                        // guardian: קירבה למטופל
  // English (LTR, align left = value starts just right of the label).
  add(0, 478, 377, date, { dir: 'ltr', size: 9 }); // registered on (date):
  add(0, 56, 275, wName, { dir: 'ltr' });        // Caregiver Mr./Ms.
  add(0, 238, 273, wCountry, { dir: 'ltr' });    // Passport County
  add(0, 373, 273, wPass, { dir: 'ltr' });       // Passport Number
  add(0, 61, 234, eName, { dir: 'ltr' });        // Employer Mr / Mrs
  add(0, 199, 234, eId, { dir: 'ltr' });         // I.D. number
  add(0, 88, 220, eStreet, { dir: 'ltr' });      // Street Address
  add(0, 200, 218, eCity, { dir: 'ltr' });       // City
  add(0, 201, 149, gName, { dir: 'ltr' });       // Guardian name
  add(0, 355, 151, gId, { dir: 'ltr' });         // Guardian I.D.
  add(0, 521, 149, gPhone, { dir: 'ltr' });      // Guardian Telephone

  // ---------- Page 2 — ביטוח לאומי / הצהרת מעסיק (values sit one row below the header) ----------
  const C = (page, x, yLabel, val, o = {}) => add(page, x, yLabel - 17, val, { align: 'center', ...o });
  C(1, 514, 469, eLast);    // employer שם משפחה
  C(1, 356, 469, eFirst);   // employer שם פרטי
  C(1, 180, 469, eId);      // employer מספר זהות
  C(1, 514, 423, eStreet);  // רחוב ומספר
  C(1, 291, 423, eCity);    // ישוב
  C(1, 127, 422, eZip);     // מיקוד
  C(1, 514, 392, ePhone);   // מספר טלפון
  C(1, 330, 392, eMobile);  // טלפון נייד
  C(1, 514, 320, wLast);    // worker שם משפחה
  C(1, 368, 320, wFirst);   // worker שם פרטי
  C(1, 200, 320, wPass);    // worker מספר זהות (passport)
  C(1, 123, 319, wGender);  // מין
  C(1, 513, 246, startDate);// מועד תחילת העבודה
  C(1, 383, 246, daysWk);   // ימי עבודה בשבוע
  C(1, 280, 246, hoursDay); // שעות עבודה ביום
  C(1, 180, 246, salary);   // סכום השכר

  // ---------- Page 11 — חוזה העסקה: employer + caregiver (value centered between the EN/HE labels) ----------
  add(10, 302, 437, eName, { align: 'center' });    // Employer name / מר/גב'
  add(10, 276, 423, eId, { align: 'center' });      // Employer ID No / תעודת זהות
  add(10, 301, 409, [eStreet, eCity].filter(Boolean).join(', '), { align: 'center' }); // Address/Workplace
  add(10, 310, 380, ePhone, { align: 'center' });   // phone number / טלפון
  add(10, 304, 217, workerNameEn(worker), { align: 'center' }); // Caregiver name
  add(10, 335, 202, wCountry, { align: 'center' }); // Country of Citizenship / מדינה

  return F;
}

/**
 * Fill the official packet from the family file + linked worker.
 * @returns {Promise<Uint8Array>}
 */
export async function buildFilledContract(family = {}, worker = {}, opts = {}) {
  await ensureFont();
  const bytes = await loadTemplate();
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  const fields = buildFields(family, worker, opts);

  for (const f of fields) {
    const page = pages[f.page];
    if (!page) continue;
    const img = valueImage(f.val, { size: f.size, dir: f.dir });
    const png = await pdf.embedPng(img.bytes);
    const x = f.align === 'right' ? f.x - img.width
      : f.align === 'center' ? f.x - img.width / 2
      : f.x;
    page.drawImage(png, { x, y: f.y - img.height / 2 + LIFT, width: img.width, height: img.height });
  }
  return pdf.save();
}
