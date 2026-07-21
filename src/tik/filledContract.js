// Fill עוגן's official 26-page placement packet by stamping the file's data
// onto the real blank template (bundled as an asset) — no legal text is
// retyped, so the wording stays exactly as approved. Values are rendered to a
// canvas and embedded as transparent PNGs so Hebrew and Latin both render
// correctly regardless of pdf-lib's built-in fonts.

import { PDFDocument } from 'pdf-lib';
import templateUrl from './assets/contract-template.pdf?url';

const SS = 3; // supersample for crisp text

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
    const x = f.align === 'right' ? f.x - img.width : f.x;
    page.drawImage(png, { x, y: f.y - img.height / 2, width: img.width, height: img.height });
  }
  return pdf.save();
}
