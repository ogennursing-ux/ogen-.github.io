// Shared mapping from a chat submission's flexible fields to worker/family
// records. Used by the office inbox, the signing action, and the cases board,
// so the field mapping the contract relies on lives in ONE place.
import { emptyWorker, emptyFamily } from './workerFilesApi.js';

// Turn an agent submission's flexible data into a worker/family record,
// mapping matching field keys and preserving anything else in the notes.
export function recordFromSubmission(data, type) {
  const rec = type === 'family' ? emptyFamily() : emptyWorker();
  const known = new Set(Object.keys(rec));
  for (const k of known) if (data[k] != null && data[k] !== '') rec[k] = data[k];
  const extra = Object.entries(data || {}).filter(([k, v]) => !known.has(k) && v != null && v !== '');
  if (extra.length) rec.notes = [rec.notes, ...extra.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  return rec;
}

// Build BOTH the worker and family records from a chat submission's fields,
// mapping the chat-specific keys the contract needs: the chat stores the
// employer's phone as `contactPhone` and the worker's as `workerPhone`, while
// the contract reads `family.phone` / `worker.phone`. Also folds the employer
// name (`employerName`) into `family.fullName`.
export function recordsFromChat(fields) {
  const f = { ...(fields || {}) };
  const worker = recordFromSubmission(f, 'worker');
  const family = recordFromSubmission({ ...f, fullName: f.fullName || f.employerName }, 'family');
  if (!worker.phone) worker.phone = f.workerPhone || '';
  if (!family.phone) family.phone = f.contactPhone || '';
  if (!family.mobile) family.mobile = f.contactPhone || '';
  return { worker, family };
}
