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

// New (not yet imported/dismissed) submissions, newest first.
export async function listNewSubmissions() {
  const { data, error } = await sb()
    .from('agent_submissions')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error('טעינת ההגשות נכשלה: ' + error.message);
  return data || [];
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
