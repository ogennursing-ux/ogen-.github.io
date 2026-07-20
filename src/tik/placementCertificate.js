// Generate עוגן's "מכתב השמה / Certificate of Placement" (page 1 of the
// placement packet) as a clean, bilingual PDF, auto-filled from the family
// (employer/patient) file and its linked worker. Hebrew can't be drawn with
// pdf-lib's built-in fonts, so every line is rendered to a canvas and embedded
// as a transparent PNG — the same technique used by contractPdf.js.

import { PDFDocument, rgb } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 46;
const SS = 3; // canvas supersample for crisp text

// עוגן — fixed agency details (as they appear on the original certificate).
export const AGENCY = {
  nameHe: 'עוגן סיעוד ועובדים זרים בע"מ',
  nameEn: 'Ogen Siud vovdim zarim Ltd',
  companyNo: '513996488',   // ח.פ
  licenseNo: '216095568',   // מספר לשכה
  addrHe: 'בן צבי 84, תל אביב',
  addrEn: 'BEN ZVI 84, TEL AVIV',
  phone: '053-7837082',
  fax: '000-000000',
  signatory: 'דביר בנגי',   // מורשה חתימה
  ombudsman: '0506290758',  // הממונה על זכויות עובדים זרים
};

function fmtDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO → DD/MM/YY
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return s;
}

async function ensureFont() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('700 20px Heebo');
      await document.fonts.load('600 12px Heebo');
      await document.fonts.load('400 11px Heebo');
      await document.fonts.ready;
    } catch { /* system font fallback */ }
  }
}

const measureCtx = () => document.createElement('canvas').getContext('2d');

// Render one line to a transparent PNG. dir 'rtl' right-aligns Hebrew, 'ltr'
// left-aligns English. Returns { bytes, width, height }.
function lineImage(text, { size = 11, weight = 400, color = '#111827', dir = 'rtl' } = {}) {
  const font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  const measure = measureCtx();
  measure.font = font;
  const str = text == null ? '' : String(text);
  const textW = Math.max(1, Math.ceil(measure.measureText(str).width));
  const boxW = textW + 4;
  const boxH = Math.ceil(size * 1.55);

  const canvas = document.createElement('canvas');
  canvas.width = boxW * SS;
  canvas.height = boxH * SS;
  const ctx = canvas.getContext('2d');
  ctx.scale(SS, SS);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.direction = dir;
  if (dir === 'rtl') { ctx.textAlign = 'right'; ctx.fillText(str, boxW - 2, boxH / 2); }
  else { ctx.textAlign = 'left'; ctx.fillText(str, 2, boxH / 2); }

  const b64 = canvas.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: boxW, height: boxH };
}

function wrapText(text, { size, weight, maxWidth }) {
  const measure = measureCtx();
  measure.font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (measure.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const or = (v, dash = '____________') => (v && String(v).trim() ? String(v).trim() : dash);

// Best worker name for the certificate (foreign name in Latin letters).
const workerNameEn = (w) =>
  w?.nameEn || [w?.lastNameEn, w?.firstNameEn].filter(Boolean).join(' ') || w?.nameHe || '';
const workerAddr = (w) =>
  [w?.addrStreet, w?.addrCity].filter(Boolean).join(', ') || w?.address || '';

/**
 * Build the Certificate of Placement PDF.
 * @param {object} family  the family/employer record (emptyFamily shape)
 * @param {object} worker  the linked worker record (emptyWorker shape) or {}
 * @param {object} opts    { date, agency }
 * @returns {Promise<Uint8Array>}
 */
export async function buildPlacementCertificate(family = {}, worker = {}, opts = {}) {
  await ensureFont();
  const agency = { ...AGENCY, ...(opts.agency || {}) };
  const date = fmtDate(opts.date || new Date().toISOString().slice(0, 10));

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - MARGIN;
  const contentW = A4.w - MARGIN * 2;
  let y = A4.h - MARGIN;

  const embed = async (img) => pdf.embedPng(img.bytes);
  const need = (h) => { if (y - h < MARGIN) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - MARGIN; } };

  // draw one prepared line at x/align
  async function put(text, { size = 11, weight = 400, color = '#111827', dir = 'rtl', align = dir === 'rtl' ? 'right' : 'left', gap = 3 } = {}) {
    const img = lineImage(text, { size, weight, color, dir });
    const png = await embed(img);
    need(img.height + gap);
    let x;
    if (align === 'right') x = right - img.width;
    else if (align === 'left') x = MARGIN;
    else x = MARGIN + (contentW - img.width) / 2; // center
    page.drawImage(png, { x, y: y - img.height, width: img.width, height: img.height });
    y -= img.height + gap;
  }

  async function para(text, { size = 10.5, weight = 400, color = '#1f2937', dir = 'rtl', gap = 2, after = 6 } = {}) {
    for (const l of wrapText(text, { size, weight, maxWidth: contentW })) await put(l, { size, weight, color, dir, gap });
    y -= after;
  }

  const rule = (col = 0.82) => {
    need(10);
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: right, y: y - 2 }, thickness: 0.6, color: rgb(col, col + 0.03, col + 0.08) });
    y -= 10;
  };

  // ---- Header ----
  await put(agency.nameHe, { size: 12, weight: 700, color: '#0f4c81', dir: 'rtl', gap: 10 });
  await put('מכתב השמה', { size: 22, weight: 700, color: '#111827', align: 'center', gap: 3 });
  await put('אישור על רישום מעסיק ועובד זר בלשכה פרטית בענף הסיעוד', { size: 11.5, weight: 700, color: '#1f2937', align: 'center', gap: 3 });
  await put('Certificate of Placement with Recruitment Agency — Caregivers and Employers', { size: 10.5, weight: 700, color: '#1f2937', dir: 'ltr', align: 'center', gap: 12 });

  // ---- Hebrew body ----
  await para(
    `הנני לאשר כי העובד הזר והמעסיק שפרטיהם מופיעים להלן נרשמו ביום: ${date} בלשכה הפרטית (שם הלשכה הפרטית): ` +
    `${agency.nameHe}. מ.ח.פ: ${agency.companyNo}. רחוב ומספר: ${agency.addrHe}. מספר פקס: ${agency.fax}. ` +
    `מספר טלפון לשימוש הנרשמים בשעות בהן המשרד סגור: ${agency.phone} (להלן: הלשכה הפרטית).`,
    { after: 8 },
  );

  await put('פרטי העובד הזר:', { size: 12, weight: 700, color: '#0f4c81', gap: 5 });
  await para(
    `מר/גב': ${or(workerNameEn(worker))} · בעל/ת דרכון מספר: ${or(worker.passportNo)} · ארץ מוצא: ${or(worker.nationality)} (להלן: העובד).`,
    { gap: 2, after: 2 },
  );
  await para(
    `רחוב ומספר: ${or(workerAddr(worker))} · עיר: ${or(worker.addrCity)} · תאריך לידה: ${or(worker.dob ? fmtDate(worker.dob) : '')}.`,
    { after: 8 },
  );

  await put('פרטי המעסיק של העובד הזר:', { size: 12, weight: 700, color: '#0f4c81', gap: 5 });
  await para(
    `מר/גב': ${or(family.fullName || [family.firstName, family.lastName].filter(Boolean).join(' '))} · מס' ת.ז: ${or(family.idNumber)}.`,
    { gap: 2, after: 2 },
  );
  await para(
    `רחוב ומספר: ${or(family.street)} · עיר: ${or(family.city)} · מספר טלפון: ${or(family.phone || family.mobile)} (להלן: המעסיק).`,
    { after: 8 },
  );

  await para(
    'במקרים בהם, מחמת מצבו הבריאותי, המטופל נרשם בלשכה באמצעות קרוב משפחה או אפוטרופוס, יש לרשום גם את פרטי קרוב המשפחה או האפוטרופוס כלהלן:',
    { weight: 600, after: 3 },
  );
  await para(
    `שם: ${or(family.contactName)} · ת.ז: ${or(family.contactId)} · טלפון: ${or(family.contactMobile)} · קירבה למטופל: ${or(family.contactRelation)}.`,
    { after: 3 },
  );
  await para(`טלפון של הממונה על זכויות עובדים זרים במשרד העבודה: ${agency.ombudsman}.`, { weight: 600, after: 10 });

  rule();

  // ---- English mirror ----
  await para(
    `I hereby certify that the following Employer and Foreign Caregiver registered on (date): ${date} with the Licensed ` +
    `Recruitment Agency (Agency Name): ${agency.nameEn}. Agency Registration: ${agency.licenseNo}. Agency No.: ${agency.companyNo}. ` +
    `Agency Address: ${agency.addrEn}. Agency telephone number: ${agency.phone}. Telephone number for emergency calls: ${agency.phone} (hereinafter: The Agency).`,
    { dir: 'ltr', after: 8 },
  );
  await put('Caregiver Details:', { size: 11, weight: 700, color: '#0f4c81', dir: 'ltr', gap: 4 });
  await para(
    `Mr./Ms. ${or(workerNameEn(worker))}  Passport Country: ${or(worker.nationality)}  Passport Number: ${or(worker.passportNo)} (hereinafter: the Caregiver).`,
    { dir: 'ltr', after: 8 },
  );
  await put('Employer Details:', { size: 11, weight: 700, color: '#0f4c81', dir: 'ltr', gap: 4 });
  await para(
    `Mr./Mrs. ${or(family.fullName)}  I.D. number: ${or(family.idNumber)}  Street Address: ${or(family.street)}  City: ${or(family.city)} (hereinafter: the employer).`,
    { dir: 'ltr', after: 8 },
  );
  await para(
    'If a family member or official Guardian of the employer registered with the Agency on behalf of the employer, please include the following information regarding the family member or Guardian:',
    { dir: 'ltr', weight: 600, after: 3 },
  );
  await para(
    `Name of Family Member or Guardian: ${or(family.contactName)}  I.D. Number: ${or(family.contactId)}  Telephone Number: ${or(family.contactMobile)}.`,
    { dir: 'ltr', after: 3 },
  );
  await para(`Contact number of The Ombudsman for Foreign Worker's rights in the Israeli Ministry of Labor: ${agency.ombudsman}.`, { dir: 'ltr', weight: 600, after: 16 });

  // ---- Signature row ----
  need(70);
  const colW = contentW / 3;
  const sigY = y;
  for (let i = 0; i < 3; i++) {
    const cx = MARGIN + colW * i + 12;
    page.drawLine({ start: { x: cx, y: sigY }, end: { x: cx + colW - 24, y: sigY }, thickness: 0.8, color: rgb(0.4, 0.45, 0.5) });
  }
  y -= 4;
  // values above the lines (date + signatory name)
  const putCentered = async (text, colIndex, o = {}) => {
    const img = lineImage(text, { size: o.size || 10, weight: o.weight || 500, color: o.color || '#111827', dir: o.dir || 'rtl' });
    const png = await embed(img);
    const cx = MARGIN + colW * colIndex + (colW - img.width) / 2;
    page.drawImage(png, { x: cx, y: sigY + 4, width: img.width, height: img.height });
  };
  await putCentered(date, 0, { dir: 'ltr' });
  await putCentered(agency.signatory, 1);
  // labels under the lines
  const labels = ['תאריך', 'שם מורשה החתימה', 'חתימה וחותמת'];
  for (let i = 0; i < 3; i++) {
    const img = lineImage(labels[i], { size: 10, weight: 600, color: '#374151' });
    const png = await embed(img);
    const cx = MARGIN + colW * i + (colW - img.width) / 2;
    page.drawImage(png, { x: cx, y: y - img.height, width: img.width, height: img.height });
  }

  return pdf.save();
}
