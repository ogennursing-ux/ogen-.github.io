// In-browser mock backend (localStorage) used for local end-to-end testing
// without network access. Same interface as supabaseApi.
const KEY = 'mock_sign_requests';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function saveAll(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

function bytesToB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export const mockApi = {
  async createRequest({ title, pdfBytes, fields, signers, signerEmail }) {
    const id = crypto.randomUUID();
    const all = loadAll();
    all[id] = {
      id,
      title: title || null,
      fields,
      signers,
      status: 'sent',
      signer_email: signerEmail || null,
      pdf_b64: bytesToB64(pdfBytes),
      signed_b64: null,
      signed_at: null,
    };
    saveAll(all);
    return { id };
  },

  async getRequest(id) {
    const req = loadAll()[id];
    if (!req) throw new Error('הבקשה לא נמצאה');
    return req;
  },

  async getOriginalBytes(req) {
    return b64ToBytes(req.pdf_b64);
  },

  async getSignedBytes(req) {
    return b64ToBytes(req.signed_b64);
  },

  async advance(id, { fields, signers }) {
    const all = loadAll();
    if (!all[id]) throw new Error('הבקשה לא נמצאה');
    all[id] = { ...all[id], fields, signers };
    saveAll(all);
  },

  async submitSigned(id, { fields, signers, signedPdfBytes }) {
    const all = loadAll();
    if (!all[id]) throw new Error('הבקשה לא נמצאה');
    all[id] = {
      ...all[id],
      fields,
      signers,
      signed_b64: bytesToB64(signedPdfBytes),
      status: 'signed',
      signed_at: new Date().toISOString(),
    };
    saveAll(all);
  },
};
