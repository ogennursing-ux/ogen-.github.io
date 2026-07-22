// Fill עוגן's official 26-page placement packet by stamping the file's data
// onto the real blank template (bundled as an asset) — no legal text is
// retyped, so the wording stays exactly as approved. Values are rendered to a
// canvas and embedded as transparent PNGs so Hebrew and Latin both render
// correctly regardless of pdf-lib's built-in fonts.

import { PDFDocument, rgb } from 'pdf-lib';
import templateUrl from './assets/contract-template.pdf?url';

// The template carries a previous client's details printed on the service
// agreement (page 3). Cover those exact spots with white before stamping the
// real client, so no stale name/ID shows through.
const WHITEOUT = [
  { page: 2, x0: 470, y0: 588, x1: 532, y1: 604 }, // pg3: old client name
  { page: 2, x0: 340, y0: 590, x1: 402, y1: 605 }, // pg3: old client ת"ז
  { page: 9, x0: 28, y0: 367, x1: 126, y1: 380 },  // pg10: old caregiver name in the declaration
];

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

// Nationality in Hebrew for the Hebrew side of the bilingual contract.
const HE_NATIONALITY = {
  philippines: 'פיליפינים', india: 'הודו', nepal: 'נפאל', 'sri lanka': 'סרי לנקה',
  thailand: 'תאילנד', moldova: 'מולדובה', ukraine: 'אוקראינה', uzbekistan: 'אוזבקיסטן',
  romania: 'רומניה', russia: 'רוסיה', 'south africa': 'דרום אפריקה',
};
const heNationality = (v) => HE_NATIONALITY[clean(v).toLowerCase()] || clean(v);

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
  const hoursDay = '24'; // live-in caregiver: around-the-clock availability
  // Contract salary = gross monthly + weekly allowance × 4 (the allowance must
  // be included in the contract by law). E.g. 6500 + 100×4 = 6900.
  const num = (v) => { const m = String(v == null ? '' : v).replace(/[^\d.]/g, ''); return m ? parseFloat(m) : 0; };
  const baseSalary = num(worker.salary || family.offeredSalary);
  const weeklyAllow = num(worker.weeklyAdvance);
  const salary = baseSalary ? String(Math.round(baseSalary + weeklyAllow * 4)) : '';

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

  // ---------- Page 11 — חוזה העסקה (SEC): bilingual. Hebrew details go on the
  // Hebrew (right) column, next to the Hebrew labels; the caregiver's Latin
  // name/country go on the English (left) column — NOT centered in the middle.
  const eAddr = [eStreet, eCity].filter(Boolean).join(', ');
  const wNameHe = clean(worker.nameHe) || clean([worker.firstNameHe, worker.lastNameHe].filter(Boolean).join(' '));
  // A. Employer — Hebrew details on the Hebrew (right) side AND mirrored on the
  // English (left) side, so both columns are filled the same way.
  add(10, 459, 437, eName, { align: 'right' });                 // מר/גב'
  add(10, 421, 423, eId, { align: 'right', dir: 'ltr' });       // מס' תעודת זהות
  add(10, 400, 409, eAddr, { align: 'right' });                 // כתובת/מקום העבודה
  add(10, 446, 380, ePhone, { align: 'right', dir: 'ltr' });    // מס' טלפון
  add(10, 145, 437, eName, { align: 'left' });                  // Mr./Ms.
  add(10, 136, 423, eId, { align: 'left', dir: 'ltr' });        // ID No.
  add(10, 196, 409, eAddr, { align: 'left' });                  // Address/Workplace
  add(10, 174, 380, ePhone, { align: 'left', dir: 'ltr' });     // phone number
  // B. Caregiver → Hebrew name/country on the right, Latin name/country on the left.
  add(10, 458, 217, wNameHe, { align: 'right' });               // מר/גב' (עברית)
  add(10, 423, 202, heNationality(wCountry), { align: 'right' }); // מדינה/אזרחות (עברית)
  add(10, 150, 217, workerNameEn(worker), { align: 'left', dir: 'ltr' }); // Mr./Ms. (Latin)
  add(10, 211, 202, wCountry, { align: 'left', dir: 'ltr' });   // Country of Citizenship (Latin)

  // ---------- Page 3 — הסכם שירותי ליווי והשמה (client identity) ----------
  add(2, 501, 596, eName, { align: 'center' });                    // client name (old data whited out)
  add(2, 372, 597, eId, { align: 'center' });                      // client ת"ז
  add(2, 440, 560, gName, { align: 'center' });                    // guardian / attorney name (blank line)
  add(2, 270, 560, gId, { align: 'center' });                      // guardian ת"ז
  add(2, 400, 525, [eStreet, eCity].filter(Boolean).join(' '), { align: 'center' }); // address

  // ---------- Page 10 — הזמנת עבודה / Job Order (English, LTR) ----------
  const wAge = worker.dob ? String(new Date().getFullYear() - new Date(String(worker.dob).slice(0, 4)).getFullYear() || '') : '';
  // The employer name/ID/address blanks here are too small for Hebrew and those
  // details already appear on every other page — so on this dense form we fill
  // only the fields that fit cleanly.
  const jo = { dir: 'ltr', size: 8 };
  add(9, 223, 659, wAge && wAge !== 'NaN' ? wAge : '', jo);      // Age
  add(9, 156, 638, gName, jo);                                   // Contact person
  add(9, 346, 582, clean(worker.languages), jo);                // Languages
  add(9, 98, 437, salary, jo);                                  // Monthly salary (Nis)
  add(9, 77, 374, workerNameEn(worker), { dir: 'ltr', align: 'center', size: 8 }); // declaration name
  add(9, 256, 373, wPass, jo);                                  // Passport No

  // ---------- Page 6 — הצהרת מעסיק להירשם בלשכה (patient + guardian) ----------
  add(5, 522, 611, eName);                                   // שם המטופל
  add(5, 533, 587, eId);                                     // מספר ת.ז
  add(5, 515, 560, ePhone);                                  // טלפון/פלאפון
  add(5, 524, 538, clean(family.permitNumber));              // היתר מספר
  add(5, 429, 537, family.permitExpiry ? fmtDate(family.permitExpiry) : ''); // בתוקף עד
  add(5, 560, 465, gName);                                   // guardian שם
  add(5, 560, 441, gId);                                     // guardian ת.ז
  add(5, 515, 414, gPhone);                                  // guardian טלפון

  // ---------- Page 8 — הצהרת עובד המבקש לעבור ללשכה אחרת (worker details) ----------
  add(7, 530, 599, wName);                                  // שם העובד
  add(7, 523, 574, wPass);                                  // מספר דרכון
  add(7, 503, 551, clean(worker.phone));                   // מספר טלפון נייד
  add(7, 508, 528, [worker.addrStreet, worker.addrCity].filter(Boolean).join(' ')); // כתובת מגורים
  add(7, 135, 311, wName, { dir: 'ltr', align: 'center', size: 8 });   // I the undersigned, <name>
  add(7, 279, 311, wCountry, { dir: 'ltr', align: 'center', size: 8 });// Passport Country
  add(7, 390, 311, wPass, { dir: 'ltr', size: 8 });                    // Passport Number

  // ---------- Page 26 — בקשה להארכת אשרה (values sit below each header) ----------
  const B = (x, yh, val, o = {}) => add(25, x, yh - 12, val, { align: 'center', ...o });
  // Applicant (worker) — names
  B(467, 738, wLast); B(332, 740, wFirst);
  B(196, 740, clean(worker.fatherName)); B(65, 740, clean(worker.motherName));
  // passport row
  B(475, 687, wPass); B(355, 687, wCountry);
  B(227, 688, worker.passportExpiry ? fmtDate(worker.passportExpiry) : '');
  // birth / status row
  B(491, 645, clean(worker.placeOfBirth)); B(355, 646, wDob);
  B(248, 644, clean(worker.maritalStatus)); B(80, 644, clean(worker.spouseName));
  // address in Israel (worker lives at the employer's address)
  B(494, 598, eCity); B(252, 598, eStreet); B(80, 598, clean(worker.phone));
  // employer + employee (middle block)
  B(492, 379, eName); B(358, 379, eId); B(230, 379, wName); B(84, 379, wPass);
  // employer + employee (bottom agency block)
  B(492, 191, eName); B(358, 191, eId); B(230, 191, wName); B(84, 191, wPass);

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

  // Paint over any stale printed data first.
  for (const w of WHITEOUT) {
    const page = pages[w.page];
    if (!page) continue;
    page.drawRectangle({ x: w.x0, y: w.y0, width: w.x1 - w.x0, height: w.y1 - w.y0, color: rgb(1, 1, 1) });
  }

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
