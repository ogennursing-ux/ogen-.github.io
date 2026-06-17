// Field model helpers shared across the editor.

// Default size of each field type, as a fraction of the page (w of width, h of height).
export const FIELD_DEFAULTS = {
  signature: { w: 0.26, h: 0.09 },
  text: { w: 0.3, h: 0.045 },
  date: { w: 0.2, h: 0.045 },
  checkbox: { w: 0.045, h: 0.03 },
};

export const FIELD_LABELS = {
  signature: 'חתימה',
  text: 'טקסט',
  date: 'תאריך',
  checkbox: 'תיבת סימון',
};

export const FIELD_ICONS = {
  signature: '✒️',
  text: '🔤',
  date: '📅',
  checkbox: '☑️',
};

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
