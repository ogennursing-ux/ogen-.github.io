// Generate a clean, printable PDF from a structured form + the values the
// social worker filled in. Hebrew (and any Unicode) is rendered to a canvas and
// embedded as a transparent PNG, because pdf-lib's built-in fonts are WinAnsi
// only — the same technique used for signed PDFs in pdfUtils.js.
import { formatDate } from './pdfUtils.js';
import { isLayoutField } from './formSchema.js';

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 44;

async function ensureFont() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('600 16px Heebo');
      await document.fonts.load('400 14px Heebo');
      await document.fonts.ready;
    } catch {
      /* fall back to system font */
    }
  }
}

// Render one RTL line to a transparent PNG. Returns { bytes, width, height }.
function lineImage(text, { size = 13, weight = 400, color = '#111827', maxWidth }) {
  const ss = 3; // supersample for crisp text
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  let str = text == null ? '' : String(text);
  if (maxWidth) {
    while (str.length > 1 && measure.measureText(str).width > maxWidth) {
      str = str.slice(0, -2) + '…';
    }
  }
  const textW = Math.max(1, Math.ceil(measure.measureText(str).width));
  const boxW = textW + 4;
  const boxH = Math.ceil(size * 1.5);

  const canvas = document.createElement('canvas');
  canvas.width = boxW * ss;
  canvas.height = boxH * ss;
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  ctx.font = `${weight} ${size}px Heebo, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(str, boxW - 2, boxH / 2);

  const dataUrl = canvas.toDataURL('image/png');
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: boxW, height: boxH };
}

function displayValue(field, value) {
  if (field.type === 'checkbox') return value === true ? 'כן ✓' : 'לא';
  if (field.type === 'checklist') return Array.isArray(value) ? value.join('  ·  ') : '';
  if (field.type === 'date') return value ? formatDate(value) : '';
  return value == null ? '' : String(value);
}

// Embed a PNG data URL into the document; returns { png, width, height }.
async function embedDataUrl(pdf, dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const png = await pdf.embedPng(bytes);
  return { png, width: png.width, height: png.height };
}

/**
 * @param {string} title
 * @param {Array} schema  structured-form fields
 * @param {Object} values map of fieldId -> value (empty object => blank form)
 * @returns {Promise<Uint8Array>}
 */
export async function buildFormPdf(title, schema, values = {}) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  await ensureFont();

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - MARGIN;
  let y = A4.h - MARGIN;

  const place = (img, { x, gap = 4 } = {}) => {
    const drawX = x != null ? x : right - img.width;
    page.drawImage(pageImages.get(img.key), { x: drawX, y: y - img.height, width: img.width, height: img.height });
    y -= img.height + gap;
  };

  // pdf-lib needs embedded images; embed lazily and cache by a symbol key.
  const pageImages = new Map();
  const embed = async (line) => {
    const png = await pdf.embedPng(line.bytes);
    const key = Symbol('img');
    pageImages.set(key, png);
    return { key, width: png.width / 3, height: png.height / 3 };
  };

  const need = (h) => {
    if (y - h < MARGIN) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
  };

  // Title
  {
    const line = lineImage(title || 'טופס', { size: 20, weight: 700, color: '#0f4c81', maxWidth: right - MARGIN });
    const img = await embed(line);
    need(img.height);
    place(img, { gap: 6 });
  }
  // Divider space
  y -= 6;

  const contentW = right - MARGIN;

  for (const field of schema) {
    if (field.type === 'section') {
      y -= 8;
      const line = lineImage(field.label || '', { size: 15, weight: 700, color: '#1f2937', maxWidth: contentW });
      const img = await embed(line);
      need(img.height + 8);
      place(img, { gap: 6 });
      // underline the section by leaving a thin rule
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: right, y: y + 2 },
        thickness: 0.6,
        color: rgb(0.85, 0.87, 0.9),
      });
      y -= 6;
      continue;
    }

    const labelText = (field.label || '') + (field.required ? '  *' : '');
    const labelLine = lineImage(labelText, { size: 12, weight: 600, color: '#374151', maxWidth: contentW });
    const labelImg = await embed(labelLine);

    // Signature fields carry a PNG data URL — embed the drawing itself.
    if (field.type === 'signature') {
      const dataUrl = values[field.id];
      const sig = dataUrl ? await embedDataUrl(pdf, dataUrl) : null;
      const boxH = 46;
      need(labelImg.height + boxH + 12);
      place(labelImg, { gap: 4 });
      if (sig) {
        const scale = Math.min(180 / sig.width, boxH / sig.height, 1);
        const w = sig.width * scale;
        const h = sig.height * scale;
        page.drawImage(sig.png, { x: right - w, y: y - h, width: w, height: h });
        y -= boxH;
      } else {
        y -= boxH;
      }
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: right, y: y + 2 },
        thickness: 0.6,
        color: rgb(0.8, 0.83, 0.88),
      });
      y -= 8;
      continue;
    }

    const valueText = displayValue(field, values[field.id]);
    const valueLine = lineImage(valueText || ' ', { size: 13, weight: 400, color: '#111827', maxWidth: contentW });
    const valueImg = await embed(valueLine);

    need(labelImg.height + valueImg.height + 12);
    place(labelImg, { gap: 2 });
    place(valueImg, { gap: 4 });

    // underline the value area like a form field
    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: right, y: y + 2 },
      thickness: 0.6,
      color: rgb(0.8, 0.83, 0.88),
    });
    y -= 8;
  }

  return pdf.save();
}
