// Generate a Hebrew employment contract PDF populated from a stored worker
// record. Hebrew text can't be drawn with pdf-lib's built-in WinAnsi fonts, so
// every line is rendered to a canvas and embedded as a transparent PNG — the
// same technique used across the signing app (see lib/formPdf.js).

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;
const SS = 3; // canvas supersample for crisp text

async function ensureFont() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('700 20px Heebo');
      await document.fonts.load('600 13px Heebo');
      await document.fonts.load('400 12px Heebo');
      await document.fonts.ready;
    } catch {
      /* fall back to system font */
    }
  }
}

function measureCtx() {
  return document.createElement('canvas').getContext('2d');
}

// Render a single RTL line to a transparent PNG; returns { bytes, width, height }.
function lineImage(text, { size = 12, weight = 400, color = '#111827' }) {
  const measure = measureCtx();
  const font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  measure.font = font;
  const str = text == null ? '' : String(text);
  const textW = Math.max(1, Math.ceil(measure.measureText(str).width));
  const boxW = textW + 4;
  const boxH = Math.ceil(size * 1.5);

  const canvas = document.createElement('canvas');
  canvas.width = boxW * SS;
  canvas.height = boxH * SS;
  const ctx = canvas.getContext('2d');
  ctx.scale(SS, SS);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(str, boxW - 2, boxH / 2);

  const b64 = canvas.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: boxW, height: boxH };
}

// Word-wrap `text` to a max pixel width, returning an array of line strings.
function wrapText(text, { size, weight, maxWidth }) {
  const measure = measureCtx();
  measure.font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (measure.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fmtDate(iso) {
  if (!iso) return '____________';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const or = (v) => (v && String(v).trim() ? String(v) : '____________');

/**
 * @param {object} worker  a saved worker record
 * @param {object} [opts]  { companyName }
 * @returns {Promise<Uint8Array>}
 */
export async function buildContractPdf(worker, opts = {}) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  await ensureFont();

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - MARGIN;
  const contentW = right - MARGIN;
  let y = A4.h - MARGIN;

  const need = (h) => {
    if (y - h < MARGIN) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
  };

  const drawLine = async (text, o = {}) => {
    const img = lineImage(text, o);
    const png = await pdf.embedPng(img.bytes);
    const w = img.width;
    const h = img.height;
    need(h + (o.gap ?? 4));
    const x = o.align === 'center' ? MARGIN + (contentW - w) / 2 : right - w;
    page.drawImage(png, { x, y: y - h, width: w, height: h });
    y -= h + (o.gap ?? 4);
  };

  const drawParagraph = async (text, o = {}) => {
    const size = o.size ?? 12;
    const weight = o.weight ?? 400;
    const lines = wrapText(text, { size, weight, maxWidth: contentW });
    for (const l of lines) await drawLine(l, { size, weight, color: o.color, gap: 3 });
    y -= o.after ?? 6;
  };

  const rule = () => {
    need(10);
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: right, y: y - 2 },
      thickness: 0.7,
      color: rgb(0.82, 0.85, 0.9),
    });
    y -= 12;
  };

  // Title
  await drawLine('הסכם העסקה', { size: 22, weight: 700, color: '#0f4c81', align: 'center', gap: 4 });
  await drawLine('(עובד/ת זר/ה בענף הסיעוד)', { size: 12, weight: 500, color: '#475569', align: 'center', gap: 10 });

  const company = opts.companyName || 'עוגן סיעוד ועובדים זרים בע"מ';
  await drawParagraph(
    `נחתם ביום ${fmtDate(new Date().toISOString())} בין ${company} ("המעסיק") ` +
      `לבין העובד/ת המפורט/ת להלן ("העובד/ת"), בהמשך להעסקה שתחילתה ביום ${fmtDate(worker.startDate)}.`,
    { after: 12 },
  );

  // Worker details block
  await drawLine('פרטי העובד/ת', { size: 14, weight: 700, color: '#1f2937', gap: 6 });
  rule();

  const rows = [
    ['שם העובד/ת (עברית)', or(worker.nameHe)],
    ['שם העובד/ת (אנגלית)', or(worker.nameEn)],
    ['מספר דרכון', or(worker.passportNo)],
    ['אזרחות', or(worker.nationality)],
    ['תאריך לידה', worker.dob ? fmtDate(worker.dob) : '____________'],
    ['טלפון', or(worker.phone)],
    ['תוקף דרכון', worker.passportExpiry ? fmtDate(worker.passportExpiry) : '____________'],
    ['תוקף אשרה/ויזה', worker.visaExpiry ? fmtDate(worker.visaExpiry) : '____________'],
    ['תוקף היתר העסקה', worker.permitExpiry ? fmtDate(worker.permitExpiry) : '____________'],
    ['תוקף ביטוח', worker.insuranceExpiry ? fmtDate(worker.insuranceExpiry) : '____________'],
    ['שם המטופל/ת', or(worker.patientName)],
    ['כתובת מקום העבודה', or(worker.address)],
    ['תאריך תחילת העסקה', worker.startDate ? fmtDate(worker.startDate) : '____________'],
    ['שכר חודשי (₪)', or(worker.salary)],
  ];

  for (const [label, value] of rows) {
    const labelImg = lineImage(label + ':', { size: 12, weight: 600, color: '#374151' });
    const valueImg = lineImage(value, { size: 12, weight: 400, color: '#111827' });
    const lPng = await pdf.embedPng(labelImg.bytes);
    const vPng = await pdf.embedPng(valueImg.bytes);
    const rowH = Math.max(labelImg.height, valueImg.height);
    need(rowH + 3);
    // label on the right, value in the middle column
    page.drawImage(lPng, { x: right - labelImg.width, y: y - labelImg.height, width: labelImg.width, height: labelImg.height });
    page.drawImage(vPng, {
      x: right - contentW * 0.45 - valueImg.width,
      y: y - valueImg.height,
      width: valueImg.width,
      height: valueImg.height,
    });
    y -= rowH + 3;
  }
  y -= 10;

  // Terms
  await drawLine('תנאי ההעסקה', { size: 14, weight: 700, color: '#1f2937', gap: 6 });
  rule();
  const terms = [
    'העובד/ת יועסק/תועסק בענף הסיעוד אצל המטופל/ת המפורט/ת לעיל, בהתאם להוראות חוק העסקת עובדים זרים והסכמי ההעסקה החלים.',
    `שכרו/ה של העובד/ת יעמוד על הסכום הנקוב לעיל, וישולם מדי חודש בהתאם לחוק ובכפוף לניכויים המותרים על פי דין.`,
    'תוקפו של הסכם זה מותנה בקיומם של אשרת עבודה והיתר העסקה בני-תוקף. באחריות המעסיק לוודא חידושם במועד.',
    'הסכם זה מתחדש מדי שנה, ויש לחתום עליו מחדש בתום כל שנת העסקה על בסיס הפרטים המעודכנים המופיעים במערכת.',
    'הצדדים מצהירים כי קראו את ההסכם, הבינו את תוכנו והם מסכימים לכל תנאיו.',
  ];
  let n = 1;
  for (const term of terms) await drawParagraph(`${n++}. ${term}`, { after: 5 });

  y -= 24;
  need(60);
  // Signature lines
  const half = contentW / 2 - 10;
  const sigY = y;
  page.drawLine({ start: { x: right - half, y: sigY }, end: { x: right, y: sigY }, thickness: 0.8, color: rgb(0.4, 0.45, 0.5) });
  page.drawLine({ start: { x: MARGIN, y: sigY }, end: { x: MARGIN + half, y: sigY }, thickness: 0.8, color: rgb(0.4, 0.45, 0.5) });
  y -= 6;
  const labelR = lineImage('חתימת המעסיק', { size: 11, weight: 600, color: '#374151' });
  const labelL = lineImage('חתימת העובד/ת', { size: 11, weight: 600, color: '#374151' });
  const rPng = await pdf.embedPng(labelR.bytes);
  const lPng = await pdf.embedPng(labelL.bytes);
  page.drawImage(rPng, { x: right - half / 2 - labelR.width / 2, y: y - labelR.height, width: labelR.width, height: labelR.height });
  page.drawImage(lPng, { x: MARGIN + half / 2 - labelL.width / 2, y: y - labelL.height, width: labelL.width, height: labelL.height });

  return pdf.save();
}
