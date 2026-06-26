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
  // signers: { current: number, list: [{name,email,color,signed,signedAt}] }
  async createRequest({ title, pdfBytes, fields, signers, signerEmail }) {
    const id = crypto.randomUUID();
    await uploadPdf(`originals/${id}.pdf`, pdfBytes);
    const { error } = await sb.from('sign_requests').insert({
      id,
      title: title || null,
      pdf_path: `originals/${id}.pdf`,
      fields,
      signers,
      status: 'sent',
      signer_email: signerEmail || null,
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

  // A non-final signer finished: persist their values and advance the turn.
  async advance(id, { fields, signers }) {
    const { error } = await sb.from('sign_requests').update({ fields, signers }).eq('id', id);
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
  },

  // The last signer finished: store the signed PDF and mark complete.
  async submitSigned(id, { fields, signers, signedPdfBytes }) {
    await uploadPdf(`signed/${id}.pdf`, signedPdfBytes);
    const { error } = await sb
      .from('sign_requests')
      .update({
        fields,
        signers,
        signed_pdf_path: `signed/${id}.pdf`,
        status: 'signed',
        signed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
  },
};
