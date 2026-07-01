// Model for "structured" worker forms — a gov.il-style form made of labeled
// fields the social worker fills in (as opposed to placing overlays on a PDF).
import { uid } from './fields.js';

// Field types available in the builder.
export const SCHEMA_FIELD_TYPES = [
  { type: 'section', label: 'כותרת קטע' },
  { type: 'text', label: 'טקסט' },
  { type: 'textarea', label: 'טקסט ארוך' },
  { type: 'idNumber', label: 'תעודת זהות' },
  { type: 'phone', label: 'טלפון' },
  { type: 'email', label: 'אימייל' },
  { type: 'date', label: 'תאריך' },
  { type: 'checkbox', label: 'תיבת סימון' },
  { type: 'select', label: 'רשימה נפתחת' },
];

// Types that don't collect a value (layout only).
export const LAYOUT_TYPES = ['section'];

export function newSchemaField(type = 'text') {
  const f = { id: uid(), type, label: '', required: false };
  if (type === 'select') f.options = ['אפשרות 1', 'אפשרות 2'];
  return f;
}

// A blank starter schema shown when the builder opens.
export function starterSchema() {
  return [
    { id: uid(), type: 'text', label: 'שם פרטי', required: true },
    { id: uid(), type: 'text', label: 'שם משפחה', required: true },
    { id: uid(), type: 'idNumber', label: 'מספר זהות', required: true },
    { id: uid(), type: 'date', label: 'תאריך לידה', required: false },
  ];
}

export const isLayoutField = (f) => LAYOUT_TYPES.includes(f.type);

// Empty value for a field type (used to seed the fill form).
export function emptyValue(type) {
  return type === 'checkbox' ? false : '';
}

// A field counts as unfilled for required-validation.
export function isSchemaValueEmpty(field, value) {
  if (field.type === 'checkbox') return value !== true;
  return value === undefined || value === null || String(value).trim() === '';
}

// Read the structured-form metadata stored inside a template's `signers` JSON.
export function formMeta(template) {
  const s = template?.signers || {};
  return {
    formType: s.formType || 'pdf',
    schema: Array.isArray(s.schema) ? s.schema : [],
    note: s.note || '',
    active: s.active !== false,
  };
}

export const isStructuredForm = (template) => formMeta(template).formType === 'structured';
