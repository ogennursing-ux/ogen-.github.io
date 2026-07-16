// Helpers for the intake workflow: copy-all-to-clipboard, duplicate detection,
// WhatsApp share, and a printable one-page summary (which the browser can also
// "Save as PDF"). Kept separate so TikApp stays focused on rendering.
import { WORKER_COLS, FAMILY_COLS } from './csvExport.js';
import { listWorkers, listFamilies } from './workerFilesApi.js';

export { WORKER_COLS, FAMILY_COLS };

const gLabel = (g) => (g === 'ז' ? 'זכר' : g === 'נ' ? 'נקבה' : g || '');
const fmtVal = (k, v) => (k === 'gender' ? gLabel(v) : v);

function filledRows(rec, cols) {
  return cols
    .map(([k, label]) => [label, fmtVal(k, rec[k])])
    .filter(([, v]) => v != null && String(v).trim() !== '');
}

// "label: value" lines of every non-empty field — for pasting into Tik-Tak.
export function recordToText(rec, cols) {
  return filledRows(rec, cols).map(([label, v]) => `${label}: ${v}`).join('\n');
}
export const workerToText = (w) => recordToText(w, WORKER_COLS);
export const familyToText = (f) => recordToText(f, FAMILY_COLS);

// ---- duplicate detection ----
export async function findWorkerDuplicate(passportNo, excludeId) {
  const p = String(passportNo || '').trim().toLowerCase();
  if (!p) return null;
  const all = await listWorkers();
  return all.find((w) => w.id !== excludeId && String(w.passportNo || '').trim().toLowerCase() === p) || null;
}
export async function findFamilyDuplicate(idNumber, excludeId) {
  const id = String(idNumber || '').replace(/\D/g, '');
  if (!id) return null;
  const all = await listFamilies();
  return all.find((f) => f.id !== excludeId && String(f.idNumber || '').replace(/\D/g, '') === id) || null;
}

// ---- WhatsApp share (text only) ----
export function whatsappLink(phone, text) {
  const t = encodeURIComponent(text || '');
  const digits = String(phone || '').replace(/\D/g, '');
  let intl = '';
  if (digits) intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  return intl ? `https://wa.me/${intl}?text=${t}` : `https://wa.me/?text=${t}`;
}

// ---- printable summary (Save as PDF from the browser dialog) ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function printSummary(title, rec, cols) {
  const rows = filledRows(rec, cols)
    .map(([label, v]) => `<tr><th>${esc(label)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  const html =
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{font-family:Arial,'Segoe UI',sans-serif;padding:28px;color:#111}` +
    `h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:16px}` +
    `table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px 10px;text-align:right;font-size:14px}` +
    `th{background:#f3f6fb;width:40%;font-weight:600}@media print{button{display:none}}</style></head>` +
    `<body><h1>${esc(title)}</h1><div class="sub">עוגן סיעוד · ${new Date().toLocaleDateString('he-IL')}</div>` +
    `<table>${rows}</table><p><button onclick="window.print()">🖨️ הדפס / שמור PDF</button></p></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('חלון ההדפסה נחסם. יש לאפשר חלונות קופצים לאתר ולנסות שוב.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
