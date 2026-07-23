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
  // pg10 (Job Order) is rebuilt from scratch as a clean page — see drawJobOrderImage.
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

// Pure letter-by-letter transliteration of Hebrew to Latin for the English-only
// forms — no word translation, just the letters.
const HE_LETTER = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'o', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'i',
  'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
  'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't', '"': '', "'": '', '־': '-',
};
function toLatin(v) {
  const s = clean(v);
  if (!s || /[A-Za-z]/.test(s)) return s; // empty or already Latin
  return s.split(/\s+/).map((w) => {
    const ch = [...w]; let out = '';
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]; let t = (c in HE_LETTER) ? HE_LETTER[c] : c;
      if (c === 'ה' && i === ch.length - 1) t = '';           // final ה silent
      if (c === 'ו' && i === 0) t = 'v';
      if (c === 'י' && i === 0) t = 'y';
      if ((c === 'א' || c === 'ע') && i === 0) t = '';
      out += t;
    }
    return out ? out[0].toUpperCase() + out.slice(1) : '';
  }).join(' ');
}

// Build a clean, self-drawn Job Order (page 10) as a full-page transparent-free
// PNG, so it replaces the dense scanned form with a legible page that shows all
// of the file's details. Returns { bytes, width, height } (points).
function drawJobOrderImage(family = {}, worker = {}, opts = {}) {
  const num = (v) => { const m = String(v == null ? '' : v).replace(/[^\d.]/g, ''); return m ? parseFloat(m) : 0; };
  const eName = clean(family.fullName || [family.firstName, family.lastName].filter(Boolean).join(' '));
  const eId = clean(family.idNumber);
  const eAddr = [clean(family.street), clean(family.city)].filter(Boolean).join(', ');
  const gName = clean(family.contactName);
  const ePhone = clean(family.phone || family.mobile || family.contactMobile);
  const languages = clean(worker.languages);
  const wPass = clean(worker.passportNo);
  const wGender = clean(worker.gender);
  const wAge = worker.dob ? String(new Date().getFullYear() - new Date(String(worker.dob).slice(0, 4)).getFullYear() || '') : '';
  const wNameEn = workerNameEn(worker);
  const dayoff = clean(worker.weeklyDayOff);
  const advance = clean(worker.weeklyAdvance) || '100';
  const base = num(worker.salary || family.offeredSalary);
  const salary = base ? String(Math.round(base + num(worker.weeklyAdvance) * 4)) : '';
  const date = fmtDate(opts.date || '');

  const W = 595.32, H = 841.92;
  const c = document.createElement('canvas');
  c.width = Math.round(W * SS); c.height = Math.round(H * SS);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  const FF = 'Heebo, Arial, sans-serif';
  const setf = (s, w = 400) => { ctx.font = `${w} ${s}px ${FF}`; };
  const ink = '#111827';
  // Left-aligned LTR; returns the x where the text ends.
  const L = (x, y, t, s = 9.5, w = 400) => { setf(s, w); ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillText(t, x, y); return x + ctx.measureText(String(t)).width; };
  // Hebrew value anchored at left edge x (renders RTL internally).
  const HV = (x, y, t, s = 9.5, w = 400) => { if (!t) return; setf(s, w); ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.direction = 'rtl'; ctx.fillText(String(t), x, y); };
  // Right-aligned at x.
  const RA = (x, y, t, s = 9.5, w = 400, dir = 'rtl') => { setf(s, w); ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.direction = dir; ctx.fillText(String(t), x, y); };
  const CEN = (x, y, t, s = 10, w = 700) => { setf(s, w); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.direction = 'ltr'; ctx.fillText(String(t), x, y); };
  const rule = (x1, y, x2, lw = 0.5, col = '#6b7280') => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); };
  const para = (x, y, t, maxW, s = 8, lh = 10) => {
    setf(s); ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillStyle = ink;
    const words = String(t).split(' '); let ln = ''; let yy = y;
    for (const wd of words) { const tt = ln ? ln + ' ' + wd : wd; if (ctx.measureText(tt).width > maxW && ln) { ctx.fillText(ln, x, yy); ln = wd; yy += lh; } else ln = tt; }
    if (ln) { ctx.fillText(ln, x, yy); yy += lh; }
    return yy;
  };
  const M = 42, RIGHT = 553;

  // ---- Company header (top-right, Hebrew) ----
  RA(RIGHT, 50, 'עוגן סיעוד ועובדים זרים בע"מ', 15, 700);
  RA(RIGHT, 66, 'בן צבי 84, תל אביב', 9.5, 400);
  RA(RIGHT, 80, '216095568', 9.5, 400, 'ltr');

  // ---- Title ----
  CEN(297, 108, 'Job Order  —  השמת מטפל', 14, 700);
  rule(232, 113, 362, 0.8, ink);

  // ---- Date ----
  let ex = L(M, 138, 'Date:', 9.5, 700);
  rule(ex + 6, 140, ex + 120); if (date) L(ex + 12, 138, date, 9.5);

  // ---- Employer / caregiver identity ----
  ex = L(M, 166, "Employer's Name:", 9.5, 700); HV(ex + 6, 166, eName, 10, 500);
  ex = L(330, 166, 'I.D:', 9.5, 700); L(ex + 6, 166, eId, 9.5, 500);
  ex = L(M, 190, 'Age:', 9.5, 700); L(ex + 6, 190, wAge && wAge !== 'NaN' ? wAge : '', 9.5, 500);
  ex = L(120, 190, 'Sex:', 9.5, 700); L(ex + 6, 190, wGender, 9.5, 500);
  ex = L(205, 190, 'Height:', 9.5, 700); rule(ex + 6, 192, ex + 90);
  ex = L(370, 190, 'Weight:', 9.5, 700); rule(ex + 6, 192, ex + 90);
  ex = L(M, 214, 'Address:', 9.5, 700); HV(ex + 6, 214, eAddr, 9.5, 500);
  ex = L(320, 214, 'Contact person:', 9.5, 700); HV(ex + 6, 214, gName, 9.5, 500);
  ex = L(M, 238, 'Tel:', 9.5, 700); L(ex + 6, 238, ePhone, 9.5, 500);

  // ---- Condition / requirements (blank checkboxes, filled by hand) ----
  ex = L(M, 268, 'Physical condition:', 9, 700);
  L(ex + 6, 268, '(  ) Independent      (  ) With support / walker      (  ) Full support / wheelchair', 9);
  ex = L(M, 290, 'Mental condition:', 9, 700);
  L(ex + 6, 290, '(  ) Alzheimer     (  ) Dementia     (  ) Clear mind', 9);
  ex = L(392, 290, 'Languages:', 9, 700); HV(ex + 6, 290, languages, 9, 500);
  L(M, 312, 'Live alone:  ____ / with:  ________        Accommodation:  (  ) Private room     (  ) Other:  ________', 9);
  ex = L(M, 336, 'Job requirements:', 9, 700);
  L(ex + 6, 336, '(  ) Feeding   (  ) Bathing   (  ) Dressing   (  ) Diaper change   (  ) Toilet assistant', 9);
  L(M, 356, '(  ) House cleaning   (  ) Laundry   (  ) Cooking   (  ) Medication   (  ) Injections   (  ) Supervision', 9);

  // ---- Notes ----
  ex = L(M, 386, 'Special notes:', 9.5, 700); rule(ex + 6, 388, RIGHT);
  rule(M, 408, RIGHT);

  // ---- Terms ----
  ex = L(M, 436, 'Monthly salary:', 9.5, 700); L(ex + 6, 436, (salary ? salary : '________') + ' NIS', 9.5, 700);
  ex = L(250, 436, 'Weekly advance:', 9.5, 700); L(ex + 6, 436, advance + ' NIS', 9.5, 500);
  ex = L(420, 436, 'Day off:', 9.5, 700); L(ex + 6, 436, '25 hr', 9.5, 500);
  ex = L(M, 458, 'Weekly rest:', 9.5, 700); L(ex + 6, 458, dayoff || 'Saturday night – Sunday', 9.5, 500);
  ex = L(M, 480, 'Term of employment:', 9.5, 700); L(ex + 6, 480, 'A one-year contract with an option to renew.', 9.5);

  // ---- Declaration ----
  CEN(297, 510, 'Declaration', 11, 700); rule(263, 514, 331, 0.8, ink);
  let x = L(M, 532, 'I ', 9.5, 400);
  x = L(x, 532, wNameEn || '____________', 9.5, 700);
  x = L(x, 532, ', the undersigned, Passport No. ', 9.5, 400);
  x = L(x, 532, wPass || '__________', 9.5, 700);
  L(x, 532, ', hereby declare:', 9.5, 400);

  const clauses = [
    ['a.', 'I hereby declare and approve that I have read the above job-offer details, and assure that my abilities and qualifications fulfill my obligations as a caregiver for the above requests.'],
    ['b.', 'I hereby declare that I am aware of and understand that, according to Israeli regulation, in the event of terminated employment with at least three (3) employers within a two-year period, the Israeli ministry may request that I appear before an investigator and may decide to revoke or not renew my working visa.'],
    ['c.', 'I hereby declare that I did not and will not pay any amount over the allowed sum for my recruitment.'],
    ['d.', 'I know that a caregiver must be registered with an agency under a legal employer within 90 days from the day he left the previous employer. A caregiver who fails to do so, without a reasonable explanation, could face deportation.'],
    ['e.', 'I hereby declare that I am fully aware and understand that I cannot leave my employer unattended and without supervision.'],
    ['f.', "The ombudsman for foreign workers' labor rights, telephone: 074-7696161 / 6235."],
    ['g.', 'I received and understood, in my language, the regulation regarding "Advance Notice".'],
    ['h.', 'I declare that this is my name, this is my signature, and the contents of this affidavit are the truth and are understood by me.'],
  ];
  let y = 550;
  for (const [letter, text] of clauses) {
    L(M + 2, y, letter, 8, 700);
    y = para(M + 16, y, text, RIGHT - (M + 16), 8, 10) + 3;
  }

  // ---- Signatures ----
  y += 10;
  ex = L(M, y, "Caregiver's signature:", 9.5, 700); rule(ex + 6, y + 2, ex + 130);
  ex = L(340, y, 'Agency stamp & sign:', 9.5, 700); rule(ex + 6, y + 2, RIGHT);

  const b64 = c.toDataURL('image/png').split(',')[1];
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: W, height: H };
}

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
  // A live-in caregiver resides at the employer's home, so fall back to the
  // employer's address when the worker has none of their own.
  const wCity = clean(worker.addrCity || worker.city) || clean(family.city);
  const wStreet = clean(worker.addrStreet) || clean(family.street) || wCity;
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
  add(0, 61, 234, toLatin(eName), { dir: 'ltr' }); // Employer Mr / Mrs (Latin)
  add(0, 199, 234, eId, { dir: 'ltr' });         // I.D. number
  add(0, 88, 220, eStreet, { dir: 'ltr' });      // Street Address
  add(0, 200, 218, eCity, { dir: 'ltr' });       // City
  add(0, 201, 149, toLatin(gName), { dir: 'ltr' }); // Guardian name (Latin)
  add(0, 355, 151, gId, { dir: 'ltr' });         // Guardian I.D.
  add(0, 521, 149, gPhone, { dir: 'ltr' });      // Guardian Telephone

  // ---------- Page 2 — ביטוח לאומי / הצהרת מעסיק (values sit ~22pt below the header) ----------
  const C = (page, x, yLabel, val, o = {}) => add(page, x, yLabel - 22, val, { align: 'center', ...o });
  C(1, 514, 469, eLast);    // employer שם משפחה
  C(1, 356, 469, eFirst);   // employer שם פרטי
  C(1, 180, 469, eId);      // employer מספר זהות
  C(1, 514, 423, eStreet);  // רחוב ומספר
  C(1, 303, 423, eCity, { align: 'right' });   // ישוב — flush to the right inside the box
  C(1, 141, 422, eZip, { align: 'right' });    // מיקוד — flush to the right inside the box
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
  add(1, 411, 72, eName, { align: 'center' }); // שם מעסיק (bottom, centered in the blank cell left of the label)

  // ---------- Page 11 — חוזה העסקה (SEC): bilingual. Hebrew details go on the
  // Hebrew (right) column, next to the Hebrew labels; the caregiver's Latin
  // name/country go on the English (left) column — NOT centered in the middle.
  const eAddr = [eStreet, eCity].filter(Boolean).join(', ');
  const wNameHe = clean(worker.nameHe) || clean([worker.firstNameHe, worker.lastNameHe].filter(Boolean).join(' '));
  // A. Employer — Hebrew details (name + address) on the Hebrew (right) column;
  // the numeric fields (ID, phone) mirrored on the English (left) column too.
  add(10, 459, 437, eName, { align: 'right' });                 // מר/גב'
  add(10, 421, 423, eId, { align: 'right', dir: 'ltr' });       // מס' תעודת זהות
  add(10, 400, 409, eAddr, { align: 'right' });                 // כתובת/מקום העבודה
  add(10, 446, 380, ePhone, { align: 'right', dir: 'ltr' });    // מס' טלפון
  add(10, 145, 437, toLatin(eName), { align: 'left' });         // Mr./Ms. (Latin)
  add(10, 136, 423, eId, { align: 'left', dir: 'ltr' });        // ID No.
  add(10, 196, 409, toLatin(eAddr), { align: 'left' });         // Address/Workplace (Latin)
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

  // ---------- Page 10 — הזמנת עבודה / Job Order ----------
  // This dense scanned form is replaced entirely by a clean, self-built page
  // (drawJobOrderImage) in buildFilledContract, so nothing is overlaid here.

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
  add(7, 508, 528, [...new Set([wStreet, wCity].filter(Boolean))].join(' ')); // כתובת מגורים (live-in → employer)
  add(7, 135, 311, wName, { dir: 'ltr', align: 'center', size: 8 });   // I the undersigned, <name>
  add(7, 279, 311, wCountry, { dir: 'ltr', align: 'center', size: 8 });// Passport Country
  add(7, 390, 311, wPass, { dir: 'ltr', size: 8 });                    // Passport Number

  // ---------- Page 7 — הצהרת המטופל/מעסיק ("אני החח\"מ … נושא ת.ז מספר …") ----------
  add(6, 530, 814, eName);                                  // אני החח"מ [שם]
  add(6, 405, 814, eId, { align: 'right', dir: 'ltr' });    // נושא ת.ז מספר [מספר]

  // ---------- Page 9 — הצהרת מנכ"ל הלשכה (worker passport) ----------
  add(8, 463, 476, wPass, { align: 'right', dir: 'ltr' });  // מספר דרכון

  // ---------- Page 12 — worker passport (bilingual clause) ----------
  add(11, 194, 679, wPass, { dir: 'ltr', align: 'left' });   // Passport Number (English side)
  add(11, 430, 681, wPass, { dir: 'ltr', align: 'right' });  // מס' דרכון (Hebrew side)

  // ---------- Page 14 — employment "from … until" (start date) ----------
  add(13, 158, 641, startDate, { dir: 'ltr', align: 'left' }); // English: shall be from …
  add(13, 424, 655, startDate, { dir: 'ltr', align: 'left' }); // Hebrew: החל מ- …

  // ---------- Page 17 — monthly salary (bilingual clause) ----------
  add(16, 153, 163, salary, { align: 'center' });   // salary (English side)
  add(16, 446, 163, salary, { align: 'center' });   // salary (Hebrew side)

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

  // Replace the dense scanned Job Order (page 10) with a clean, self-built page.
  const jo = pages[9];
  if (jo) {
    const joImg = drawJobOrderImage(family, worker, opts);
    const joPng = await pdf.embedPng(joImg.bytes);
    const { width: pw, height: ph } = jo.getSize();
    jo.drawImage(joPng, { x: 0, y: 0, width: pw, height: ph });
  }

  return pdf.save();
}
