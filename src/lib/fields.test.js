import { describe, it, expect } from 'vitest';
import {
  normalizeSigners,
  isFieldEmpty,
  signerNameFromReq,
  clamp,
  hexToRgba,
  todayISO,
  FIELD_DEFAULTS,
  FIELD_LABELS,
  FIELD_ICONS,
} from './fields.js';

describe('normalizeSigners', () => {
  it('returns the default signer for empty input', () => {
    const r = normalizeSigners(null);
    expect(r).toEqual({ current: 0, list: [{ name: 'החותם', color: '#1f7a53' }], note: '' });
  });
  it('wraps a non-empty array', () => {
    const list = [{ name: 'A' }];
    expect(normalizeSigners(list)).toEqual({ current: 0, list, note: '' });
  });
  it('keeps note but defaults the list when list missing', () => {
    expect(normalizeSigners({ note: 'x' }).note).toBe('x');
    expect(normalizeSigners({ note: 'x' }).list[0].name).toBe('החותם');
  });
  it('passes a full object through, defaulting current', () => {
    const list = [{ name: 'A' }, { name: 'B' }];
    expect(normalizeSigners({ current: 1, list })).toEqual({ current: 1, list, note: '' });
  });
});

describe('isFieldEmpty', () => {
  it('checkbox empty unless exactly true', () => {
    expect(isFieldEmpty({ type: 'checkbox', value: true })).toBe(false);
    expect(isFieldEmpty({ type: 'checkbox', value: false })).toBe(true);
  });
  it('other fields empty when no value', () => {
    expect(isFieldEmpty({ type: 'text', value: '' })).toBe(true);
    expect(isFieldEmpty({ type: 'text', value: 'x' })).toBe(false);
  });
});

describe('signerNameFromReq', () => {
  it('returns captured signedName(s), de-duplicated', () => {
    const req = { signers: { list: [{ signedName: 'דנה' }, { signedName: 'דנה' }, { signedName: 'רון' }] } };
    expect(signerNameFromReq(req)).toBe('דנה, רון');
  });

  it('handles signers stored as a bare array', () => {
    expect(signerNameFromReq({ signers: [{ signedName: 'משה' }] })).toBe('משה');
  });

  it('falls back to a fullName field value', () => {
    const req = { signers: { list: [{}] }, fields: [{ type: 'fullName', value: 'ישראל ישראלי' }] };
    expect(signerNameFromReq(req)).toBe('ישראל ישראלי');
  });

  it('falls back to first + last name fields', () => {
    const req = {
      fields: [
        { type: 'firstName', value: 'ישראל' },
        { type: 'lastName', value: 'כהן' },
      ],
    };
    expect(signerNameFromReq(req)).toBe('ישראל כהן');
  });

  it('returns empty string when nothing is available', () => {
    expect(signerNameFromReq({})).toBe('');
    expect(signerNameFromReq(null)).toBe('');
    expect(signerNameFromReq({ signers: { list: [] }, fields: [] })).toBe('');
  });

  it('never throws on a malformed record', () => {
    expect(signerNameFromReq({ signers: 42, fields: 'nope' })).toBe('');
  });
});

describe('clamp / hexToRgba / todayISO', () => {
  it('clamps to bounds', () => {
    expect(clamp(-1, 0, 5)).toBe(0);
    expect(clamp(9, 0, 5)).toBe(5);
    expect(clamp(3, 0, 5)).toBe(3);
  });
  it('converts hex to rgba', () => {
    expect(hexToRgba('#1f7a53', 0.5)).toBe('rgba(31, 122, 83, 0.5)');
  });
  it('formats today as ISO', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('field metadata tables', () => {
  it('every default type has a label and icon', () => {
    for (const type of Object.keys(FIELD_DEFAULTS)) {
      expect(FIELD_LABELS[type]).toBeTruthy();
      expect(FIELD_ICONS[type]).toBeTruthy();
    }
  });
});
