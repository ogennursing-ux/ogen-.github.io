// Shared office configuration stored in the single Supabase "config" row, so a
// setting the office makes once (e.g. where the signatures go on the contract)
// is permanent and the same on every device. Reads/writes MERGE into the row's
// data object so different settings never clobber each other.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
const CONFIG_ID = '00000000-0000-4000-8000-0a9e0c0f0001';

let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// Read the whole config object ({} if none yet).
export async function readConfig() {
  try {
    const { data } = await sb().from('agent_submissions').select('data').eq('id', CONFIG_ID).maybeSingle();
    return data?.data || {};
  } catch {
    return {};
  }
}

// Merge a patch into the config row without losing other keys.
export async function patchConfig(patch) {
  const current = await readConfig();
  const data = { ...current, ...patch };
  const { error } = await sb().from('agent_submissions')
    .upsert({ id: CONFIG_ID, kind: 'config', status: 'config', source: 'office', data }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  return data;
}

// ---- Signature placement (where the signatures sit on the contract) ----------
// Stored as an array of { pageIndex, signer, xPct, yPct, wPct, hPct } (top-left
// origin, fractions of the page) — the same geometry the signing system uses.
export async function loadPlacementFields() {
  const cfg = await readConfig();
  const arr = cfg.placementFields;
  return Array.isArray(arr) && arr.length ? arr : null;
}

export async function savePlacementFields(fields) {
  const clean = (fields || []).map((f) => ({
    type: f.type || 'signature', pageIndex: f.pageIndex, signer: f.signer,
    xPct: f.xPct, yPct: f.yPct, wPct: f.wPct, hPct: f.hPct,
  }));
  return patchConfig({ placementFields: clean });
}
