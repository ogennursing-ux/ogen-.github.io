import { describe, it, expect } from 'vitest';
import {
  newSchemaField,
  starterSchema,
  isLayoutField,
  emptyValue,
  isSchemaValueEmpty,
  formMeta,
  isStructuredForm,
  OPTION_TYPES,
  LAYOUT_TYPES,
  SCHEMA_FIELD_TYPES,
} from './formSchema.js';

describe('newSchemaField', () => {
  it('creates a text field by default with a unique id', () => {
    const a = newSchemaField();
    const b = newSchemaField();
    expect(a.type).toBe('text');
    expect(a.required).toBe(false);
    expect(a.label).toBe('');
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('seeds default options for option types', () => {
    expect(newSchemaField('select').options).toEqual(['אפשרות 1', 'אפשרות 2']);
    expect(newSchemaField('checklist').options).toEqual(['אפשרות 1', 'אפשרות 2']);
  });

  it('does not add options for non-option types', () => {
    expect(newSchemaField('text').options).toBeUndefined();
    expect(newSchemaField('checkbox').options).toBeUndefined();
  });
});

describe('starterSchema', () => {
  it('returns four labeled starter fields with unique ids', () => {
    const s = starterSchema();
    expect(s).toHaveLength(4);
    expect(s.every((f) => f.label && f.id)).toBe(true);
    expect(new Set(s.map((f) => f.id)).size).toBe(4);
  });
});

describe('isLayoutField', () => {
  it('is true only for layout types', () => {
    expect(isLayoutField({ type: 'section' })).toBe(true);
    expect(isLayoutField({ type: 'text' })).toBe(false);
  });
});

describe('emptyValue', () => {
  it('returns the right empty seed per type', () => {
    expect(emptyValue('checkbox')).toBe(false);
    expect(emptyValue('checklist')).toEqual([]);
    expect(emptyValue('text')).toBe('');
    expect(emptyValue('date')).toBe('');
  });
});

describe('isSchemaValueEmpty', () => {
  it('checkbox is empty unless exactly true', () => {
    expect(isSchemaValueEmpty({ type: 'checkbox' }, false)).toBe(true);
    expect(isSchemaValueEmpty({ type: 'checkbox' }, true)).toBe(false);
  });

  it('checklist is empty when not a non-empty array', () => {
    expect(isSchemaValueEmpty({ type: 'checklist' }, [])).toBe(true);
    expect(isSchemaValueEmpty({ type: 'checklist' }, undefined)).toBe(true);
    expect(isSchemaValueEmpty({ type: 'checklist' }, ['a'])).toBe(false);
  });

  it('text-like fields are empty when blank or whitespace', () => {
    expect(isSchemaValueEmpty({ type: 'text' }, '')).toBe(true);
    expect(isSchemaValueEmpty({ type: 'text' }, '   ')).toBe(true);
    expect(isSchemaValueEmpty({ type: 'text' }, null)).toBe(true);
    expect(isSchemaValueEmpty({ type: 'text' }, 'x')).toBe(false);
  });
});

describe('formMeta / isStructuredForm', () => {
  it('defaults to a pdf form with an empty schema when nothing is stored', () => {
    expect(formMeta(undefined)).toEqual({ formType: 'pdf', schema: [], note: '', active: true });
    expect(formMeta({})).toEqual({ formType: 'pdf', schema: [], note: '', active: true });
  });

  it('reads the structured metadata out of a template signers blob', () => {
    const tpl = { signers: { formType: 'structured', schema: [{ id: '1' }], note: 'n', active: false } };
    expect(formMeta(tpl)).toEqual({ formType: 'structured', schema: [{ id: '1' }], note: 'n', active: false });
    expect(isStructuredForm(tpl)).toBe(true);
  });

  it('coerces a non-array schema to an empty array', () => {
    expect(formMeta({ signers: { schema: 'oops' } }).schema).toEqual([]);
  });

  it('treats a plain pdf template as not structured', () => {
    expect(isStructuredForm({ signers: {} })).toBe(false);
  });
});

describe('type tables', () => {
  it('OPTION_TYPES and LAYOUT_TYPES only reference declared field types', () => {
    const declared = new Set(SCHEMA_FIELD_TYPES.map((t) => t.type));
    for (const t of [...OPTION_TYPES, ...LAYOUT_TYPES]) expect(declared.has(t)).toBe(true);
  });
});
