// Field model helpers shared across the editor.

// Default size of each field type, as a fraction of the page (w of width, h of height).
export const FIELD_DEFAULTS = {
  signature: { w: 0.2, h: 0.07 },
  firstName: { w: 0.22, h: 0.045 },
  lastName: { w: 0.22, h: 0.045 },
  fullName: { w: 0.28, h: 0.045 },
  idNumber: { w: 0.2, h: 0.045 },
  text: { w: 0.3, h: 0.045 },
  question: { w: 0.3, h: 0.045 },
  date: { w: 0.2, h: 0.045 },
  checkbox: { w: 0.045, h: 0.03 },
  initials: { w: 0.12, h: 0.05 },
};

export const FIELD_LABELS = {
  signature: 'חתימה',
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  fullName: 'שם מלא',
  idNumber: 'תעודת זהות',
  text: 'טקסט',
  question: 'שאלה',
  date: 'תאריך',
  checkbox: 'תיבת סימון',
  initials: 'ראשי תיבות',
};

export const FIELD_ICONS = {
  signature: '✒️',
  firstName: '👤',
  lastName: '👥',
  fullName: '🪪',
  idNumber: '🆔',
  text: '🔤',
  question: '❓',
  date: '📅',
  checkbox: '☑️',
  initials: '🔡',
};

// Types whose value is shared per signer (fill once → fills everywhere).
export const SHARED_TYPES = ['signature', 'initials', 'firstName', 'lastName', 'fullName', 'idNumber'];
// Text-like types rendered as text in the output PDF.
export const TEXT_TYPES = ['text', 'question', 'date', 'firstName', 'lastName', 'fullName', 'idNumber', 'initials'];

// Normalize a stored signers value to { current, list, note }.
export function normalizeSigners(s) {
  const fallback = { current: 0, list: [{ name: 'החותם', color: '#1f7a53' }], note: '' };
  if (!s) return fallback;
  if (Array.isArray(s)) return { current: 0, list: s.length ? s : fallback.list, note: '' };
  if (!s.list || !s.list.length) return { ...fallback, note: s.note || '' };
  return { current: s.current || 0, list: s.list, note: s.note || '' };
}

// A field counts as empty (unfilled) for validation purposes.
export const isFieldEmpty = (f) => (f.type === 'checkbox' ? f.value !== true : !f.value);

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Two signers who fill the document one after the other.
export const DEFAULT_SIGNERS = [
  { name: 'חותם 1', color: '#1f7a53' },
  { name: 'חותם 2', color: '#2563eb' },
];

// Convert a #rrggbb color to an rgba() string with the given alpha.
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
