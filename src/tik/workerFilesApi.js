// Self-contained storage for the foreign-worker file cabinet ("תיק עובד זר").
//
// This module is intentionally INDEPENDENT of the signing app's Supabase
// backend: worker records and their uploaded document scans (passport, visa,
// work permit, insurance…) live in the browser's IndexedDB. That keeps the new
// system standalone, works offline, and needs no server-side schema — while
// still handling large image/PDF scans that would blow past the localStorage
// quota.
//
// Two object stores:
//   workers — one record per foreign worker (personal + employment details)
//   files   — one row per uploaded scan, linked to a worker by `workerId`
//             (the Blob itself is stored, not a base64 string).

const DB_NAME = 'ogen_worker_files';
const DB_VERSION = 1;
const WORKERS = 'workers';
const FILES = 'files';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WORKERS)) {
        db.createObjectStore(WORKERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES)) {
        const store = db.createObjectStore(FILES, { keyPath: 'id' });
        store.createIndex('workerId', 'workerId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        const out = run(os, (v) => (result = v));
        t.oncomplete = () => resolve(result !== undefined ? result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);

// A blank worker record with every field the UI knows about.
export function emptyWorker() {
  return {
    id: uid(),
    // personal
    nameHe: '',
    nameEn: '',
    passportNo: '',
    nationality: '',
    dob: '',
    gender: '',
    placeOfBirth: '',
    fatherName: '',
    motherName: '',
    maritalStatus: '',
    phone: '',
    email: '',
    // document validity
    passportIssueDate: '',
    issuePlace: '',
    passportExpiry: '',
    visaExpiry: '',
    permitExpiry: '',
    insuranceExpiry: '',
    // employment
    employer: '',
    patientName: '',
    address: '',
    startDate: '',
    salary: '',
    notes: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- worker records ----

export async function listWorkers() {
  const rows = await tx(WORKERS, 'readonly', (os, set) =>
    reqToPromise(os.getAll()).then(set),
  );
  return (rows || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getWorker(id) {
  return tx(WORKERS, 'readonly', (os, set) => reqToPromise(os.get(id)).then(set));
}

export async function saveWorker(worker) {
  const record = { ...worker, updatedAt: Date.now() };
  if (!record.id) record.id = uid();
  if (!record.createdAt) record.createdAt = Date.now();
  await tx(WORKERS, 'readwrite', (os) => os.put(record));
  return record;
}

export async function deleteWorker(id) {
  // Remove the worker and every scan attached to it.
  const files = await listFiles(id);
  await Promise.all(files.map((f) => deleteFile(f.id)));
  await tx(WORKERS, 'readwrite', (os) => os.delete(id));
}

// ---- uploaded document scans ----

export async function listFiles(workerId) {
  const rows = await tx(FILES, 'readonly', (os, set) => {
    const idx = os.index('workerId');
    reqToPromise(idx.getAll(workerId)).then(set);
  });
  return (rows || []).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function addFile(workerId, { category, file }) {
  const record = {
    id: uid(),
    workerId,
    category: category || 'other',
    name: file.name || 'document',
    mime: file.type || 'application/octet-stream',
    size: file.size || 0,
    blob: file, // File extends Blob — IndexedDB stores it natively
    addedAt: Date.now(),
  };
  await tx(FILES, 'readwrite', (os) => os.put(record));
  return record;
}

// Store a copy of an existing scan (the "duplicate" / copy action).
export async function duplicateFile(fileId) {
  const src = await tx(FILES, 'readonly', (os, set) =>
    reqToPromise(os.get(fileId)).then(set),
  );
  if (!src) return null;
  const copy = {
    ...src,
    id: uid(),
    name: copyName(src.name),
    addedAt: Date.now(),
  };
  await tx(FILES, 'readwrite', (os) => os.put(copy));
  return copy;
}

function copyName(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + ' (עותק)';
  return name.slice(0, dot) + ' (עותק)' + name.slice(dot);
}

export async function deleteFile(id) {
  await tx(FILES, 'readwrite', (os) => os.delete(id));
}

// Build a fresh object URL for a stored scan. Caller must revokeObjectURL.
export function fileObjectUrl(fileRecord) {
  return URL.createObjectURL(fileRecord.blob);
}

// ---- backup / restore ----
// Since everything lives in this browser only, export bundles every worker and
// every scan (blobs base64-encoded as data URLs) into one JSON file that can be
// stored safely or restored on another machine.

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export const BACKUP_APP = 'ogen-tik-ovdim';

export async function exportAll() {
  const workers = await listWorkers();
  const files = [];
  for (const w of workers) {
    const rows = await listFiles(w.id);
    for (const f of rows) {
      const { blob, ...meta } = f;
      files.push({ ...meta, dataUrl: await blobToDataUrl(blob) });
    }
  }
  return {
    app: BACKUP_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    workers,
    files,
  };
}

// Restore a backup, merging by id (an existing worker/file with the same id is
// overwritten). Returns how many records were written.
export async function importAll(data) {
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.workers)) {
    throw new Error('קובץ הגיבוי אינו תקין.');
  }
  for (const w of data.workers) {
    await tx(WORKERS, 'readwrite', (os) => os.put(w));
  }
  for (const f of data.files || []) {
    const { dataUrl, ...meta } = f;
    const blob = await dataUrlToBlob(dataUrl);
    await tx(FILES, 'readwrite', (os) => os.put({ ...meta, blob }));
  }
  return { workers: data.workers.length, files: (data.files || []).length };
}
