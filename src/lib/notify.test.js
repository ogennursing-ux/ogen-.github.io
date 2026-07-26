import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSettings, saveSettings, notify, bytesToBase64 } from './notify.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('getSettings / saveSettings', () => {
  it('injects default owner email + relay webhook when nothing is stored', () => {
    const s = getSettings();
    expect(s.ownerEmail).toBeTruthy();
    expect(s.webhook).toContain('script.google.com/macros');
  });

  it('honors a non-Google (custom) webhook override', () => {
    saveSettings({ webhook: 'https://make.hook/abc' });
    expect(getSettings().webhook).toBe('https://make.hook/abc');
  });

  it('migrates a stale google-script webhook to the current default', () => {
    saveSettings({ webhook: 'https://script.google.com/macros/s/OLD/exec' });
    expect(getSettings().webhook).not.toContain('/OLD/');
    expect(getSettings().webhook).toContain('script.google.com/macros');
  });

  it('still applies defaults when the stored JSON is corrupt', () => {
    localStorage.setItem('owner_settings', '{broken');
    const s = getSettings();
    expect(s.ownerEmail).toBeTruthy();
    expect(s.webhook).toBeTruthy();
  });
});

describe('bytesToBase64', () => {
  it('encodes a small byte array', () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe('SGk=');
  });
  it('handles payloads spanning the chunk boundary', () => {
    const big = new Uint8Array(0x8000 * 2 + 3).fill(66);
    expect(atob(bytesToBase64(big)).length).toBe(big.length);
  });
});

describe('notify (best-effort GET relay)', () => {
  it('fires a GET (no-cors) to a custom webhook and returns true', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
    const ok = await notify('https://my.hook/exec', { type: 'invite', to: 'a@b.com' });
    expect(ok).toBe(true);
    const [url, opts] = spy.mock.calls[0];
    expect(url).toContain('https://my.hook/exec');
    expect(url).toContain('notify=1');
    expect(url).toContain('type=invite');
    expect(opts).toMatchObject({ method: 'GET', mode: 'no-cors' });
  });

  it('only serializes non-empty payload fields into the query string', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
    await notify('https://my.hook/exec', { type: 'invite', to: '', title: 'חוזה' });
    const url = spy.mock.calls[0][0];
    expect(url).toContain('title=');
    expect(url).not.toMatch(/[?&]to=/); // empty 'to' omitted
  });

  it('falls back to the default relay for an empty webhook (non-mock mode)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
    const ok = await notify('', { type: 'invite' });
    expect(ok).toBe(true);
    expect(spy.mock.calls[0][0]).toContain('script.google.com/macros');
  });

  it('migrates a stale google-script webhook to the current default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({});
    await notify('https://script.google.com/macros/s/OLD_DEAD_ID/exec', { type: 'invite' });
    expect(spy.mock.calls[0][0]).not.toContain('OLD_DEAD_ID');
    expect(spy.mock.calls[0][0]).toContain('script.google.com/macros');
  });

  it('swallows errors and returns false', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await notify('https://my.hook/exec', {})).toBe(false);
  });
});
