import { describe, it, expect, afterEach } from 'vitest';
import { translate, getInitialLang, applyLang } from './i18n.js';

afterEach(() => localStorage.clear());

describe('translate', () => {
  it('returns the Hebrew key unchanged in Hebrew mode', () => {
    expect(translate('he', 'חתימה דיגיטלית')).toBe('חתימה דיגיטלית');
  });
  it('looks up English when available', () => {
    expect(translate('en', 'חתימה דיגיטלית')).toBe('Digital Signature');
  });
  it('falls back to the Hebrew key when no English exists', () => {
    expect(translate('en', 'מחרוזת שלא קיימת')).toBe('מחרוזת שלא קיימת');
  });
  it('substitutes placeholders (every occurrence)', () => {
    expect(translate('he', 'שלום {name} {name}', { name: 'דנה' })).toBe('שלום דנה דנה');
  });
});

describe('getInitialLang', () => {
  it('defaults to Hebrew', () => {
    expect(getInitialLang()).toBe('he');
  });
  it('reads a stored preference', () => {
    localStorage.setItem('lang', 'en');
    expect(getInitialLang()).toBe('en');
  });
});

describe('applyLang', () => {
  it('sets RTL for Hebrew and LTR for English', () => {
    applyLang('he');
    expect(document.documentElement.dir).toBe('rtl');
    applyLang('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });
});
