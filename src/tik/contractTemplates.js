// PDF contract template mapper.
//
// The office uploads its own contract as a PDF and places data fields on it —
// exactly like placing signature fields in the digital-signature app. Each
// field is bound to a value from the system (worker / patient / company). The
// template (the PDF + the field placements) is saved, and from then on the
// contract fills itself for any case, producing a ready PDF that can also be
// sent to signing.
//
// Reuses the existing PDF field editor (PdfPlacementEditor) and overlay engine
// (buildOverlayPdf) — this module is just the storage + per-case fill wiring.
import { createClient } from '@supabase/supabase-js';
import { recordsFromChat } from './chatRecords.js';
import { buildOverlayPdf } from './contractOverlay.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// ---- base64 <-> bytes -----------------------------------------------------------
export function bytesToBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// A saved template's PDF as a Blob (for re-opening the field editor).
export const templateBlob = (tpl) => new Blob([base64ToBytes(tpl.pdfBase64)], { type: 'application/pdf' });

// ---- fill for a case -----------------------------------------------------------
// Overlay the case's real values onto the template PDF at the saved placements.
// Signature placements carry no value, so they stay empty for signing later.
export async function fillTemplateForCase(tpl, caseObj) {
  const { worker, family } = recordsFromChat(caseObj?.data?.fields || {});
  const bytes = base64ToBytes(tpl.pdfBase64);
  const out = await buildOverlayPdf(bytes, tpl.placements || [], { worker, family }, { companyName: COMPANY_NAME });
  return new Blob([out], { type: 'application/pdf' });
}

// ---- storage (Supabase; kept out of the cases list via kind='config') ----------
const isTpl = (r) => r?.data?.configType === 'contract_template';
const shape = (r) => ({
  id: r.id, name: r.data?.name || 'תבנית',
  placements: r.data?.placements || [], pdfBase64: r.data?.pdfBase64 || '',
  updatedAt: r.data?.updatedAt,
});

export async function listTemplates() {
  const { data, error } = await sb().from('agent_submissions').select('*').eq('kind', 'config').limit(200);
  if (error) throw new Error('טעינת התבניות נכשלה: ' + error.message);
  return (data || []).filter(isTpl).map(shape).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveTemplate({ id, name, pdfBase64, placements }) {
  const data = { configType: 'contract_template', name, pdfBase64, placements, updatedAt: Date.now() };
  if (id) {
    const { error } = await sb().from('agent_submissions').update({ data }).eq('id', id);
    if (error) throw new Error('שמירת התבנית נכשלה: ' + error.message);
    return id;
  }
  const { data: row, error } = await sb().from('agent_submissions').insert({ kind: 'config', status: 'template', data }).select('id').single();
  if (error) throw new Error('שמירת התבנית נכשלה: ' + error.message);
  return row.id;
}

export async function deleteTemplate(id) {
  const { error } = await sb().from('agent_submissions').delete().eq('id', id);
  if (error) throw new Error('מחיקת התבנית נכשלה: ' + error.message);
}
