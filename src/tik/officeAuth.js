// Shared office login (same credentials as the main app) so the cases board
// (#board) sits behind the same gate without duplicating the check.
import { COMPANY_NAME } from '../lib/workerPortal.js';

export const AUTH_KEY = 'tik_auth';
const PASS = '12345';
const USERS = ['עוגן סיעוד', COMPANY_NAME];

export const isAuthed = () => {
  try { return localStorage.getItem(AUTH_KEY) === '1'; } catch { return false; }
};
export const login = (user, pass) => {
  if (USERS.includes(String(user).trim()) && pass === PASS) {
    try { localStorage.setItem(AUTH_KEY, '1'); } catch { /* ignore */ }
    return true;
  }
  return false;
};
