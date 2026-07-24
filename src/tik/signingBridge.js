// Bridge from the worker-file cabinet to the existing digital-signature system.
// A generated contract PDF is uploaded to the same Supabase project the signing
// app uses (the `sign_requests` table + `documents` bucket already exist), so
// the worker/employer can sign it remotely via the signing app's link — with
// the signing app's full audit stamp and stored signed copy.
//
// Only the contract-to-sign travels to the cloud; the worker files themselves
// stay local in IndexedDB.
import { createClient } from '@supabase/supabase-js';
import { loadPlacementFields } from './officeConfig.js';

// Public anon key — safe to ship (protected by Row Level Security), same one the
// signing app uses so the request it creates is readable there.
const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
const BUCKET = 'documents';

let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// The signing app's public address (where the signer opens the link). Editable
// in Settings so it always points at the deployed signing app.
const URL_KEY = 'tik_signing_url';
const DEFAULT_SIGNING_URL = 'https://ogennursing-ux.github.io/ogen-.github.io/';

export function getSigningUrl() {
  try {
    return localStorage.getItem(URL_KEY) || DEFAULT_SIGNING_URL;
  } catch {
    return DEFAULT_SIGNING_URL;
  }
}
export function setSigningUrl(v) {
  try {
    if (v && v !== DEFAULT_SIGNING_URL) localStorage.setItem(URL_KEY, v);
    else localStorage.removeItem(URL_KEY);
  } catch {
    /* ignore */
  }
}

export function signingLink(id) {
  let base = (getSigningUrl() || DEFAULT_SIGNING_URL).trim().replace(/[?#].*$/, '');
  if (!/\.html$/.test(base) && !base.endsWith('/')) base += '/';
  return `${base}?req=${id}`;
}

/**
 * Upload the filled contract PDF and open a signing request for it.
 * @param {object} args
 * @param {Uint8Array} args.pdfBytes  the contract with worker details already stamped
 * @param {string} args.title
 * @param {Array} args.fields         signature fields (signer 0) at the placed spots
 * @param {string} [args.signerName]
 * @returns {Promise<{id:string, link:string}>}
 */
export async function createSigningRequest({ pdfBytes, title, fields, signerName }) {
  const id = crypto.randomUUID();
  const path = `originals/${id}.pdf`;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  const { error: upErr } = await sb()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error('העלאת החוזה למערכת החתימה נכשלה: ' + upErr.message);

  const signers = {
    current: 0,
    list: [{ name: signerName || 'העובד/ת', email: null, color: '#1f7a53', signed: false, signedAt: null }],
    note: '',
    downloadGroups: '',
  };
  const { error } = await sb().from('sign_requests').insert({
    id,
    title: title || null,
    pdf_path: path,
    fields,
    signers,
    status: 'sent',
    signer_email: null,
    owner_email: null,
    webhook_url: null,
  });
  if (error) throw new Error('יצירת בקשת החתימה נכשלה: ' + error.message);

  return { id, link: signingLink(id) };
}

// ---- Two-signer placement signing (employer + caregiver on the SAME contract) ----

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const sig = (pageIndex, signer, xPct, yPct) => ({
  id: uid(), type: 'signature', pageIndex, signer, xPct, yPct, wPct: 0.2, hPct: 0.07, value: '',
});

// Where each party signs on the filled 26-page packet. signer 0 = employer,
// signer 1 = caregiver. Positions are fractions of the page (top-left origin),
// derived from the signature lines on pages 25 (employment contract), 26
// (permit extension) and 10 (job order). Fine-tune live in the signing editor.
export function placementSignatureFields() {
  return [
    sig(24, 0, 0.219, 0.125), // חתימת המעסיק / Signature of Employer
    sig(24, 1, 0.219, 0.241), // חתימת המטפל / Signature of Caregiver
    sig(25, 0, 0.092, 0.601), // Signature of Employer (permit extension)
    sig(25, 1, 0.093, 0.432), // Signature of Employee
    sig(9, 1, 0.315, 0.833),  // Caregiver's signature (rebuilt job order — blank at x≈185–310)
  ];
}

// Use the office-saved signature placement if it exists (set once in the
// "מיקום החתימות" screen), otherwise the built-in defaults above.
export async function resolvePlacementFields() {
  try {
    const saved = await loadPlacementFields();
    if (saved && saved.length) {
      return saved.map((f) => ({
        id: uid(), type: f.type || 'signature', value: '',
        pageIndex: f.pageIndex, signer: f.signer,
        xPct: f.xPct, yPct: f.yPct, wPct: f.wPct ?? 0.2, hPct: f.hPct ?? 0.07,
      }));
    }
  } catch { /* fall back to defaults */ }
  return placementSignatureFields();
}

/**
 * Upload the full filled contract and open a 2-signer request (employer first,
 * then caregiver). Returns the request id + the signing link.
 */
export async function createPlacementSigning({ pdfBytes, employerName, workerName, title }) {
  const id = uid();
  const path = `originals/${id}.pdf`;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const { error: upErr } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error('העלאת החוזה למערכת החתימה נכשלה: ' + upErr.message);

  const list = [
    { name: employerName || 'המעסיק', email: null, color: '#1f7a53', signed: false, signedAt: null },
    { name: workerName || 'העובד/ת', email: null, color: '#2563eb', signed: false, signedAt: null },
  ];
  const { error } = await sb().from('sign_requests').insert({
    id,
    title: title || 'חוזה השמה — חתימת מעסיק ועובד/ת',
    pdf_path: path,
    fields: await resolvePlacementFields(),
    signers: { current: 0, list, note: '', downloadGroups: '' },
    status: 'sent',
    signer_email: null, owner_email: null, webhook_url: null,
  });
  if (error) throw new Error('יצירת בקשת החתימה נכשלה: ' + error.message);
  return { id, link: signingLink(id) };
}

// Send the signing link by SMS via the send-sms Edge Function. Never throws, so
// a not-yet-configured SMS setup can't break the flow.
export async function sendSigningSms(phone, link, name) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ to: phone, link, name }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, error: data.error };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
