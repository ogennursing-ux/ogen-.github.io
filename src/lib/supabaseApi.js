// Real backend: Supabase (Postgres + Storage).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function uploadPdf(path, bytes) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error('העלאת הקובץ נכשלה: ' + error.message);
}

async function downloadPdf(path) {
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  const res = await fetch(data.publicUrl);
  if (!res.ok) throw new Error('הורדת הקובץ נכשלה (' + res.status + ')');
  return res.arrayBuffer();
}

export const supabaseApi = {
  async createRequest({ title, pdfBytes, fields, signer }) {
    const id = crypto.randomUUID();
    await uploadPdf(`originals/${id}.pdf`, pdfBytes);
    const { error } = await sb.from('sign_requests').insert({
      id,
      title: title || null,
      pdf_path: `originals/${id}.pdf`,
      fields,
      signers: signer ? [signer] : [],
      status: 'sent',
      signer_email: signer?.email || null,
    });
    if (error) throw new Error('יצירת הבקשה נכשלה: ' + error.message);
    return { id };
  },

  async getRequest(id) {
    const { data, error } = await sb.from('sign_requests').select('*').eq('id', id).single();
    if (error) throw new Error('הבקשה לא נמצאה: ' + error.message);
    return data;
  },

  getOriginalBytes(req) {
    return downloadPdf(req.pdf_path);
  },

  getSignedBytes(req) {
    return downloadPdf(req.signed_pdf_path);
  },

  async submitSigned(id, { fields, signedPdfBytes }) {
    await uploadPdf(`signed/${id}.pdf`, signedPdfBytes);
    const { error } = await sb
      .from('sign_requests')
      .update({
        fields,
        signed_pdf_path: `signed/${id}.pdf`,
        status: 'signed',
        signed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
  },
};
