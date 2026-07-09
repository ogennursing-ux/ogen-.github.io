// Bridge from the worker-file cabinet to the existing digital-signature system.
// A generated contract PDF is uploaded to the same Supabase project the signing
// app uses (the `sign_requests` table + `documents` bucket already exist), so
// the worker/employer can sign it remotely via the signing app's link — with
// the signing app's full audit stamp and stored signed copy.
//
// Only the contract-to-sign travels to the cloud; the worker files themselves
// stay local in IndexedDB.
import { createClient } from '@supabase/supabase-js';

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
