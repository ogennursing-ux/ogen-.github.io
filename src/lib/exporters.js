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

// Build a UTF-8 CSV (with BOM so Hebrew opens correctly in Excel).
export function toCsv(rows) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = ['שם המסמך', 'סטטוס', 'תאריך'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push([r.title, r.status, r.date].map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}
