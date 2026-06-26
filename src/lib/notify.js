// Owner settings (stored on the owner's device) + best-effort email
// notifications sent through a Make.com webhook (Webhook -> Gmail).
const SETTINGS_KEY = 'owner_settings';

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// POST a JSON payload to the configured Make webhook. Best-effort: never throws,
// so a missing/broken webhook can't block the signing flow.
export async function notify(webhook, payload) {
  if (!webhook) return false;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Make webhooks are cross-origin; we don't need to read the response.
      mode: 'no-cors',
    });
    return true;
  } catch (e) {
    console.warn('notify failed', e);
    return false;
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
