// ---------------------------------------------------------------------------
// PDF rendering (pdf.js) + signed-PDF generation (pdf-lib)
//
// Improvements over the original prototype:
//  - The pdf.js worker is bundled locally (via Vite `?url`) instead of loaded
//    from a CDN, so there is no version mismatch and it works offline.
//  - Text fields are drawn to a canvas and embedded as PNG. This is what makes
//    Hebrew (and any Unicode) text work, because pdf-lib's built-in fonts only
//    support WinAnsi. Font size auto-fits the box and text is rendered RTL.
//  - Signatures keep their aspect ratio (contain-fit + centered) inside the box.
//  - Web fonts are awaited before rendering text so the embedded glyphs match.
// ---------------------------------------------------------------------------

// Bundled worker URL — resolved and fingerprinted by Vite at build time.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsLib = null;

export async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjsLib = pdfjs;
  return pdfjs;
}

/**
 * Render every page of a PDF to an image data URL for on-screen display.
 *
 * IMPORTANT: pdf.js may *detach* the ArrayBuffer it is given. Pass a dedicated
 * copy here (e.g. `new Uint8Array(buf.slice(0))`) and keep the original bytes
 * for pdf-lib, otherwise the buffer will be empty when you build the output.
 *
 * @param {Uint8Array} data  bytes pdf.js is free to consume
 * @returns {Promise<Array<{url:string,width:number,height:number,aspect:number}>>}
 */
export async function renderPdfPages(data, { baseScale = 1.5 } = {}) {
  const pdfjs = await getPdfJs();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = baseScale * dpr;

  // isEvalSupported:false hardens against malicious-PDF JS execution; the
  // documents here come from end users and are not trusted.
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push({
        // JPEG keeps the preview small; it never ends up in the signed file
        // (that is built from the original bytes), so quality here is cosmetic.
        url: canvas.toDataURL('image/jpeg', 0.85),
        width: viewport.width,
        height: viewport.height,
        aspect: viewport.height / viewport.width,
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Render a line of text to a transparent PNG, auto-fitting the box width.
function drawTextDataUrl(text, boxW, boxH, { color = '#111827' } = {}) {
  const ss = 3; // supersample for crisp output
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(boxW * ss));
  canvas.height = Math.max(1, Math.round(boxH * ss));
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);

  let fontSize = Math.min(boxH * 0.62, 22);
  const setFont = () => {
    ctx.font = `500 ${fontSize}px Heebo, Arial, sans-serif`;
  };
  setFont();
  const maxWidth = boxW - 6;
  while (ctx.measureText(text).width > maxWidth && fontSize > 6) {
    fontSize -= 0.5;
    setFont();
  }

  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(text, boxW - 3, boxH / 2);
  return canvas.toDataURL('image/png');
}

// Render a green check mark to a transparent PNG sized to the box.
function drawCheckDataUrl(boxW, boxH) {
  const ss = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(boxW * ss));
  canvas.height = Math.max(1, Math.round(boxH * ss));
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  ctx.strokeStyle = '#1F7A53';
  ctx.lineWidth = Math.max(2, boxH * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(boxW * 0.15, boxH * 0.5);
  ctx.lineTo(boxW * 0.4, boxH * 0.78);
  ctx.lineTo(boxW * 0.85, boxH * 0.22);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

// Contain-fit a (iw x ih) image inside the box at (x,y,boxW,boxH), centered.
function containRect(iw, ih, x, y, boxW, boxH) {
  const scale = Math.min(boxW / iw, boxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: x + (boxW - w) / 2, y: y + (boxH - h) / 2, width: w, height: h };
}

/**
 * Build the signed PDF from the original bytes and the placed fields.
 * Each field carries its own `value` (signature data URL, text, date string or
 * boolean) and percentage geometry relative to its page.
 *
 * @param {ArrayBuffer|Uint8Array} originalPdfBytes  pass a copy if you reuse it
 * @param {Array} fields
 * @returns {Promise<Uint8Array>} the saved PDF bytes
 */
export async function buildSignedPdf(originalPdfBytes, fields) {
  const { PDFDocument } = await import('pdf-lib');

  // Make sure the web font is loaded so canvas text uses Heebo, not a fallback.
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('500 16px Heebo');
      await document.fonts.ready;
    } catch {
      /* non-fatal: fall back to system font */
    }
  }

  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const page = pages[field.pageIndex];
    if (!page) continue;

    const { width: pw, height: ph } = page.getSize();
    const boxW = field.wPct * pw;
    const boxH = field.hPct * ph;
    const x = field.xPct * pw;
    // pdf-lib's origin is bottom-left; our percentages are from the top.
    const y = ph - field.yPct * ph - boxH;

    if (field.type === 'signature') {
      if (!field.value) continue;
      const img = await pdfDoc.embedPng(dataUrlToBytes(field.value));
      page.drawImage(img, containRect(img.width, img.height, x, y, boxW, boxH));
    } else if (field.type === 'text' || field.type === 'date') {
      const text = field.type === 'date' ? formatDate(field.value) : String(field.value ?? '');
      if (!text) continue;
      const img = await pdfDoc.embedPng(dataUrlToBytes(drawTextDataUrl(text, boxW, boxH)));
      page.drawImage(img, { x, y, width: boxW, height: boxH });
    } else if (field.type === 'checkbox') {
      if (field.value !== true && field.value !== 'true') continue;
      const img = await pdfDoc.embedPng(dataUrlToBytes(drawCheckDataUrl(boxW, boxH)));
      page.drawImage(img, { x, y, width: boxW, height: boxH });
    }
  }

  return pdfDoc.save();
}

// Format an ISO date (yyyy-mm-dd) as dd/mm/yyyy; pass through anything else.
export function formatDate(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}
