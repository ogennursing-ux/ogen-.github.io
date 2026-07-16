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
  // Cache-bust + no-store so an edited (re-uploaded) file isn't served stale.
  const url = data.publicUrl + (data.publicUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(url, { cache: 'no-store' });
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
      // Also remove any uploaded split parts (signed/<id>-part<n>.pdf).
      const { data: parts } = await sb.storage.from(BUCKET).list('signed', { search: `${id}-part` });
      if (parts?.length) {
        await sb.storage.from(BUCKET).remove(parts.map((f) => `signed/${f.name}`));
      }
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

  // Upload one split part of a signed document (1-based index), so the email
  // relay can fetch and attach each part separately.
  async uploadSignedPart(id, index, bytes) {
    await uploadPdf(`signed/${id}-part${index}.pdf`, bytes);
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
  async createTemplate({ title, pdfBytes, fields, signers, note, ownerEmail, webhook, category, active, formType, schema }) {
    const id = crypto.randomUUID();
    await uploadPdf(`originals/template-${id}.pdf`, pdfBytes);
    const { error } = await sb.from('templates').insert({
      id,
      title: title || null,
      pdf_path: `originals/template-${id}.pdf`,
      fields,
      signers: {
        list: signers || [],
        note: note || '',
        category: category || null,
        active: active !== false,
        formType: formType || 'pdf',
        schema: schema || [],
      },
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

  // Templates published for the social-worker forms portal (category stored
  // inside the flexible `signers` json — no schema migration needed).
  async listWorkerTemplates() {
    const { data, error } = await sb.from('templates').select('*');
    if (error) throw new Error('טעינת הטפסים נכשלה: ' + error.message);
    return (data || [])
      .filter((row) => row.signers && row.signers.category === 'worker')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  },

  async setTemplateActive(id, active) {
    const { data, error } = await sb.from('templates').select('signers').eq('id', id).single();
    if (error) throw new Error(error.message);
    const { error: upErr } = await sb
      .from('templates')
      .update({ signers: { ...(data.signers || {}), active } })
      .eq('id', id);
    if (upErr) throw new Error(upErr.message);
  },

  // A submission through a permanent (form) link: store a finished signed row.
  async submitForm(template, { fields, signedPdfBytes, title, signers }) {
    const id = crypto.randomUUID();
    // Built-in forms are not database rows, so their id is not a real uuid —
    // never write it to the uuid template_id column (submissions are linked by
    // title instead).
    const builtin = String(template.id || '').startsWith('builtin:');
    await uploadPdf(`signed/${id}.pdf`, signedPdfBytes);
    const { error } = await sb.from('sign_requests').insert({
      id,
      title: title || template.title,
      // Built-in forms have no original PDF; fall back to the signed file so the
      // column is never null.
      pdf_path: template.pdf_path || `signed/${id}.pdf`,
      fields,
      signers: signers || template.signers || [],
      status: 'signed',
      signed_pdf_path: `signed/${id}.pdf`,
      template_id: builtin ? null : template.id,
      owner_email: template.owner_email || null,
      webhook_url: template.webhook_url || null,
      signed_at: new Date().toISOString(),
    });
    if (error) throw new Error('שמירת החתימה נכשלה: ' + error.message);
    return { id };
  },

  // The owner edits a submitted form: overwrite the stored answers, the signed
  // PDF and (optionally) the title.
  async updateSubmission(id, { fields, signedPdfBytes, title }) {
    if (signedPdfBytes) await uploadPdf(`signed/${id}.pdf`, signedPdfBytes);
    const patch = { fields, signed_at: new Date().toISOString() };
    if (title) patch.title = title;
    if (signedPdfBytes) patch.signed_pdf_path = `signed/${id}.pdf`;
    const { error } = await sb.from('sign_requests').update(patch).eq('id', id);
    if (error) throw new Error('עדכון ההגשה נכשל: ' + error.message);
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
