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

// Owner-side bookkeeping: remember the requests created on this device so the
// owner can track status and fetch the signed file later.
const OWNER_KEY = 'my_sign_requests';

export function rememberRequest(entry) {
  const list = listMyRequests();
  list.unshift(entry);
  localStorage.setItem(OWNER_KEY, JSON.stringify(list.slice(0, 50)));
}

export function listMyRequests() {
  try {
    return JSON.parse(localStorage.getItem(OWNER_KEY) || '[]');
  } catch {
    return [];
  }
}

// Build the shareable signing link for a request id, preserving ?mock when set.
export function signingLink(id) {
  const base = location.origin + location.pathname;
  const mock = new URLSearchParams(location.search).has('mock') ? '&mock=1' : '';
  return `${base}?req=${id}${mock}`;
}
