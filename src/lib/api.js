// Backend selector. Uses the localStorage mock when ?mock=1 is in the URL
// (for testing) or when Supabase isn't configured; otherwise the real backend.
import { isConfigured } from './config.js';
import { supabaseApi } from './supabaseApi.js';
import { mockApi } from './mockApi.js';

const useMock =
  (typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock')) ||
  !isConfigured;

export const api = useMock ? mockApi : supabaseApi;
export const usingMock = useMock;

const REQS = 'my_sign_requests';
const TMPLS = 'my_templates';

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || '[]');
  } catch {
    return [];
  }
};

export function rememberRequest(entry) {
  const list = read(REQS);
  list.unshift(entry);
  localStorage.setItem(REQS, JSON.stringify(list.slice(0, 100)));
}
export const listMyRequests = () => read(REQS);
export function forgetRequest(id) {
  localStorage.setItem(REQS, JSON.stringify(read(REQS).filter((r) => r.id !== id)));
}

export function rememberTemplate(entry) {
  const list = read(TMPLS);
  list.unshift(entry);
  localStorage.setItem(TMPLS, JSON.stringify(list.slice(0, 100)));
}
export const listMyTemplates = () => read(TMPLS);
export function forgetTemplate(id) {
  localStorage.setItem(TMPLS, JSON.stringify(read(TMPLS).filter((t) => t.id !== id)));
}

// Field-layout templates: a reusable set of field positions (percent-based, so
// PDF-agnostic) + signer order + note, saved locally. Apply one to a freshly
// uploaded contract with the same layout and every field lands pre-placed.
const LAYOUTS = 'my_layouts';
export function saveLayout(entry) {
  const list = read(LAYOUTS);
  list.unshift(entry);
  localStorage.setItem(LAYOUTS, JSON.stringify(list.slice(0, 100)));
}
export const listLayouts = () => read(LAYOUTS);
export function forgetLayout(id) {
  localStorage.setItem(LAYOUTS, JSON.stringify(read(LAYOUTS).filter((l) => l.id !== id)));
}

const mockSuffix = () =>
  new URLSearchParams(location.search).has('mock') ? '&mock=1' : '';

// Shareable signing link for a one-off request.
export function signingLink(id) {
  return `${location.origin}${location.pathname}?req=${id}${mockSuffix()}`;
}
// Permanent link for a reusable template (form).
export function formLink(templateId) {
  return `${location.origin}${location.pathname}?form=${templateId}${mockSuffix()}`;
}
