// Stamp worker values onto an existing PDF contract at placed positions,
// leaving the original document's design untouched. Text is rendered to a
// transparent PNG (canvas) so Hebrew and any Unicode work — pdf-lib's built-in
// fonts are WinAnsi only.
import { buildValueMap } from './contractMerge.js';

async function ensureFont() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('500 16px Heebo');
      await document.fonts.ready;
    } catch {
      /* fall back to system font */
    }
  }
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Render text into a boxW×boxH transparent PNG, auto-fitting the font.
function drawTextDataUrl(text, boxW, boxH, { align = 'right' } = {}) {
  const ss = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(boxW * ss));
  canvas.height = Math.max(1, Math.round(boxH * ss));
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  let fontSize = Math.min(boxH * 0.72, 26);
  const setFont = () => { ctx.font = `500 ${fontSize}px Heebo, Arial, sans-serif`; };
  setFont();
  const maxWidth = boxW - 4;
  while (ctx.measureText(text).width > maxWidth && fontSize > 5) {
    fontSize -= 0.5;
    setFont();
  }
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  if (align === 'center') {
    ctx.textAlign = 'center';
    ctx.fillText(text, boxW / 2, boxH / 2);
  } else if (align === 'left') {
    ctx.textAlign = 'left';
    ctx.fillText(text, 2, boxH / 2);
  } else {
    ctx.textAlign = 'right';
    ctx.fillText(text, boxW - 2, boxH / 2);
  }
  return canvas.toDataURL('image/png');
}

/**
 * @param {ArrayBuffer|Uint8Array} originalBytes  the template PDF (a copy)
 * @param {Array} placements  [{ fieldKey, pageIndex, xPct, yPct, wPct, hPct, align }]
 * @param {object} records  { worker, family } — both sides of the placement
 * @param {object} [opts]  { companyName }
 * @returns {Promise<Uint8Array>}
 */
export async function buildOverlayPdf(originalBytes, placements, records, opts = {}) {
  const { PDFDocument } = await import('pdf-lib');
  await ensureFont();
  const map = buildValueMap(records, opts);
  const pdf = await PDFDocument.load(originalBytes);
  const pages = pdf.getPages();

  for (const pl of placements || []) {
    const page = pages[pl.pageIndex];
    if (!page) continue;
    const raw = map[pl.fieldKey];
    const text = raw == null ? '' : String(raw);
    if (!text) continue;
    const { width: pw, height: ph } = page.getSize();
    const boxW = pl.wPct * pw;
    const boxH = pl.hPct * ph;
    const x = pl.xPct * pw;
    const y = ph - pl.yPct * ph - boxH; // pdf-lib origin is bottom-left
    const url = drawTextDataUrl(text, boxW, boxH, { align: pl.align || 'right' });
    const img = await pdf.embedPng(dataUrlToBytes(url));
    page.drawImage(img, { x, y, width: boxW, height: boxH });
  }
  return pdf.save();
}
