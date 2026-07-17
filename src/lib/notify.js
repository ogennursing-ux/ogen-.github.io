// Owner settings (stored on the owner's device) + best-effort email
// notifications sent through a Google Apps Script (or Make) relay.
const SETTINGS_KEY = 'owner_settings';

// Built-in defaults so email notifications work out of the box on every device,
// with no per-device setup. The owner can still override these in ⚙ Settings.
const DEFAULT_OWNER_EMAIL = 'ogen.manpower@gmail.com';
const DEFAULT_WEBHOOK =
  'https://script.google.com/macros/s/AKfycbzv7LR28c-AtlickLxA0G1dvLx88P12m6aR4qfkM566dY4N7Jg4P_MvWDJHvjM0E-R6Tg/exec';

// In local test mode (?mock=1) we do NOT apply the real defaults, so the E2E
// suite never fires real emails to the production relay.
const isMock =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');

export function getSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    s = {};
  }
  if (!isMock) {
    if (!s.ownerEmail) s.ownerEmail = DEFAULT_OWNER_EMAIL;
    // Stale-relay migration: old Apps Script deployment URLs saved in
    // localStorage before the current default shipped would silently win over
    // it and point at a dead deployment. Any Google-Script URL that isn't the
    // current default is stale — force the default. Non-Google webhooks (e.g.
    // a Make.com hook) are still honored as a manual override.
    const isStaleScriptUrl =
      s.webhook && s.webhook.includes('script.google.com') && s.webhook !== DEFAULT_WEBHOOK;
    if (!s.webhook || isStaleScriptUrl) s.webhook = DEFAULT_WEBHOOK;
  }
  return s;
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// Send the notification as a GET with the data in the query string.
// Why GET and not POST: Google Apps Script web apps 302-redirect requests, and
// browsers downgrade a redirected POST to GET and DROP the body — so a browser
// POST never reaches doPost. A GET survives the redirect and reliably reaches
// doGet. The signed PDF is passed as a public download link (fileUrl) instead of
// a base64 attachment (which is too large for a URL). Best-effort: never throws.
export async function notify(webhook, payload) {
  // The webhook URL is embedded in each signing request at creation time, so
  // requests created before the current relay shipped carry a dead deployment
  // URL forever. Apply the same stale-relay migration here, at send time:
  // any Google-Script URL that isn't the current default is stale. Skipped in
  // mock mode so E2E keeps its mock endpoints and never hits the real relay.
  if (!isMock) {
    const isStaleScriptUrl =
      webhook && webhook.includes('script.google.com') && webhook !== DEFAULT_WEBHOOK;
    if (!webhook || isStaleScriptUrl) webhook = DEFAULT_WEBHOOK;
  }
  if (!webhook) return false;
  try {
    const params = new URLSearchParams({ notify: '1' });
    ['type', 'to', 'title', 'subject', 'message', 'link', 'signerName', 'fileUrl', 'fileName', 'fileUrls', 'fileNames'].forEach((k) => {
      if (payload[k] != null && payload[k] !== '') params.set(k, String(payload[k]));
    });
    const sep = webhook.includes('?') ? '&' : '?';
    await fetch(webhook + sep + params.toString(), { method: 'GET', mode: 'no-cors' });
    return true;
  } catch (e) {
    console.warn('notify failed', e);
    return false;
  }
}

// Best-effort lookup of the signer's public IP (for the audit trail).
export async function getIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const j = await res.json();
    return j.ip || null;
  } catch {
    return null;
  }
}

// Convert PDF bytes to base64 (for emailing the signed file as an attachment).
export function bytesToBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
  }
  return btoa(bin);
}
