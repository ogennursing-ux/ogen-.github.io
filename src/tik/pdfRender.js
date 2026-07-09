// Self-contained pdf.js page renderer for the tik module's PDF-overlay editor.
// (Mirrors src/lib/pdfUtils.js but without the signing-app dependencies.)
import './polyfills.js';
import PdfWorker from './pdf.worker.js?worker';

let pdfjsLib = null;
async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  pdfjsLib = pdfjs;
  return pdfjs;
}

const MAX_PAGE_PX = 2200;

// Render every page of a PDF to a JPEG data URL for on-screen display.
// NOTE: pdf.js may detach the buffer it is given — pass a dedicated copy.
export async function renderPdfPages(data, { baseScale = 1.5 } = {}) {
  const pdfjs = await getPdfJs();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = baseScale * dpr;
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale });
      const longest = Math.max(base.width, base.height);
      const effScale = longest > MAX_PAGE_PX ? scale * (MAX_PAGE_PX / longest) : scale;
      const viewport = page.getViewport({ scale: effScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push({
        url: canvas.toDataURL('image/jpeg', 0.85),
        width: viewport.width,
        height: viewport.height,
        aspect: viewport.height / viewport.width,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}
