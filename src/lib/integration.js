// Outbound integration — push every social-worker form submission to an
// external system so the details can flow into other software (a CRM, a
// spreadsheet, the Ogen management app, etc.).
//
// ── SECURITY (read before setting a URL) ────────────────────────────────────
// This code ships in the PUBLIC browser bundle, so anything written here is
// visible to every visitor. NEVER put a real API key / token in this file.
// Instead point INTEGRATION_WEBHOOK at a RELAY you control that holds the real
// secret server-side and forwards to the target system:
//   • a Google Apps Script web app  (see docs/email-relay.gs for the pattern), or
//   • a Supabase Edge Function       (see supabase/functions/telegram-webhook), or
//   • a Make / Zapier "catch hook".
// The relay URL itself is safe to expose here — it only ACCEPTS data, it does
// not grant access to anything.
//
// To turn the integration on: paste the relay URL below. Empty = disabled
// (nothing is sent, submissions work exactly as before).
export const INTEGRATION_WEBHOOK = '';

// In local test mode (?mock=1) we never hit a real endpoint, so the E2E suite
// can point the integration at its own interceptor without side effects.
const isMock =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');

// Build a clean, mapping-friendly payload from a structured submission.
// `fields` uses the human Hebrew labels (easy to read / map in Sheets, Make,
// etc.); `fieldsById` uses the stable field ids (safe for code that maps by id).
export function buildIntegrationPayload({ template, schema, values, title }) {
  const byLabel = {};
  const byId = {};
  for (const f of schema || []) {
    if (f.type === 'section') continue;
    let v = values ? values[f.id] : undefined;
    if (Array.isArray(v)) v = v.join(', ');
    byId[f.id] = v == null ? '' : v;
    if (f.label) byLabel[f.label] = v == null ? '' : v;
  }
  return {
    event: 'form_submitted',
    form: (template && template.title) || '',
    formKey: (template && template.formKey) || null,
    title: title || (template && template.title) || '',
    submittedAt: new Date().toISOString(),
    fields: byLabel,
    fieldsById: byId,
  };
}

// Best-effort push to the relay. Never throws; fire-and-forget so a slow or
// unreachable relay can never block or break the "thank you" screen.
export async function sendIntegration(payload, url = INTEGRATION_WEBHOOK) {
  // In mock mode never hit the real relay: send only to a URL the E2E test
  // injects via localStorage, so existing suites stay side-effect free.
  if (isMock) {
    let testUrl = '';
    try { testUrl = localStorage.getItem('mock_integration_url') || ''; } catch { /* ignore */ }
    if (!testUrl) return false;
    url = testUrl;
  }
  if (!url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      // no-cors only allows a "simple" content-type; relays (Apps Script,
      // Make, Zapier) still parse the JSON from the raw request body.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    console.warn('integration send failed', e);
    return false;
  }
}
