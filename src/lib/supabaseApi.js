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
  // ---- one-off signing requests ----
  async createRequest({ title, pdfBytes, fields, signers, signerEmail, ownerEmail, webhook }) {
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
      owner_email: ownerEmail || null,
      webhook_url: webhook || null,
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

  // Best-effort delete (needs an anon delete policy on sign_requests to fully
  // remove the row; storage files are removed by convention path).
  async deleteRequest(id) {
    try {
      await sb.storage.from(BUCKET).remove([`originals/${id}.pdf`, `signed/${id}.pdf`]);
    } catch {
      /* ignore */
    }
    const { error } = await sb.from('sign_requests').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async advance(id, { fields, signers }) {
    const { error } = await sb.from('sign_requests').update({ fields, signers }).eq('id', id);
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
  },

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

  // ---- reusable templates ----
  async createTemplate({ title, pdfBytes, fields, signers, note, ownerEmail, webhook }) {
    const id = crypto.randomUUID();
    await uploadPdf(`originals/template-${id}.pdf`, pdfBytes);
    const { error } = await sb.from('templates').insert({
      id,
      title: title || null,
      pdf_path: `originals/template-${id}.pdf`,
      fields,
      signers: { list: signers || [], note: note || '' },
      owner_email: ownerEmail || null,
      webhook_url: webhook || null,
    });
    if (error) throw new Error('שמירת התבנית נכשלה: ' + error.message);
    return { id };
  },

  async getTemplate(id) {
    const { data, error } = await sb.from('templates').select('*').eq('id', id).single();
    if (error) throw new Error('התבנית לא נמצאה: ' + error.message);
    return data;
  },

  async deleteTemplate(id) {
    await sb.from('templates').delete().eq('id', id);
  },

  // A submission through a permanent (form) link: store a finished signed row.
  async submitForm(template, { fields, signedPdfBytes }) {
    const id = crypto.randomUUID();
    await uploadPdf(`signed/${id}.pdf`, signedPdfBytes);
    const { error } = await sb.from('sign_requests').insert({
      id,
      title: template.title,
      pdf_path: template.pdf_path,
      fields,
      signers: template.signers || [],
      status: 'signed',
      signed_pdf_path: `signed/${id}.pdf`,
      template_id: template.id,
      owner_email: template.owner_email || null,
      webhook_url: template.webhook_url || null,
      signed_at: new Date().toISOString(),
    });
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
    return { id };
  },

  async listAllSigned() {
    const { data, error } = await sb
      .from('sign_requests')
      .select('*')
      .eq('status', 'signed')
      .order('signed_at', { ascending: false })
      .limit(500);
    if (error) throw new Error('טעינת החתימות נכשלה: ' + error.message);
    return data || [];
  },

  async listSubmissions(templateId) {
    const { data, error } = await sb
      .from('sign_requests')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false });
    if (error) throw new Error('טעינת החתימות נכשלה: ' + error.message);
    return data || [];
  },
};
