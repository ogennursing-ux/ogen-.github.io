// The digital-forms log: every form the office sent out for signature, with who
// it went to and when it came back signed. It reads the same `sign_requests`
// table the signing system writes to, so nothing new has to be recorded — the
// log is the signing system, seen as a list.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb = null;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// A form's state, said the way the office says it.
export const FORM_STATES = {
  signed: { key: 'signed', label: 'נחתם', tone: 'ok' },
  partial: { key: 'partial', label: 'נחתם חלקית', tone: 'warn' },
  sent: { key: 'sent', label: 'נשלח', tone: 'info' },
  cancelled: { key: 'cancelled', label: 'בוטל', tone: 'bad' },
};

function stateOf(req) {
  if (req.status === 'cancelled') return FORM_STATES.cancelled;
  const list = req.signers?.list || [];
  const signed = list.filter((s) => s.signed).length;
  if (list.length && signed >= list.length) return FORM_STATES.signed;
  if (signed > 0) return FORM_STATES.partial;
  return FORM_STATES.sent;
}

// The latest signature on the request — that is the date the form was completed.
function signedAt(req) {
  const dates = (req.signers?.list || []).map((s) => s.signedAt).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : '';
}

// One row per form sent, matching the office's own columns: when it went out,
// who it is about, which form, which set, who it was sent to, and the date it
// was signed.
export async function loadDigitalForms() {
  const { data, error } = await sb()
    .from('sign_requests')
    .select('id,title,status,signers,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error('טעינת הטפסים הדיגיטליים נכשלה: ' + error.message);

  return (data || []).map((r) => {
    const list = r.signers?.list || [];
    const state = stateOf(r);
    return {
      id: r.id,
      sentAt: r.created_at,
      title: r.title || 'טופס ללא שם',
      // The signing system's "download groups" are what the office calls a set.
      setName: r.signers?.downloadGroups ? 'סט מוגדר' : '',
      sentTo: list.map((s) => s.name).filter(Boolean).join(' · '),
      signerCount: list.length,
      signedCount: list.filter((s) => s.signed).length,
      state,
      signedAt: signedAt(r),
      note: r.signers?.note || '',
    };
  });
}
