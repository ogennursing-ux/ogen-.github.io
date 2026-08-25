import { describe, it, expect } from 'vitest';
import { parseRanges, parseGroups, toCsv } from './exporters.js';

describe('parseRanges', () => {
  it('parses singles and ranges to 0-based indices', () => {
    expect(parseRanges('1-3,5', 10)).toEqual([0, 1, 2, 4]);
  });
  it('normalizes reversed ranges', () => {
    expect(parseRanges('5-1', 10)).toEqual([0, 1, 2, 3, 4]);
  });
  it('clamps out-of-range and drops page 0', () => {
    expect(parseRanges('0,8-12', 10)).toEqual([7, 8, 9]);
  });
  it('dedupes and ignores garbage', () => {
    expect(parseRanges('1,1,abc', 10)).toEqual([0]);
    expect(parseRanges('', 10)).toEqual([]);
  });
});

describe('parseGroups', () => {
  it('splits on semicolons and newlines, trimming and dropping blanks', () => {
    expect(parseGroups('1 ; 12-20')).toEqual(['1', '12-20']);
    expect(parseGroups('1\n\n2-3;')).toEqual(['1', '2-3']);
  });
  it('returns an empty array for empty/nullish input', () => {
    expect(parseGroups('')).toEqual([]);
    expect(parseGroups(null)).toEqual([]);
    expect(parseGroups('  ;  ')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('starts with a BOM and the header row', () => {
    const csv = toCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"שם המסמך","סטטוס","תאריך"');
  });
  it('escapes quotes and renders rows with CRLF', () => {
    const csv = toCsv([{ title: 'a"b', status: 'signed', date: '2026-01-01' }]);
    expect(csv).toContain('\r\n"a""b","signed","2026-01-01"');
  });
  it('renders null/undefined cells as empty', () => {
    expect(toCsv([{ title: null, status: undefined, date: '' }])).toContain('"","",""');
  });
});
