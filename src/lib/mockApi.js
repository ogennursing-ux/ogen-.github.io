// In-browser mock backend (localStorage) used for local end-to-end testing
// without network access. Same interface as supabaseApi.
const REQ_KEY = 'mock_sign_requests';
const TMPL_KEY = 'mock_templates';

const load = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || '{}');
  } catch {
    return {};
  }
};
const save = (k, o) => localStorage.setItem(k, JSON.stringify(o));

function bytesToB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) bin += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export const mockApi = {
  async createRequest({ title, pdfBytes, fields, signers, signerEmail, ownerEmail, webhook }) {
    const id = crypto.randomUUID();
    const all = load(REQ_KEY);
    all[id] = {
      id,
      title: title || null,
      fields,
      signers,
      status: 'sent',
      signer_email: signerEmail || null,
      owner_email: ownerEmail || null,
      webhook_url: webhook || null,
      template_id: null,
      pdf_b64: bytesToB64(pdfBytes),
      signed_b64: null,
      signed_at: null,
      created_at: new Date().toISOString(),
    };
    save(REQ_KEY, all);
    return { id };
  },

  async getRequest(id) {
    const req = load(REQ_KEY)[id];
    if (!req) throw new Error('הבקשה לא נמצאה');
    return req;
  },

  async getOriginalBytes(req) {
    // template-based form rows reference the template's pdf
    if (!req.pdf_b64 && req.template_id) {
      const t = load(TMPL_KEY)[req.template_id];
      if (t) return b64ToBytes(t.pdf_b64);
    }
    return b64ToBytes(req.pdf_b64);
  },
  async getSignedBytes(req) {
    return b64ToBytes(req.signed_b64);
  },

  async advance(id, { fields, signers }) {
    const all = load(REQ_KEY);
    if (!all[id]) throw new Error('הבקשה לא נמצאה');
    all[id] = { ...all[id], fields, signers };
    save(REQ_KEY, all);
  },

  async submitSigned(id, { fields, signers, signedPdfBytes }) {
    const all = load(REQ_KEY);
    if (!all[id]) throw new Error('הבקשה לא נמצאה');
    all[id] = {
      ...all[id],
      fields,
      signers,
      signed_b64: bytesToB64(signedPdfBytes),
      status: 'signed',
      signed_at: new Date().toISOString(),
    };
    save(REQ_KEY, all);
  },

  async createTemplate({ title, pdfBytes, fields, signers, ownerEmail, webhook }) {
    const id = crypto.randomUUID();
    const all = load(TMPL_KEY);
    all[id] = {
      id,
      title: title || null,
      fields,
      signers: signers || [],
      owner_email: ownerEmail || null,
      webhook_url: webhook || null,
      pdf_b64: bytesToB64(pdfBytes),
      created_at: new Date().toISOString(),
    };
    save(TMPL_KEY, all);
    return { id };
  },

  async getTemplate(id) {
    const t = load(TMPL_KEY)[id];
    if (!t) throw new Error('התבנית לא נמצאה');
    return t;
  },

  async deleteTemplate(id) {
    const all = load(TMPL_KEY);
    delete all[id];
    save(TMPL_KEY, all);
  },

  async submitForm(template, { fields, signedPdfBytes }) {
    const id = crypto.randomUUID();
    const all = load(REQ_KEY);
    all[id] = {
      id,
      title: template.title,
      fields,
      signers: template.signers || [],
      status: 'signed',
      template_id: template.id,
      owner_email: template.owner_email || null,
      webhook_url: template.webhook_url || null,
      pdf_b64: template.pdf_b64,
      signed_b64: bytesToB64(signedPdfBytes),
      signed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    save(REQ_KEY, all);
    return { id };
  },

  async listSubmissions(templateId) {
    return Object.values(load(REQ_KEY))
      .filter((r) => r.template_id === templateId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  },
};
