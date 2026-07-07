// Helpers for the documents dashboard: merge PDFs, CSV export, downloads.

export function downloadBlob(data, type, name) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Render each PDF page and download it as its own image file, all from one
// click (used by the "each page separately" download option).
export async function downloadPagesAsImages(bytes, name) {
  const { renderPdfPages } = await import('./pdfUtils.js');
  const base = (name || 'document').replace(/\.pdf$/i, '');
  const pages = await renderPdfPages(new Uint8Array(bytes.slice(0)));
  for (let i = 0; i < pages.length; i++) {
    const res = await fetch(pages[i].url);
    const blob = await res.blob();
    downloadBlob(blob, 'image/jpeg', `${base}-page-${i + 1}.jpg`);
  }
}

// Merge several signed PDFs (ArrayBuffers) into one document.
export async function mergePdfs(buffers) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}

// Parse a page-range string like "1-3,5" into 0-based indices within [0,max).
export function parseRanges(str, max) {
  const out = [];
  for (const part of String(str).split(',')) {
    const s = part.trim();
    if (!s) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
    if (m) {
      let a = +m[1];
      let b = +m[2];
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.push(i - 1);
    } else if (/^\d+$/.test(s)) {
      const i = +s;
      if (i >= 1 && i <= max) out.push(i - 1);
    }
  }
  return [...new Set(out)];
}

// Extract given 0-based page indices from a PDF into a new PDF (Uint8Array).
export async function extractPages(buffer, indices) {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

// A download-split spec is groups of page ranges separated by ";" or newlines,
// e.g. "1 ; 12-20" → group A = page 1, group B = pages 12-20.
export function parseGroups(str) {
  return String(str || '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Split a signed PDF into one file per group and download each separately.
// Returns the number of files produced (0 if no valid group matched).
export async function downloadByGroups(bytes, name, groups) {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  const base = (name || 'document').replace(/\.pdf$/i, '');
  let made = 0;
  for (const g of groups) {
    const indices = parseRanges(g, total);
    if (!indices.length) continue;
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    const label = g.replace(/\s+/g, '');
    downloadBlob(await out.save(), 'application/pdf', `${base}-${label}.pdf`);
    made += 1;
  }
  return made;
}

// Build a UTF-8 CSV (with BOM so Hebrew opens correctly in Excel).
export function toCsv(rows) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = ['שם המסמך', 'סטטוס', 'תאריך'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push([r.title, r.status, r.date].map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}
