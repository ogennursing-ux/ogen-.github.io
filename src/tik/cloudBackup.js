// Automatic cloud backup for the worker/family records.
//
// Everything the app stores lives in the browser's IndexedDB, which is wiped if
// the user clears the browser or switches phones. To protect against that, this
// module mirrors the CORE records (workers + families — the typed and
// AI-extracted fields, and the worker↔family links) to the shared Supabase
// project on a debounced schedule, and can restore them on any device.
//
// It reuses the existing `agent_submissions` table (no extra setup for the
// user) by writing a single well-known row with status 'cloudbackup', so it
// never shows up in the "new submissions" inbox. Large document scans are NOT
// auto-uploaded (they can be many MB); those are covered by the manual full
// backup file.
import { createClient } from '@supabase/supabase-js';
import { listWorkers, saveWorker, listFamilies, saveFamily } from './workerFilesApi.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';

let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// One shared row for the whole company account, so any device that logs in
// pulls the same backup. Fixed UUID = the row's primary key.
const ROW_ID = '00000000-0000-4000-8000-0a9e0c10c000';
const LAST_SYNC_KEY = 'tik_cloud_last_sync';

export function getLastSync() {
  try { return localStorage.getItem(LAST_SYNC_KEY) || ''; } catch { return ''; }
}
function setLastSync(iso) {
  try { localStorage.setItem(LAST_SYNC_KEY, iso); } catch { /* ignore */ }
}

// The records we mirror (no file blobs — kept small and fast).
export async function collectRecords() {
  const [workers, families] = await Promise.all([listWorkers(), listFamilies()]);
  return { workers, families };
}

// A stable signature of the records, so the auto-loop only uploads on change.
export function recordsSignature(rec) {
  return JSON.stringify({
    w: (rec.workers || []).map((w) => [w.id, w.updatedAt]),
    f: (rec.families || []).map((f) => [f.id, f.updatedAt]),
  });
}

export async function backupNow(rec) {
  const records = rec || (await collectRecords());
  const savedAt = new Date().toISOString();
  const payload = { ...records, savedAt };
  const { error } = await sb()
    .from('agent_submissions')
    .upsert({ id: ROW_ID, kind: 'backup', status: 'cloudbackup', source: 'tik-auto', data: payload }, { onConflict: 'id' });
  if (error) throw new Error('גיבוי לענן נכשל: ' + error.message);
  setLastSync(savedAt);
  return payload;
}

export async function fetchCloud() {
  const { data, error } = await sb()
    .from('agent_submissions')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) throw new Error('טעינה מהענן נכשלה: ' + error.message);
  return data?.data || null;
}

// Write the cloud records back into IndexedDB (merge by id).
export async function restoreFromCloud() {
  const payload = await fetchCloud();
  if (!payload) return { workers: 0, families: 0, empty: true };
  for (const w of payload.workers || []) await saveWorker(w);
  for (const f of payload.families || []) await saveFamily(f);
  if (payload.savedAt) setLastSync(payload.savedAt);
  return { workers: (payload.workers || []).length, families: (payload.families || []).length };
}
