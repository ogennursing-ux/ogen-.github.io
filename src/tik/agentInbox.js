// "Inbox" bridge for submissions coming from an external agent (e.g. a Base44
// app). The agent POSTs worker/family details into the `agent_submissions`
// table in the shared Supabase project; here we read them so the owner can
// review and import each one into a worker/family file.
//
// Base44 (or any external tool) sends, for each record:
//   POST {SUPABASE_URL}/rest/v1/agent_submissions
//   headers: apikey, Authorization: Bearer <anon>, Content-Type, Prefer: return=minimal
//   body: { "kind": "worker" | "family", "data": { ...fields... } }
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';

let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// The Supabase details the Base44 app needs, surfaced in the UI for copy/paste.
export const AGENT_ENDPOINT = `${SUPABASE_URL}/rest/v1/agent_submissions`;
export const AGENT_ANON_KEY = SUPABASE_ANON_KEY;

// New (not yet imported/dismissed) submissions, newest first. Split-intake
// halves (an employer link + a worker link) are joined automatically by the
// worker's passport number, so the office sees ONE combined submission.
export async function listNewSubmissions() {
  const { data, error } = await sb()
    .from('agent_submissions')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error('טעינת ההגשות נכשלה: ' + error.message);
  return mergeHalves(data || []);
}

// Group rows that share a passport key (data.meta.linkKey) and came from a
// role-specific link, merging their fields/files into one submission.
function mergeHalves(rows) {
  const groups = new Map();
  const out = [];
  for (const r of rows) {
    const key = r?.data?.meta?.linkKey;
    const role = r?.data?.meta?.role;
    if (key && (role === 'employer' || role === 'worker')) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    } else {
      out.push(r); // full flow or no key — leave as-is
    }
  }
  for (const [key, group] of groups) {
    if (group.length === 1) { out.push(group[0]); continue; } // only one half arrived so far
    // employer first so its name/ID win, then overlay the worker's fields
    const ordered = [...group].sort((a, b) => (a.data.meta.role === 'employer' ? -1 : 1));
    const fields = {}; const files = []; const transcript = []; const ids = [];
    let needsCallback = false;
    for (const r of ordered) {
      ids.push(r.id);
      for (const [k, v] of Object.entries(r.data?.fields || {})) if (v != null && v !== '') fields[k] = v;
      for (const f of r.data?.files || []) files.push(f);
      for (const t of r.data?.transcript || []) transcript.push(t);
      if (r.data?.needsCallback) needsCallback = true;
    }
    const primary = ordered[0];
    out.push({
      id: primary.id,
      ids, // all rows to mark done together
      kind: 'family',
      source: 'chat',
      status: 'new',
      created_at: group.map((r) => r.created_at).sort().slice(-1)[0],
      data: {
        chat: true, merged: true, needsCallback,
        meta: { ...primary.data.meta, role: 'merged', linkKey: key, roles: group.map((r) => r.data.meta.role) },
        transcript, fields, files, updatedAt: new Date().toISOString(),
      },
    });
  }
  out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return out;
}

export async function countNewSubmissions() {
  const { count, error } = await sb()
    .from('agent_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  if (error) return 0;
  return count || 0;
}

export async function setSubmissionStatus(id, status) {
  const { error } = await sb().from('agent_submissions').update({ status }).eq('id', id);
  if (error) throw new Error('עדכון ההגשה נכשל: ' + error.message);
}
