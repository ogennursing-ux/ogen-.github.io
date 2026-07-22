import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { buildContractPdf } from './contractPdf.js';
import { buildPlacementCertificate } from './placementCertificate.js';
import { buildFilledContract } from './filledContract.js';
import {
  emptyWorker,
  listWorkers,
  getWorker,
  saveWorker,
  deleteWorker,
  emptyFamily,
  listFamilies,
  getFamily,
  saveFamily,
  deleteFamily,
  listFiles,
  addFile,
  duplicateFile,
  deleteFile,
  fileObjectUrl,
  exportAll,
  importAll,
  listContracts,
  saveContractTemplate,
  updateContract,
  deleteContract,
} from './workerFilesApi.js';
import { uid } from './workerFilesApi.js';
import { mergeDocx, PLACEHOLDER_KEYS } from './contractMerge.js';
import { buildOverlayPdf } from './contractOverlay.js';
import { createSigningRequest, getSigningUrl, setSigningUrl, createPlacementSigning, sendSigningSms } from './signingBridge.js';
import { LANGS as CHAT_LANGS } from './chatI18n.js';
import { listNewSubmissions, countNewSubmissions, setSubmissionStatus, AGENT_ENDPOINT, AGENT_ANON_KEY } from './agentInbox.js';
import { collectRecords, recordsSignature, backupNow, restoreFromCloud, getLastSync } from './cloudBackup.js';
import { publishChatKey, withTimeout } from './intakeChat.js';
import { exportWorkersCsv, exportFamiliesCsv } from './csvExport.js';
import {
  workerToText, familyToText, WORKER_COLS, FAMILY_COLS,
  findWorkerDuplicate, findFamilyDuplicate, whatsappLink, printSummary,
} from './intakeUtils.js';
import dvirLogo from './dvir-logo.png';
import PdfPlacementEditor from './PdfPlacementEditor.jsx';
import {
  extractDocument,
  extractFamilyDocument,
  smartImport,
  hasAI,
  getGeminiKey,
  setGeminiKey,
  getGeminiModel,
  setGeminiModel,
  getGroqKey,
  setGroqKey,
  getGroqTextModel,
  setGroqTextModel,
  getGroqVisionModel,
  setGroqVisionModel,
} from './gemini.js';

// Hebrew labels for the fields Gemini fills, used in the "filled X, Y" summary.
const FIELD_LABELS = {
  nameEn: 'שם באנגלית',
  nameHe: 'שם בעברית',
  firstNameHe: 'שם פרטי (עברית)',
  firstNameEn: 'שם פרטי (אנגלית)',
  lastNameHe: 'שם משפחה (עברית)',
  lastNameEn: 'שם משפחה (אנגלית)',
  spouseName: 'שם בן/בת הזוג',
  languages: 'שפות',
  addrStreet: 'רחוב',
  addrCity: 'עיר',
  addrRegion: 'מחוז/אזור',
  addrPostal: 'מיקוד',
  addrCountry: 'מדינה',
  overseasAgency: 'חברת כ"א בחו"ל',
  passportNo: 'מספר דרכון',
  nationality: 'אזרחות',
  dob: 'תאריך לידה',
  gender: 'מין',
  placeOfBirth: 'מקום לידה',
  fatherName: 'שם האב',
  motherName: 'שם האם',
  maritalStatus: 'מצב משפחתי',
  passportIssueDate: 'תאריך הנפקת דרכון',
  issuePlace: 'מקום הנפקה',
  passportExpiry: 'תוקף דרכון',
  visaExpiry: 'תוקף אשרה',
  permitExpiry: 'תוקף היתר',
};

// Best display name for a worker, falling back to first+last when the full
// name field is empty (new split-name extraction).
const workerName = (w) =>
  w?.nameHe || w?.nameEn ||
  [w?.firstNameHe, w?.lastNameHe].filter(Boolean).join(' ') ||
  [w?.firstNameEn, w?.lastNameEn].filter(Boolean).join(' ') || '';

const familyName = (f) =>
  f?.fullName || [f?.firstName, f?.lastName].filter(Boolean).join(' ') || '';

const AUTH_KEY = 'tik_auth';
const PASS = '12345';
const USERS = ['עוגן סיעוד', COMPANY_NAME];

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const CATEGORIES = [
  { key: 'passport', label: 'דרכון', icon: '🛂' },
  { key: 'visa', label: 'אשרה / ויזה', icon: '📄' },
  { key: 'permit', label: 'היתר העסקה', icon: '📝' },
  { key: 'insurance', label: 'ביטוח', icon: '🩺' },
  { key: 'photo', label: 'תמונה', icon: '🖼️' },
  { key: 'other', label: 'מסמך אחר', icon: '📎' },
];
// Document categories for a family/patient file.
const FAMILY_CATEGORIES = [
  { key: 'id', label: 'תעודת זהות', icon: '🪪' },
  { key: 'bituach', label: 'אישור ביטוח לאומי', icon: '🏛️' },
  { key: 'medical', label: 'מסמך רפואי', icon: '🩺' },
  { key: 'contract', label: 'חוזה', icon: '📃' },
  { key: 'photo', label: 'תמונה', icon: '🖼️' },
  { key: 'other', label: 'מסמך אחר', icon: '📎' },
];
const ALL_CATEGORIES = [...CATEGORIES, ...FAMILY_CATEGORIES];
const catLabel = (k) => ALL_CATEGORIES.find((c) => c.key === k)?.label || 'מסמך';
const catIcon = (k) => ALL_CATEGORIES.find((c) => c.key === k)?.icon || '📎';

// Which document categories a complete file should have.
const WORKER_REQUIRED = ['passport', 'visa', 'permit', 'insurance'];
const FAMILY_REQUIRED = ['id', 'bituach'];

// A row of ✓/✗ chips showing which required scans are present in the file.
function DocChecklist({ files, required }) {
  const have = new Set((files || []).map((f) => f.category));
  const missing = required.filter((k) => !have.has(k)).length;
  return (
    <div className="tik-checklist" role="list">
      <span className={`tik-chk ${missing ? 'miss-sum' : 'ok'}`}>
        {missing ? `חסרים ${missing}` : '✓ תיק שלם'}
      </span>
      {required.map((k) => (
        <span key={k} role="listitem" className={`tik-chk ${have.has(k) ? 'ok' : 'miss'}`}>
          {have.has(k) ? '✓' : '✗'} {catIcon(k)} {catLabel(k)}
        </span>
      ))}
    </div>
  );
}

function fmtSync(iso) {
  if (!iso) return 'עדיין לא גובה';
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

// Compact home dashboard: counts, upcoming renewals, cloud backup status and
// controls, and one-click Excel (CSV) export. Shown at the top of the lists.
function DashboardCard({ onDataChanged }) {
  const [workers, setWorkers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [busy, setBusy] = useState('');
  const [sync, setSync] = useState(getLastSync());
  const [msg, setMsg] = useState('');
  const load = () => { listWorkers().then(setWorkers); listFamilies().then(setFamilies); };
  useEffect(() => { load(); }, []);

  async function doBackup() {
    setBusy('backup'); setMsg('');
    try { const p = await backupNow(); setSync(p.savedAt); setMsg('✓ גובה לענן'); }
    catch (e) { setMsg(e?.message || 'הגיבוי נכשל'); }
    finally { setBusy(''); }
  }
  async function doRestore() {
    if (!confirm('לשחזר את הפרטים מהענן? רשומות קיימות עם אותו מזהה יתעדכנו.')) return;
    setBusy('restore'); setMsg('');
    try {
      const r = await restoreFromCloud();
      setMsg(r.empty ? 'אין עדיין גיבוי בענן' : `שוחזרו ${r.workers} עובדים ו-${r.families} משפחות`);
      load(); setSync(getLastSync()); onDataChanged?.();
    } catch (e) { setMsg(e?.message || 'השחזור נכשל'); }
    finally { setBusy(''); }
  }

  return (
    <div className="card tik-dash">
      <div className="tik-dash-stats">
        <div className="tik-stat"><b>{workers.length}</b><span>עובדים</span></div>
        <div className="tik-stat"><b>{families.length}</b><span>משפחות</span></div>
      </div>
      <div className="tik-dash-actions">
        <button className="btn-ghost small" onClick={doBackup} disabled={busy === 'backup'}>
          {busy === 'backup' ? 'מגבה…' : '☁️ גבה עכשיו'}
        </button>
        <button className="btn-ghost small" onClick={doRestore} disabled={busy === 'restore'}>
          {busy === 'restore' ? 'משחזר…' : '⬇️ שחזר מהענן'}
        </button>
        <button className="btn-ghost small" onClick={() => exportWorkersCsv(workers)} disabled={!workers.length}>📊 ייצוא עובדים</button>
        <button className="btn-ghost small" onClick={() => exportFamiliesCsv(families)} disabled={!families.length}>📊 ייצוא משפחות</button>
        <button className="btn-ghost small" onClick={() => {
          const url = location.origin + location.pathname + '#chat';
          navigator.clipboard?.writeText(url).then(() => setMsg('🔗 קישור הצ׳אט הועתק — שלח לכולם')).catch(() => setMsg(url));
        }}>🔗 קישור צ׳אט ללקוח</button>
      </div>
      <div className="tik-dash-foot muted small">
        ☁️ גיבוי אוטומטי לענן · עדכון אחרון: {fmtSync(sync)}{msg ? ' · ' + msg : ''}
      </div>
    </div>
  );
}

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function ageFrom(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : '';
}

// Anniversary math: contract renewal falls one year after the start date (or,
// if none, after the record was created).
function renewalInfo(worker) {
  const base = worker.startDate ? new Date(worker.startDate).getTime() : worker.createdAt;
  const due = base + YEAR_MS;
  const now = Date.now();
  const days = Math.round((due - now) / (24 * 60 * 60 * 1000));
  return { due, eligible: now >= due, days };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------

function Header({ onLogout, onSettings, right }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">🗂️</span>
        <span className="brand-name">תיק עובד זר</span>
      </div>
      <div className="header-actions">
        {right}
        {onSettings && (
          <button className="header-settings" onClick={onSettings}>⚙ הגדרות</button>
        )}
        {onLogout && (
          <button className="header-settings" onClick={onLogout}>התנתק</button>
        )}
      </div>
    </header>
  );
}

function SettingsModal({ onClose }) {
  const [key, setKey] = useState(getGeminiKey());
  const [model, setModel] = useState(getGeminiModel());
  const [signUrl, setSignUrl] = useState(getSigningUrl());
  const [busy, setBusy] = useState('');
  const importRef = useRef(null);

  function save() {
    setGeminiKey(key.trim());
    setGeminiModel(model.trim());
    setGroqKey(''); // Gemini-only: clear any leftover Groq key so Gemini is always used
    setSigningUrl(signUrl.trim());
    onClose();
  }

  async function doExport() {
    setBusy('export');
    try {
      const data = await exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `tik-backup-${stamp}.json`);
    } catch (e) {
      alert('הייצוא נכשל: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  }

  async function doImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('שחזור גיבוי יוסיף/יעדכן תיקים לפי הקובץ. להמשיך?')) return;
    setBusy('import');
    try {
      const data = JSON.parse(await file.text());
      const res = await importAll(data);
      alert(`שוחזרו ${res.workers} תיקים ו-${res.files} מסמכים. הדף ייטען מחדש.`);
      location.reload();
    } catch (err) {
      alert('השחזור נכשל: ' + (err?.message || err));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>⚙ הגדרות</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>בינה מלאכותית — קריאת מסמכים ופענוח</h3>
        <p className="muted small">
          הזן/י מפתח Gemini כדי שהמערכת תקרא דרכון/ת.ז/היתר ותמלא שדות אוטומטית. המפתח חינמי ב-Google AI Studio (aistudio.google.com/apikey) ונשמר במכשיר בלבד.
        </p>
        <label className="tik-field" style={{ marginTop: 10 }}>
          <span>מפתח Gemini API</span>
          <input
            className="text-input"
            dir="ltr"
            type="password"
            value={key}
            placeholder="AIza…"
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="tik-field" style={{ marginTop: 10 }}>
          <span>דגם (ברירת מחדל: gemini-flash-latest)</span>
          <input
            className="text-input"
            dir="ltr"
            value={model}
            placeholder="gemini-flash-latest"
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <hr className="tik-hr" />
        <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>🤖 צ׳אט חכם ללקוחות</h3>
        <p className="muted small">
          מפרסם את מפתח ה-AI פעם אחת כדי שהצ׳אט (קישור אחד לכולם) יהיה חכם וזמין תמיד. לחץ/י אחרי שהזנת מפתח.
        </p>
        <div className="card-actions" style={{ marginTop: 8 }}>
          <button className="btn-ghost" disabled={busy === 'pub'} onClick={async () => {
            const k = key.trim();
            if (!k) { setBusy('pub'); alert('אין מפתח AI. הזן/י מפתח Gemini ושמור/י קודם.'); setBusy(''); return; }
            setBusy('pub');
            try { await publishChatKey(k); alert('✓ הצ׳אט החכם הופעל! עכשיו הקישור לכולם עובד עם AI.'); }
            catch (e) { alert('הפרסום נכשל: ' + (e?.message || e)); }
            finally { setBusy(''); }
          }}>{busy === 'pub' ? 'מפרסם…' : '🤖 הפעל צ׳אט חכם (פרסם מפתח)'}</button>
        </div>

        <hr className="tik-hr" />
        <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>חתימה דיגיטלית</h3>
        <p className="muted small">
          כתובת מערכת החתימות שאליה נשלחים חוזים לחתימה מרחוק. הזן/י את הכתובת שבה נפתח אתר החתימות שלך.
        </p>
        <label className="tik-field" style={{ marginTop: 10 }}>
          <span>כתובת מערכת החתימות</span>
          <input className="text-input" dir="ltr" value={signUrl} placeholder="https://…" onChange={(e) => setSignUrl(e.target.value)} />
        </label>

        <div className="card-actions" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={save}>שמור</button>
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
        </div>

        <hr className="tik-hr" />
        <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>גיבוי ושחזור</h3>
        <p className="muted small">
          כל הנתונים נשמרים במכשיר הזה בלבד. מומלץ לייצא גיבוי מדי פעם — הקובץ כולל את כל התיקים והסריקות,
          וניתן לשחזר אותו כאן או במחשב אחר.
        </p>
        <div className="card-actions" style={{ marginTop: 10 }}>
          <button className="btn-ghost" onClick={doExport} disabled={busy === 'export'}>
            {busy === 'export' ? 'מייצא…' : '⬇ ייצוא גיבוי'}
          </button>
          <button className="btn-ghost" onClick={() => importRef.current?.click()} disabled={busy === 'import'}>
            {busy === 'import' ? 'משחזר…' : '⬆ שחזור מגיבוי'}
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
        </div>
      </div>
    </div>
  );
}

function Gate({ onEnter }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (USERS.includes(user.trim()) && pass === PASS) {
      try {
        localStorage.setItem(AUTH_KEY, '1');
      } catch {
        /* ignore */
      }
      onEnter();
    } else {
      setError(true);
    }
  };
  return (
    <div className="app">
      <Header />
      <div className="centered-screen">
        <form className="card login-card" onSubmit={submit}>
          <h2>כניסה למערכת תיקי עובדים</h2>
          <p className="muted">מערכת עצמאית לניהול מסמכי עובדים זרים — דרכון, אשרה, היתר ועוד.</p>
          <label className="field-label">שם משתמש</label>
          <input className="text-input" value={user} autoFocus onChange={(e) => setUser(e.target.value)} />
          <label className="field-label" style={{ marginTop: 10 }}>סיסמה</label>
          <input className="text-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p className="login-error">שם משתמש או סיסמה שגויים</p>}
          <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>התחבר</button>
        </form>
      </div>
      <div style={{ padding: '0 16px 16px' }}><BrandFooter /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const LANGS = [
  { key: 'he', label: 'עברית' },
  { key: 'en', label: 'אנגלית' },
  { key: 'es', label: 'ספרדית' },
  { key: 'other', label: 'אחר' },
];
const langLabel = (k) => LANGS.find((l) => l.key === k)?.label || k;

// Manage the reusable .docx contract templates.
function ContractsManager({ onClose }) {
  const [items, setItems] = useState(null);
  const [name, setName] = useState('');
  const [lang, setLang] = useState('he');
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(null); // template being positioned
  const fileRef = useRef(null);

  const reload = () => listContracts().then(setItems);
  useEffect(() => { reload(); }, []);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(docx|pdf)$/i.test(file.name)) {
      alert('יש להעלות קובץ Word ‏(.docx) או PDF.');
      return;
    }
    setBusy(true);
    try {
      const rec = await saveContractTemplate({ name: name.trim() || file.name.replace(/\.(docx|pdf)$/i, ''), lang, file });
      setName('');
      await reload();
      // A fresh PDF has no positions yet — jump straight into placing them.
      if (rec.kind === 'pdf') setPlacing(rec);
    } finally {
      setBusy(false);
    }
  }

  async function savePlacements(placements) {
    await updateContract(placing.id, { placements });
    setPlacing(null);
    reload();
  }

  if (placing) {
    return <PdfPlacementEditor template={placing} onClose={() => setPlacing(null)} onSave={savePlacements} />;
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>📄 תבניות חוזה</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <p className="muted small">
          העלה חוזה כ-<b>PDF</b> (תמקם את השדות על הדף — העיצוב נשמר ב-100%) או כ-<b>Word</b> ‏(.docx) עם סימונים
          כמו <code>{'{{nameHe}}'}</code>. בהפקה הפרטים ימולאו אוטומטית.
        </p>
        <div className="tik-upload" style={{ marginTop: 10 }}>
          <label className="tik-field" style={{ flex: '1 1 160px' }}>
            <span>שם התבנית</span>
            <input className="text-input" value={name} placeholder="למשל: חוזה סיעוד - אנגלית" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="tik-field" style={{ maxWidth: 130 }}>
            <span>שפה</span>
            <select className="text-input" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'מעלה…' : '⬆ העלה PDF / Word'}
          </button>
          <input ref={fileRef} type="file" accept=".docx,.pdf" hidden onChange={onPick} />
        </div>

        {items === null && <p className="muted">טוען…</p>}
        {items && !items.length && <p className="muted" style={{ marginTop: 10 }}>עדיין אין תבניות. העלה חוזה למעלה.</p>}
        {items && items.length > 0 && (
          <ul className="tik-doc-list" style={{ marginTop: 12 }}>
            {items.map((t) => (
              <li key={t.id} className="tik-doc">
                <div className="tik-doc-main">
                  <span className="tik-doc-icon">{t.kind === 'pdf' ? '📕' : '📄'}</span>
                  <div>
                    <div className="tik-doc-name">{t.name}</div>
                    <div className="tik-doc-meta">
                      {langLabel(t.lang)} · {t.kind === 'pdf' ? 'PDF' : 'Word'}
                      {t.kind === 'pdf' && ` · ${(t.placements || []).length} שדות ממוקמים`}
                    </div>
                  </div>
                </div>
                <div className="tik-doc-actions">
                  {t.kind === 'pdf' && (
                    <button className="btn-ghost sm" title="מיקום שדות על הדף" onClick={() => setPlacing(t)}>
                      🎯 מיקומים
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    title="מחיקה"
                    onClick={async () => { if (confirm('למחוק את התבנית?')) { await deleteContract(t.id); reload(); } }}
                  >🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <hr className="tik-hr" />
        <details className="tik-ph">
          <summary>רשימת הסימונים הזמינים ({'{{...}}'})</summary>
          <div className="tik-ph-grid">
            {PLACEHOLDER_KEYS.map((k) => (
              <code key={k}>{`{{${k}}}`} — {FIELD_LABELS[k] || k}</code>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

// Choose which contract to produce. A contract merges both sides of the same
// placement: the worker and the linked family/patient.
function ContractPicker({ worker, family, onClose, onBuiltin, onSigned }) {
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  useEffect(() => { listContracts().then(setItems); }, []);

  const records = { worker, family };
  const who = worker?.nameHe || worker?.nameEn || family?.fullName || 'תיק';

  async function gen(t) {
    setBusyId(t.id);
    try {
      if (t.kind === 'pdf') {
        if (!(t.placements || []).length) {
          alert('לתבנית ה-PDF עדיין לא הוגדרו מיקומי שדות. פתח «🎯 מיקומים» ב«חוזים» ומקם את השדות.');
          return;
        }
        const buf = await t.blob.arrayBuffer();
        const bytes = await buildOverlayPdf(new Uint8Array(buf.slice(0)), t.placements, records, { companyName: COMPANY_NAME });
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `חוזה - ${t.name} - ${who}.pdf`);
      } else {
        const blob = await mergeDocx(t.blob, records, { companyName: COMPANY_NAME });
        downloadBlob(blob, `חוזה - ${t.name} - ${who}.docx`);
      }
      onClose();
    } catch (e) {
      alert('הפקת החוזה נכשלה: ' + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  // Fill the contract, then open a remote signing request in the signature app.
  async function sendToSign(t) {
    if (t.kind !== 'pdf') {
      alert('שליחה לחתימה דיגיטלית נתמכת בחוזי PDF (שם אפשר למקם את מקום החתימה).');
      return;
    }
    const sigs = (t.placements || []).filter((p) => p.fieldKey === 'signature');
    if (!sigs.length) {
      alert('קודם סמן מקום חתימה על החוזה: פתח «🎯 מיקומים», בחר את השדה «חתימה ✍️» ולחץ במקום שבו חותמים.');
      return;
    }
    setBusyId(t.id + ':sign');
    try {
      const buf = await t.blob.arrayBuffer();
      const bytes = await buildOverlayPdf(new Uint8Array(buf.slice(0)), t.placements, records, { companyName: COMPANY_NAME });
      const fields = sigs.map((p) => ({
        id: uid(), type: 'signature', pageIndex: p.pageIndex, signer: 0,
        xPct: p.xPct, yPct: p.yPct, wPct: p.wPct, hPct: p.hPct, value: '',
      }));
      const { link } = await createSigningRequest({
        pdfBytes: bytes,
        title: `חוזה - ${t.name} - ${who}`,
        fields,
        signerName: who,
      });
      onClose();
      onSigned(link);
    } catch (e) {
      alert('שליחה לחתימה נכשלה: ' + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>📄 בחר חוזה להפקה</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <ul className="tik-doc-list">
          {items && items.map((t) => (
            <li key={t.id} className="tik-doc">
              <div className="tik-doc-main">
                <span className="tik-doc-icon">{t.kind === 'pdf' ? '📕' : '📄'}</span>
                <div>
                  <div className="tik-doc-name">{t.name}</div>
                  <div className="tik-doc-meta">{langLabel(t.lang)} · {t.kind === 'pdf' ? 'PDF' : 'Word'}</div>
                </div>
              </div>
              <div className="tik-doc-actions">
                {t.kind === 'pdf' && (
                  <button className="btn-ghost sm" disabled={busyId === t.id + ':sign'} onClick={() => sendToSign(t)}>
                    {busyId === t.id + ':sign' ? 'שולח…' : '✍️ לחתימה'}
                  </button>
                )}
                <button className="btn-primary sm" disabled={busyId === t.id} onClick={() => gen(t)}>
                  {busyId === t.id ? 'מפיק…' : 'הפק'}
                </button>
              </div>
            </li>
          ))}
          <li className="tik-doc">
            <div className="tik-doc-main">
              <span className="tik-doc-icon">🧾</span>
              <div>
                <div className="tik-doc-name">חוזה ברירת מחדל (עברית)</div>
                <div className="tik-doc-meta">נוצר אוטומטית · PDF</div>
              </div>
            </div>
            <div className="tik-doc-actions">
              <button className="btn-ghost sm" onClick={() => { onClose(); onBuiltin(); }}>הפק</button>
            </div>
          </li>
        </ul>
        {items && !items.length && (
          <p className="muted small" style={{ marginTop: 10 }}>
            כדי להשתמש בחוזים שלך, הוסף תבניות Word דרך «📄 חוזים» במסך הראשי.
          </p>
        )}
      </div>
    </div>
  );
}

// Turn an agent submission's flexible data into a worker/family record,
// mapping matching field keys and preserving anything else in the notes.
function recordFromSubmission(data, type) {
  const rec = type === 'family' ? emptyFamily() : emptyWorker();
  const known = new Set(Object.keys(rec));
  for (const k of known) if (data[k] != null && data[k] !== '') rec[k] = data[k];
  const extra = Object.entries(data || {}).filter(([k, v]) => !known.has(k) && v != null && v !== '');
  if (extra.length) rec.notes = [rec.notes, ...extra.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  return rec;
}

// Submissions sent in by the external agent (Base44), for review + import.
function AgentInbox({ onClose, onImported }) {
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  const [showConn, setShowConn] = useState(false);
  const [chatView, setChatView] = useState(null); // transcript being read
  const [signLink, setSignLink] = useState(null); // signing link to copy

  const reload = () => listNewSubmissions().then((r) => { setItems(r); setErr(''); }).catch((e) => { setItems([]); setErr(e?.message || String(e)); });
  useEffect(() => { reload(); }, []);

  const subIds = (sub) => (sub.ids && sub.ids.length ? sub.ids : [sub.id]);
  async function importOne(sub, type) {
    setBusyId(sub.id);
    try {
      if (sub.data?.chat) {
        // One unified file from the chat: a worker (if there are worker details)
        // linked to the family. Split halves already merged by passport number.
        const fields = { ...(sub.data.fields || {}) };
        const workerRec = recordFromSubmission(fields, 'worker');
        const hasWorker = workerRec.passportNo || workerRec.nameEn || workerRec.nameHe || workerRec.firstNameEn;
        let workerId = null;
        if (hasWorker) { const w = await saveWorker(workerRec); workerId = w.id; }
        const famRec = recordFromSubmission({ ...fields, fullName: fields.fullName || fields.employerName }, 'family');
        if (workerId) famRec.caregiverWorkerId = workerId;
        await saveFamily(famRec);
      } else {
        const rec = recordFromSubmission(sub.data || {}, type);
        if (type === 'family') await saveFamily(rec); else await saveWorker(rec);
      }
      for (const id of subIds(sub)) await setSubmissionStatus(id, 'imported');
      await reload();
      onImported && onImported();
    } catch (e) { alert('הייבוא נכשל: ' + (e?.message || e)); }
    finally { setBusyId(null); }
  }
  async function dismiss(sub) {
    setBusyId(sub.id);
    try { for (const id of subIds(sub)) await setSubmissionStatus(id, 'dismissed'); await reload(); }
    catch (e) { alert(e?.message || String(e)); }
    finally { setBusyId(null); }
  }
  // Build the full contract from a (merged) chat submission and open a 2-signer
  // signing request, then SMS the link to the employer and the caregiver.
  async function sendToSigning(sub) {
    setBusyId(sub.id);
    try {
      const fields = { ...(sub.data?.fields || {}) };
      const worker = recordFromSubmission(fields, 'worker');
      const family = recordFromSubmission({ ...fields, fullName: fields.fullName || fields.employerName }, 'family');
      const bytes = await buildFilledContract(family, worker, {});
      const { link } = await createPlacementSigning({
        pdfBytes: bytes,
        employerName: family.fullName,
        workerName: worker.nameEn || worker.nameHe || [worker.firstNameEn, worker.lastNameEn].filter(Boolean).join(' '),
      });
      setSignLink({ link, name: family.fullName || 'החוזה' });
    } catch (e) { alert('יצירת קישור החתימה נכשלה: ' + (e?.message || e)); }
    finally { setBusyId(null); }
  }
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
  const summary = (d) => {
    if (d?.chat) return '💬 ' + ((d.fields?.employerName) || 'שיחת צ׳אט') + ((d.files?.length) ? ` · ${d.files.length} קבצים` : '');
    return [d.nameHe, d.fullName, d.nameEn, d.passportNo && 'דרכון ' + d.passportNo, d.idNumber && 'ת.ז ' + d.idNumber].filter(Boolean).join(' · ') || 'הגשה';
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>📥 הגשות מהסוכן</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>

        <p className="muted small">הודעות מהסוכן (טלגרם/Base44) מגיעות לכאן דרך השרת. שלח/י לבוט הודעה או תמונה — והיא תופיע כאן לייבוא.</p>

        <button className="btn-ghost sm" onClick={() => setShowConn((v) => !v)}>
          {showConn ? 'הסתר' : '⚙ פרטי החיבור לסוכן (Base44 / API)'}
        </button>
        {showConn && (
          <div className="tik-conn">
            <p className="muted small">הגדר/י ב-Base44 קריאת HTTP מסוג POST לכתובת הבאה, עם הכותרות והגוף:</p>
            <label className="field-label">כתובת (POST)</label>
            <div className="tik-conn-row"><code>{AGENT_ENDPOINT}</code><button className="btn-ghost sm" onClick={() => copy(AGENT_ENDPOINT)}>העתק</button></div>
            <label className="field-label">כותרות</label>
            <div className="tik-conn-row"><code>apikey / Authorization: Bearer</code><button className="btn-ghost sm" onClick={() => copy(AGENT_ANON_KEY)}>העתק מפתח</button></div>
            <label className="field-label">גוף (JSON)</label>
            <code className="tik-conn-body">{'{ "kind": "worker", "data": { "nameHe": "...", "passportNo": "..." } }'}</code>
          </div>
        )}

        <hr className="tik-hr" />
        {err && <p className="login-error">{err} — ודא/י שהרצת את טבלת agent_submissions ב-Supabase.</p>}
        {items === null && !err && <p className="muted">טוען…</p>}
        {items && !items.length && !err && <p className="muted">אין הגשות חדשות.</p>}
        {items && items.length > 0 && (
          <ul className="tik-doc-list">
            {items.map((s) => (
              <li key={s.id} className="tik-sub">
                <div className="tik-sub-main">
                  <div className="tik-doc-name">
                    {summary(s.data?.fields || s.data || {})}
                    {s.data?.merged && <span className="badge ok" style={{ marginInlineStart: 6 }}>🔗 מעסיק+מטפל</span>}
                    {!s.data?.merged && s.data?.meta?.role === 'employer' && <span className="badge muted" style={{ marginInlineStart: 6 }}>מעסיק · ממתין למטפל</span>}
                    {!s.data?.merged && s.data?.meta?.role === 'worker' && <span className="badge muted" style={{ marginInlineStart: 6 }}>מטפל · ממתין למעסיק</span>}
                    {s.data?.needsCallback && <span className="badge wait" style={{ marginInlineStart: 6 }}>📞 רוצה שיחה</span>}
                  </div>
                  <div className="tik-doc-meta">
                    {s.data?.chat ? 'צ׳אט' : s.kind === 'family' ? 'משפחה' : 'עובד'} · {fmt(s.created_at)}
                    {s.data?.fields?.contactPhone && ' · ' + s.data.fields.contactPhone}
                  </div>
                </div>
                <div className="tik-sub-actions">
                  {s.data?.chat && (
                    <button className="btn-ghost sm" onClick={() => setChatView(s)}>💬 צפה בשיחה</button>
                  )}
                  {s.data?.chat && (
                    <button className="btn-ghost sm" disabled={busyId === s.id} onClick={() => sendToSigning(s)} title="יוצר חוזה מלא ושולח לחתימה למעסיק ולעובד/ת">✍️ שלח לחתימה</button>
                  )}
                  <button className="btn-primary sm" disabled={busyId === s.id} onClick={() => importOne(s, s.data?.chat ? 'family' : 'worker')}>{s.data?.chat ? 'ייבא כמשפחה' : 'ייבא כעובד'}</button>
                  {!s.data?.chat && <button className="btn-ghost sm" disabled={busyId === s.id} onClick={() => importOne(s, 'family')}>ייבא כמשפחה</button>}
                  <button className="icon-btn" title="התעלם" disabled={busyId === s.id} onClick={() => dismiss(s)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {chatView && <ChatTranscript sub={chatView} onClose={() => setChatView(null)} />}
        {signLink && (
          <div className="modal-backdrop" onPointerDown={() => setSignLink(null)}>
            <div className="modal tik-modal" onPointerDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
              <div className="modal-head">
                <strong>✍️ קישור לחתימה — {signLink.name}</strong>
                <button className="icon-btn" onClick={() => setSignLink(null)}>✕</button>
              </div>
              <p className="muted small" style={{ marginTop: 0 }}>
                העתק/י את הקישור ושלח/י למעסיק ולעובד/ת (וואטסאפ / מייל / איך שנוח). <strong>המעסיק חותם ראשון, אחר כך המטפל/ת</strong> — על אותו חוזה מלא.
              </p>
              <div className="tik-input-row" style={{ marginTop: 8 }}>
                <input className="text-input" dir="ltr" readOnly value={signLink.link} onFocus={(e) => e.target.select()} />
                <button className="btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(signLink.link); alert('הקישור הועתק ✓'); } catch { alert('בחר/י את הקישור והעתק/י ידנית'); } }}>📋 העתק</button>
              </div>
              <div className="card-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <a className="btn-ghost" href={signLink.link} target="_blank" rel="noreferrer">🔗 פתח את קישור החתימה</a>
                <a className="btn-ghost" href={`https://wa.me/?text=${encodeURIComponent('קישור לחתימה על החוזה: ' + signLink.link)}`} target="_blank" rel="noreferrer">💬 שלח בוואטסאפ</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Download every uploaded chat file in one click — each as its own file.
async function downloadAllFiles(files) {
  const list = files || [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const ext = (String(f.dataUrl || '').match(/^data:image\/([\w+]+)/)?.[1] || 'jpg').replace('jpeg', 'jpg');
    const a = document.createElement('a');
    a.href = f.dataUrl;
    a.download = `${String(i + 1).padStart(2, '0')}-${catLabel(f.category)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 400)); // let the browser start each download
  }
}

// Read-only view of a saved customer conversation + its uploaded files.
function ChatTranscript({ sub, onClose }) {
  const d = sub.data || {};
  const tr = d.transcript || [];
  const langObj = d.meta?.lang && CHAT_LANGS.find((l) => l.code === d.meta.lang);
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal tik-modal" onPointerDown={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <strong>💬 השיחה המלאה{d.fields?.employerName ? ' — ' + d.fields.employerName : ''}</strong>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {d.meta && (d.meta.ip || d.meta.startedAt) && (
          <p className="muted small" style={{ margin: '0 0 8px' }} dir="ltr">
            {d.meta.ip ? 'IP: ' + d.meta.ip : ''}
            {d.meta.startedAt ? ' · ' + new Date(d.meta.startedAt).toLocaleString('he-IL') : ''}
            {d.fields?.contactPhone ? ' · ☎ ' + d.fields.contactPhone : ''}
          </p>
        )}
        {d.meta?.consent?.at && (
          <p className="tik-chk ok small" style={{ display: 'block', margin: '0 0 8px', padding: '6px 10px', borderRadius: 8 }}>
            ✅ הסכים/ה לתנאי הפרטיות ולחתימה אלקטרונית ({new Date(d.meta.consent.at).toLocaleString('he-IL')})
          </p>
        )}
        {langObj && langObj.code !== 'he' && (
          <p className="small" style={{ display: 'block', margin: '0 0 8px', padding: '6px 10px', borderRadius: 8, background: '#e0f2fe', color: '#0369a1' }}>
            🌐 שפת השיחה: {langObj.flag} {langObj.label} — התמלול למטה הוא המקור המלא של המטפל/ת, ללא תרגום (לתיעוד משפטי).
          </p>
        )}
        <div className="chat-body" style={{ maxHeight: '52vh', borderRadius: 12 }}>
          {tr.map((m, i) => (
            <div key={i} className={`chat-row ${m.from}`}>
              <div className="chat-bubble">{m.text}</div>
            </div>
          ))}
          {!tr.length && <p className="muted">אין תמלול.</p>}
        </div>
        {d.files?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong className="small">קבצים שהתקבלו ({d.files.length}):</strong>
              <button className="btn-ghost small" onClick={() => downloadAllFiles(d.files)}>⬇️ הורד הכול</button>
            </div>
            <div className="tik-thumbs">
              {d.files.map((f, i) => (
                <a key={i} href={f.dataUrl} download={f.name || 'doc'} className="tik-thumb" title={catLabel(f.category)}>
                  <img src={f.dataUrl} alt="" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerList({ mode, onMode, onOpen, onNew, onLogout, onOpenWorker, onOpenFamily }) {
  const [workers, setWorkers] = useState(null);
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showSmart, setShowSmart] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  useEffect(() => { countNewSubmissions().then(setInboxCount).catch(() => {}); }, [showInbox]);

  const reload = () => listWorkers().then(setWorkers);
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    if (!workers) return [];
    const s = q.trim().toLowerCase();
    if (!s) return workers;
    return workers.filter((w) =>
      [w.nameHe, w.nameEn, w.firstNameHe, w.lastNameHe, w.firstNameEn, w.lastNameEn, w.passportNo, w.nationality, w.patientName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [workers, q]);

  return (
    <div className="app">
      <Header
        onLogout={onLogout}
        onSettings={() => setShowSettings(true)}
        right={<a className="header-settings" href="index.html">אזור החתימות</a>}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showContracts && <ContractsManager onClose={() => setShowContracts(false)} />}
      {showInbox && <AgentInbox onClose={() => setShowInbox(false)} onImported={() => listWorkers().then(setWorkers)} />}
      {showSmart && (
        <SmartImportModal
          onClose={() => setShowSmart(false)}
          onOpenWorker={onOpenWorker}
          onOpenFamily={onOpenFamily}
          onReload={reload}
        />
      )}
      <div className="tik-list">
        <ModeTabs mode={mode} onMode={onMode} />
        <DashboardCard onDataChanged={reload} />
        <div className="tik-list-head">
          <h2 style={{ margin: 0 }}>תיקי עובדים</h2>
          <div className="tik-head-actions">
            <button className="btn-ghost" onClick={() => setShowSmart(true)}>🤖 ייבוא חכם</button>
            <button className="btn-ghost" onClick={() => setShowInbox(true)}>
              📥 הגשות{inboxCount ? ` (${inboxCount})` : ''}
            </button>
            <button className="btn-ghost" onClick={() => setShowContracts(true)}>📄 חוזים</button>
            <button className="btn-primary" onClick={onNew}>➕ עובד חדש</button>
          </div>
        </div>
        <input
          className="text-input"
          placeholder="חיפוש לפי שם, דרכון, אזרחות או מטופל…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ margin: '12px 0' }}
        />
        {workers === null && <p className="muted">טוען…</p>}
        {workers && !workers.length && (
          <div className="card tik-empty">
            <p className="muted">עדיין אין תיקים. לחץ על «עובד חדש» כדי לפתוח תיק ולהעלות דרכון, אשרה ועוד.</p>
          </div>
        )}
        {filtered.length > 0 && (
          <ul className="req-list">
            {filtered.map((w) => {
              const r = renewalInfo(w);
              return (
                <li key={w.id} className="req-item" onClick={() => onOpen(w.id)}>
                  <div className="req-main">
                    <span className="req-title">{workerName(w) || 'ללא שם'}</span>
                    <span className="req-sub">
                      {[w.passportNo && 'דרכון ' + w.passportNo, w.nationality, w.patientName && 'מטופל: ' + w.patientName]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </span>
                  </div>
                  <div className="req-side">
                    {r.eligible ? (
                      <span className="badge ok">חוזה לחידוש</span>
                    ) : (
                      <span className="badge muted">חוזה בעוד {r.days} ימים</span>
                    )}
                    <span className="tik-chevron">‹</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <BrandFooter />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Small copy-to-clipboard button placed beside every field, so each value can
// be pasted into the Tik-Tak system with one click.
// Small "powered by" credit shown on the side at the bottom of the main lists.
function BrandFooter() {
  return (
    <div className="tik-credit">
      <span>מופעל על ידי</span>
      <img src={dvirLogo} alt="דביר מערכות" />
    </div>
  );
}

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="tik-copy"
      title="העתקה לתיק-תק"
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value == null ? '' : String(value));
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {ok ? '✓' : '⧉'}
    </button>
  );
}

const F = ({ label, value, onChange, type = 'text', dir, ph }) => (
  <label className="tik-field">
    <span>{label}</span>
    <div className="tik-input-row">
      <input
        className="text-input"
        type={type}
        dir={dir}
        value={value || ''}
        placeholder={ph}
        onChange={(e) => onChange(e.target.value)}
      />
      <CopyBtn value={value} />
    </div>
  </label>
);

function Lightbox({ file, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = fileObjectUrl(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const isImage = file.mime?.startsWith('image/');
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="tik-lightbox" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>{catIcon(file.category)} {file.name}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        {url && isImage && <img className="tik-lightbox-img" src={url} alt={file.name} />}
        {url && !isImage && (
          <iframe className="tik-lightbox-frame" src={url} title={file.name} />
        )}
      </div>
    </div>
  );
}

function DocRow({ file, onView, onChanged, onExtract, extracting, extractCats }) {
  const [copied, setCopied] = useState(false);
  const isImage = file.mime?.startsWith('image/');
  const canExtract = isImage && !!onExtract && (extractCats || ['passport', 'visa', 'permit']).includes(file.category);

  async function copy() {
    // Copy the scan for review elsewhere: images go to the clipboard when the
    // browser allows it; otherwise (and for PDFs) we store a duplicate copy in
    // the cabinet so the original is never touched.
    try {
      if (file.mime?.startsWith('image/') && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ [file.mime]: file.blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    } catch {
      /* fall through to duplicate */
    }
    await duplicateFile(file.id);
    onChanged();
  }

  return (
    <li className="tik-doc">
      <div className="tik-doc-main">
        <span className="tik-doc-icon">{catIcon(file.category)}</span>
        <div>
          <div className="tik-doc-name">{file.name}</div>
          <div className="tik-doc-meta">{catLabel(file.category)} · {fmtSize(file.size)} · {fmt(new Date(file.addedAt).toISOString())}</div>
        </div>
      </div>
      <div className="tik-doc-actions">
        {canExtract && (
          <button
            className="btn-ghost sm tik-extract-btn"
            title="קריאה אוטומטית ומילוי השדות"
            disabled={extracting}
            onClick={() => onExtract(file)}
          >
            {extracting ? '⏳ קורא…' : '✨ קרא ומלא'}
          </button>
        )}
        <button className="icon-btn" title="עיון" onClick={() => onView(file)}>👁</button>
        <button className="icon-btn" title="העתקה" onClick={copy}>{copied ? '✓' : '⧉'}</button>
        <button className="icon-btn" title="הורדה" onClick={() => downloadBlob(file.blob, file.name)}>⬇</button>
        <button
          className="icon-btn"
          title="מחיקה"
          onClick={async () => {
            if (confirm('למחוק את המסמך?')) {
              await deleteFile(file.id);
              onChanged();
            }
          }}
        >🗑</button>
      </div>
    </li>
  );
}

function WorkerEditor({ workerId, onBack, onDeleted, onOpenFamily }) {
  const [worker, setWorker] = useState(null);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [uploadCat, setUploadCat] = useState('passport');
  const [busyUpload, setBusyUpload] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [makingContract, setMakingContract] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showContractPicker, setShowContractPicker] = useState(false);
  const [linkedFamily, setLinkedFamily] = useState(null);
  const [signLink, setSignLink] = useState(null);
  const [flash, setFlash] = useState('');
  const fileInput = useRef(null);
  const camInput = useRef(null);

  const isNew = workerId == null;

  useEffect(() => {
    if (isNew) {
      setWorker(emptyWorker());
      setFiles([]);
    } else {
      getWorker(workerId).then((w) => setWorker(w || emptyWorker()));
      listFiles(workerId).then(setFiles);
    }
  }, [workerId, isNew]);

  // Load the family this worker is placed with (if any), for the placement card.
  useEffect(() => {
    if (!worker?.id) return;
    listFamilies().then((fams) => setLinkedFamily(fams.find((f) => f.caregiverWorkerId === worker.id) || null));
  }, [worker?.id]);

  if (!worker) {
    return (
      <div className="app">
        <Header onLogout={null} />
        <p className="muted" style={{ padding: 24 }}>טוען…</p>
      </div>
    );
  }

  const set = (patch) => setWorker((w) => ({ ...w, ...patch }));
  const reloadFiles = () => listFiles(worker.id).then(setFiles);

  async function persist() {
    setSaving(true);
    try {
      const saved = await saveWorker(worker);
      setWorker(saved);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1600);
      return saved;
    } finally {
      setSaving(false);
    }
  }

  // Manual save — warns first if another file already uses this passport.
  async function saveManual() {
    if (worker.passportNo) {
      const dup = await findWorkerDuplicate(worker.passportNo, worker.id);
      if (dup && !confirm(`כבר קיים תיק עם דרכון ${worker.passportNo} (${dup.nameHe || dup.nameEn || 'ללא שם'}). לשמור בכל זאת?`)) return;
    }
    await persist();
  }

  const flashMsg = (m) => { setFlash(m); setTimeout(() => setFlash(''), 3000); };
  async function copyAll() {
    try { await navigator.clipboard.writeText(workerToText(worker)); flashMsg('📋 כל הפרטים הועתקו — אפשר להדביק בטיק-טק'); }
    catch { flashMsg('ההעתקה נחסמה בדפדפן'); }
  }
  function shareWhatsapp() {
    window.open(whatsappLink(worker.phone, workerToText(worker)), '_blank');
  }
  function printPage() {
    printSummary('תיק עובד — ' + workerName(worker), worker, WORKER_COLS);
  }

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setBusyUpload(true);
    try {
      // A brand-new worker must exist before scans can reference its id.
      const saved = await persist();
      for (const f of picked) await addFile(saved.id, { category: uploadCat, file: f });
      await listFiles(saved.id).then(setFiles);

      // Auto-read the first passport/visa/permit image right away (if a key is
      // set), filling only empty fields so nothing typed is overwritten.
      const img = picked.find((f) => f.type?.startsWith('image/'));
      if (img && ['passport', 'visa', 'permit'].includes(uploadCat) && hasAI()) {
        setFlash('✨ קורא את המסמך…');
        try {
          const { patch } = await extractDocument(img, uploadCat);
          const apply = Object.fromEntries(Object.entries(patch).filter(([k]) => !worker[k]));
          const applied = Object.keys(apply);
          if (applied.length) {
            const merged = { ...saved, ...apply };
            setWorker(merged);
            await saveWorker(merged);
            setFlash('✨ מולאו אוטומטית: ' + applied.map((k) => FIELD_LABELS[k] || k).join(', '));
          } else {
            setFlash('✨ הקריאה הסתיימה — לא נמצאו שדות ריקים למילוי.');
          }
        } catch (err) {
          setFlash('הקריאה האוטומטית נכשלה: ' + (err?.message || err));
        }
        setTimeout(() => setFlash(''), 7000);
      }
    } finally {
      setBusyUpload(false);
    }
  }

  async function extractFrom(file) {
    if (!hasAI()) {
      alert('כדי לקרוא מסמכים אוטומטית צריך מפתח Gemini. פותח את ההגדרות…');
      setShowSettings(true);
      return;
    }
    setExtractingId(file.id);
    try {
      const { patch } = await extractDocument(file.blob, file.category);
      const keys = Object.keys(patch);
      if (!keys.length) {
        alert('לא זוהו פרטים בתמונה. נסה/י תמונה ברורה וחדה יותר.');
        return;
      }
      // Fill empty fields freely; ask before overwriting fields already filled.
      const conflicts = keys.filter((k) => worker[k] && worker[k] !== patch[k]);
      let apply = patch;
      if (conflicts.length) {
        const overwrite = confirm(
          `זוהו ${keys.length} שדות. ${conflicts.length} מהם כבר מלאים (${conflicts
            .map((k) => FIELD_LABELS[k] || k)
            .join(', ')}).\nאישור = לעדכן גם אותם · ביטול = למלא רק שדות ריקים.`,
        );
        if (!overwrite) apply = Object.fromEntries(Object.entries(patch).filter(([k]) => !worker[k]));
      }
      const applied = Object.keys(apply);
      if (!applied.length) {
        alert('כל השדות שזוהו כבר מלאים — לא בוצע שינוי.');
        return;
      }
      set(apply);
      alert('מולאו הפרטים: ' + applied.map((k) => FIELD_LABELS[k] || k).join(', ') + '.\nבדוק/י ולחץ/י «שמור תיק».');
    } catch (err) {
      console.error(err);
      alert(err?.message || String(err));
    } finally {
      setExtractingId(null);
    }
  }

  // Open the picker (your Word templates + a built-in default), saving first so
  // the picker merges the latest field values. Also resolve the linked family so
  // the contract can include the patient's side of the placement.
  async function openContractPicker() {
    const saved = await persist();
    try {
      const fams = await listFamilies();
      setLinkedFamily(fams.find((f) => f.caregiverWorkerId === saved.id) || null);
    } catch {
      setLinkedFamily(null);
    }
    setShowContractPicker(true);
  }

  async function makeBuiltinContract() {
    setMakingContract(true);
    try {
      await persist();
      const bytes = await buildContractPdf(worker, { companyName: COMPANY_NAME });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const name = `חוזה - ${worker.nameHe || worker.nameEn || 'עובד'}.pdf`;
      downloadBlob(blob, name);
    } catch (err) {
      console.error(err);
      alert('הפקת החוזה נכשלה: ' + (err?.message || err));
    } finally {
      setMakingContract(false);
    }
  }

  async function remove() {
    if (isNew) return onBack();
    if (!confirm('למחוק את התיק ואת כל המסמכים שבו? פעולה זו אינה הפיכה.')) return;
    await deleteWorker(worker.id);
    onDeleted();
  }

  const r = renewalInfo(worker);

  return (
    <div className="app">
      <Header
        onLogout={null}
        onSettings={() => setShowSettings(true)}
        right={<button className="header-settings" onClick={onBack}>‹ חזרה לרשימה</button>}
      />
      <div className="tik-editor">
        {/* quick actions: copy everything to Tik-Tak, share, print */}
        <div className="tik-actionsbar">
          <button className="btn-ghost small" onClick={copyAll}>📋 העתק הכול לטיק-טק</button>
          <button className="btn-ghost small" onClick={shareWhatsapp}>💬 וואטסאפ</button>
          <button className="btn-ghost small" onClick={printPage}>🖨️ דף סיכום</button>
        </div>

        {/* linked placement (worker ↔ family) */}
        {linkedFamily && (
          <div className="card tik-placement">
            <div className="tik-placement-head">
              <strong>👥 השמה מקושרת — מטופל/משפחה</strong>
              <button className="btn-ghost small" onClick={() => onOpenFamily?.(linkedFamily.id)}>פתח תיק משפחה ›</button>
            </div>
            <div className="tik-placement-body muted small">
              {[familyName(linkedFamily), linkedFamily.idNumber && 'ת.ז ' + linkedFamily.idNumber,
                linkedFamily.city, linkedFamily.phone || linkedFamily.mobile,
                linkedFamily.contactName && 'איש קשר: ' + linkedFamily.contactName]
                .filter(Boolean).join('  ·  ')}
            </div>
            <button className="btn-primary small" onClick={openContractPicker} disabled={makingContract} style={{ marginTop: 8 }}>
              {makingContract ? 'מפיק…' : '📄 הפק חוזה משותף (עובד + משפחה)'}
            </button>
          </div>
        )}

        {/* renewal banner */}
        <div className={`tik-renewal ${r.eligible ? 'due' : ''}`}>
          <div>
            <strong>{r.eligible ? '⏰ הגיע מועד חידוש החוזה' : '📅 חידוש חוזה שנתי'}</strong>
            <div className="muted small">
              {r.eligible
                ? 'עברה שנה מתחילת ההעסקה — ניתן להפיק את חוזה החידוש על בסיס פרטי התיק.'
                : `החוזה יהיה זמין לחידוש בעוד ${r.days} ימים (${fmt(new Date(r.due).toISOString())}). אפשר להפיק חוזה גם עכשיו.`}
            </div>
          </div>
          <button className="btn-primary" onClick={openContractPicker} disabled={makingContract}>
            {makingContract ? 'מפיק…' : '📄 הפק חוזה'}
          </button>
        </div>

        {/* personal */}
        <section className="card tik-section">
          <h3>פרטים אישיים</h3>
          <div className="tik-grid">
            <F label="שם פרטי (עברית)" value={worker.firstNameHe} onChange={(v) => set({ firstNameHe: v })} />
            <F label="שם פרטי (אנגלית)" value={worker.firstNameEn} onChange={(v) => set({ firstNameEn: v })} dir="ltr" />
            <F label="שם משפחה (עברית)" value={worker.lastNameHe} onChange={(v) => set({ lastNameHe: v })} />
            <F label="שם משפחה (אנגלית)" value={worker.lastNameEn} onChange={(v) => set({ lastNameEn: v })} dir="ltr" />
            <F label="שם מלא (עברית)" value={worker.nameHe} onChange={(v) => set({ nameHe: v })} />
            <F label="שם מלא (אנגלית)" value={worker.nameEn} onChange={(v) => set({ nameEn: v })} dir="ltr" />
            <F label="מספר דרכון" value={worker.passportNo} onChange={(v) => set({ passportNo: v })} dir="ltr" />
            <F label="אזרחות" value={worker.nationality} onChange={(v) => set({ nationality: v })} />
            <F label="תאריך לידה" type="date" value={worker.dob} onChange={(v) => set({ dob: v })} dir="ltr" />
            <label className="tik-field">
              <span>מין</span>
              <div className="tik-input-row">
                <select className="text-input" value={worker.gender || ''} onChange={(e) => set({ gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="ז">זכר</option>
                  <option value="נ">נקבה</option>
                </select>
                <CopyBtn value={worker.gender === 'ז' ? 'זכר' : worker.gender === 'נ' ? 'נקבה' : ''} />
              </div>
            </label>
            <F label="מקום לידה" value={worker.placeOfBirth} onChange={(v) => set({ placeOfBirth: v })} />
            <F label="שם האב" value={worker.fatherName} onChange={(v) => set({ fatherName: v })} />
            <F label="שם האם" value={worker.motherName} onChange={(v) => set({ motherName: v })} />
            <F label="מצב משפחתי" value={worker.maritalStatus} onChange={(v) => set({ maritalStatus: v })} />
            <F label="שם בן/בת הזוג" value={worker.spouseName} onChange={(v) => set({ spouseName: v })} />
            <F label="שפות" value={worker.languages} onChange={(v) => set({ languages: v })} />
            <F label="טלפון נייד" value={worker.phone} onChange={(v) => set({ phone: v })} dir="ltr" />
            <F label="אימייל" value={worker.email} onChange={(v) => set({ email: v })} dir="ltr" />
            <F label='שם חברת כ"א בחו"ל' value={worker.overseasAgency} onChange={(v) => set({ overseasAgency: v })} />
          </div>
        </section>

        {/* residential address */}
        <section className="card tik-section">
          <h3>כתובת מגורים</h3>
          <div className="tik-grid">
            <F label="רחוב (Street)" value={worker.addrStreet} onChange={(v) => set({ addrStreet: v })} />
            <F label="עיר (City)" value={worker.addrCity} onChange={(v) => set({ addrCity: v })} />
            <F label="מחוז/אזור (State/Region)" value={worker.addrRegion} onChange={(v) => set({ addrRegion: v })} />
            <F label="מיקוד (Postal Code)" value={worker.addrPostal} onChange={(v) => set({ addrPostal: v })} dir="ltr" />
            <F label="מדינה (Country)" value={worker.addrCountry} onChange={(v) => set({ addrCountry: v })} />
          </div>
        </section>

        {/* validity */}
        <section className="card tik-section">
          <h3>תוקף מסמכים</h3>
          <div className="tik-grid">
            <F label="תאריך הנפקת דרכון" type="date" value={worker.passportIssueDate} onChange={(v) => set({ passportIssueDate: v })} dir="ltr" />
            <F label="מקום הנפקה" value={worker.issuePlace} onChange={(v) => set({ issuePlace: v })} />
            <F label="תוקף דרכון" type="date" value={worker.passportExpiry} onChange={(v) => set({ passportExpiry: v })} dir="ltr" />
            <F label="תוקף אשרה / ויזה" type="date" value={worker.visaExpiry} onChange={(v) => set({ visaExpiry: v })} dir="ltr" />
            <F label="תוקף היתר העסקה" type="date" value={worker.permitExpiry} onChange={(v) => set({ permitExpiry: v })} dir="ltr" />
            <F label="תוקף ביטוח" type="date" value={worker.insuranceExpiry} onChange={(v) => set({ insuranceExpiry: v })} dir="ltr" />
            <F label="תאריך הגעה לארץ" value={worker.arrivalDate} onChange={(v) => set({ arrivalDate: v })} dir="ltr" />
            <F label="תאריך עבודה אחרון" value={worker.lastWorkDate} onChange={(v) => set({ lastWorkDate: v })} dir="ltr" />
          </div>
        </section>

        {/* employment */}
        <section className="card tik-section">
          <h3>פרטי העסקה</h3>
          <div className="tik-grid">
            <F label="מעסיק" value={worker.employer} onChange={(v) => set({ employer: v })} />
            <F label="שם המטופל/ת" value={worker.patientName} onChange={(v) => set({ patientName: v })} />
            <F label="כתובת מקום העבודה" value={worker.address} onChange={(v) => set({ address: v })} />
            <F label="תאריך תחילת העסקה" type="date" value={worker.startDate} onChange={(v) => set({ startDate: v })} dir="ltr" />
            <F label="שכר חודשי (₪)" value={worker.salary} onChange={(v) => set({ salary: v })} dir="ltr" />
            <F label="ימי עבודה בשבוע" value={worker.daysPerWeek} onChange={(v) => set({ daysPerWeek: v })} dir="ltr" />
            <F label="שעות עבודה ביום" value={worker.hoursPerDay} onChange={(v) => set({ hoursPerDay: v })} dir="ltr" />
            <F label="יום חופש שבועי" value={worker.weeklyDayOff} onChange={(v) => set({ weeklyDayOff: v })} />
            <F label="מקדמה שבועית (₪)" value={worker.weeklyAdvance} onChange={(v) => set({ weeklyAdvance: v })} dir="ltr" />
          </div>
          <label className="tik-field" style={{ marginTop: 10 }}>
            <span>הערות</span>
            <div className="tik-input-row">
              <textarea
                className="text-input"
                rows={3}
                value={worker.notes || ''}
                onChange={(e) => set({ notes: e.target.value })}
              />
              <CopyBtn value={worker.notes} />
            </div>
          </label>
        </section>

        {/* documents */}
        <section className="card tik-section">
          <h3>מסמכים סרוקים</h3>
          <div className="tik-upload">
            <label className="tik-field" style={{ maxWidth: 200 }}>
              <span>סוג מסמך</span>
              <select className="text-input" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                ))}
              </select>
            </label>
            <button className="btn-ghost" disabled={busyUpload} onClick={() => camInput.current?.click()}>
              📷 צלם
            </button>
            <button className="btn-ghost" disabled={busyUpload} onClick={() => fileInput.current?.click()}>
              {busyUpload ? 'מעלה…' : '⬆ העלאת קובץ (תמונה / PDF)'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={onPickFiles}
            />
            <input
              ref={camInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={onPickFiles}
            />
          </div>
          <DocChecklist files={files} required={WORKER_REQUIRED} />
          <p className="muted small" style={{ marginBottom: 10 }}>
            ✨ עם מפתח Gemini (ב-⚙ הגדרות), תמונת דרכון/אשרה/היתר נקראת אוטומטית מיד עם ההעלאה וממלאת את כל השדות. אפשר גם ללחוץ «קרא ומלא» ידנית בכל עת.
          </p>
          {flash && <div className="tik-flash">{flash}</div>}
          {files.length === 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>עדיין לא הועלו מסמכים. בחר סוג והעלה דרכון, אשרה, היתר וכו'.</p>
          ) : (
            <ul className="tik-doc-list">
              {files.map((f) => (
                <DocRow
                  key={f.id}
                  file={f}
                  onView={setViewing}
                  onChanged={reloadFiles}
                  onExtract={extractFrom}
                  extracting={extractingId === f.id}
                />
              ))}
            </ul>
          )}
        </section>

        <div className="tik-editor-foot">
          <button className="btn-danger" onClick={remove}>🗑 מחק תיק</button>
          <div className="tik-foot-right">
            {savedTick && <span className="tik-saved">✓ נשמר</span>}
            <button className="btn-primary" onClick={saveManual} disabled={saving}>
              {saving ? 'שומר…' : '💾 שמור תיק'}
            </button>
          </div>
        </div>
        <BrandFooter />
      </div>
      {viewing && <Lightbox file={viewing} onClose={() => setViewing(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showContractPicker && (
        <ContractPicker
          worker={worker}
          family={linkedFamily}
          onClose={() => setShowContractPicker(false)}
          onBuiltin={makeBuiltinContract}
          onSigned={(link) => setSignLink(link)}
        />
      )}
      {signLink && <SignLinkModal link={signLink} who={worker.nameHe || worker.nameEn || 'העובד/ת'} onClose={() => setSignLink(null)} />}
    </div>
  );
}

// The signing request was created — show the link to send to the signer.
function SignLinkModal({ link, who, onClose }) {
  const [copied, setCopied] = useState(false);
  const msg = `שלום, ${who} מתבקש/ת לחתום על החוזה בקישור: ${link}`;
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>✍️ החוזה נשלח לחתימה</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <p className="muted small">שלח את הקישור לעובד/מעסיק. אחרי החתימה, העותק החתום יישמר במערכת החתימות (עם תיעוד).</p>
        <input className="text-input" dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} style={{ marginTop: 8 }} />
        <div className="card-actions" style={{ marginTop: 12 }}>
          <button
            className="btn-primary"
            onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}
          >
            {copied ? '✓ הועתק' : 'העתק קישור'}
          </button>
          <a className="btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">שלח בוואטסאפ</a>
          <a className="btn-ghost" href={`mailto:?subject=${encodeURIComponent('חוזה לחתימה')}&body=${encodeURIComponent(msg)}`}>שלח במייל</a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Family / patient (client) files
// ---------------------------------------------------------------------------

function ModeTabs({ mode, onMode }) {
  return (
    <div className="tik-modetabs">
      <button className={`tik-modetab${mode === 'workers' ? ' active' : ''}`} onClick={() => onMode('workers')}>🗂️ תיקי עובדים</button>
      <button className={`tik-modetab${mode === 'families' ? ' active' : ''}`} onClick={() => onMode('families')}>👨‍👩‍👧 תיקי משפחות</button>
    </div>
  );
}

// Field groups for a family/patient file, modelled on the Tik-Tak client card.
const FAMILY_SECTIONS = [
  { title: 'פרטי מטופל/לקוח', fields: [
    ['firstName', 'שם פרטי'], ['lastName', 'שם משפחה'], ['fullName', 'שם מלא'],
    ['idNumber', 'תעודת זהות', 'text', 'ltr'], ['idIssueDate', 'ת. הוצאת ת.ז', 'date', 'ltr'],
    ['dob', 'ת.לידה', 'date', 'ltr'],
    ['gender', 'מין'], ['maritalStatus', 'מצב משפחתי'], ['city', 'עיר מגורים'], ['street', 'כתובת'],
    ['zip', 'מיקוד', 'text', 'ltr'], ['phone', 'טלפון', 'text', 'ltr'], ['mobile', 'נייד', 'text', 'ltr'],
    ['email', 'אימייל', 'text', 'ltr'], ['birthCountry', 'ארץ לידה'], ['language', 'שפה'],
  ] },
  { title: 'איש קשר', fields: [
    ['contactName', 'שם איש קשר'], ['contactRelation', 'קרבה'],
    ['contactMobile', 'נייד א.קשר', 'text', 'ltr'], ['contactId', 'ת.ז איש קשר', 'text', 'ltr'],
  ] },
  { title: 'תיק ומנהלה', fields: [
    ['clientNo', 'מספר לקוח', 'text', 'ltr'], ['branch', 'סניף'], ['coordinator', 'רכז/ת'],
    ['status', 'סטטוס'], ['openDate', 'תאריך פתיחה', 'date', 'ltr'], ['referrer', 'גורם מפנה'],
  ] },
  { title: 'תוקף אשרה / ביטוח / היתר', fields: [
    ['visaExpiry', 'תוקף אשרה', 'date', 'ltr'], ['insuranceExpiry', 'תוקף ביטוח', 'date', 'ltr'],
    ['permitNumber', 'מספר היתר', 'text', 'ltr'],
    ['permitIssueDate', 'ת. הוצאת היתר', 'date', 'ltr'], ['permitExpiry', 'ת. סיום היתר', 'date', 'ltr'],
  ] },
  { title: 'זכאות לסיעוד', fields: [
    ['eligibilityLevel', 'רמת זכאות'], ['careLaw', 'חוק סיעוד / ו.הומניטרית'], ['disabilityPct', 'אחוזי נכות', 'text', 'ltr'],
    ['careInsurance', 'ביטוח סיעודי'], ['eligibilityGrantor', 'נותן זכאות'], ['contractNote', 'הערה לחוזה'],
  ] },
  { title: 'מצב תפקודי', fields: [
    ['mobility', 'ניידות'], ['sight', 'ראיה'], ['hearing', 'שמיעה'],
    ['emotional', 'מצב רגשי'], ['continence', 'שליטה בסוגרים'], ['cognitive', 'מצב קוגניטיבי'],
  ] },
  { title: 'דרישות מהמטפל', fields: [
    ['reqLanguage', 'שפה מבוקשת'], ['reqGender', 'מין מבוקש'], ['offeredSalary', 'שכר מוצע', 'text', 'ltr'],
    ['caregiverRoom', 'חדר למטפל'], ['okSmoker', 'מוכן למעשן'],
  ] },
];

// Flat label maps for the smart-import review screen.
const WORKER_LABELS = { ...FIELD_LABELS, phone: 'טלפון', email: 'אימייל', insuranceExpiry: 'תוקף ביטוח' };
const FAMILY_LABELS = FAMILY_SECTIONS.reduce((a, s) => {
  s.fields.forEach(([k, l]) => { a[k] = l; });
  return a;
}, {});

// One editable row on the smart-import review screen: label, value, copy button.
function SmartRow({ label, value, onChange }) {
  return (
    <label className="tik-field" style={{ marginBottom: 8 }}>
      <span>{label}</span>
      <div className="tik-input-row">
        <input className="text-input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        <CopyBtn value={value} />
      </div>
    </label>
  );
}

// Smart import: paste text OR upload a photo/screenshot; the AI decides what the
// document is and splits the details between the worker (מטפל) and the
// employer/patient (מעסיק). The user reviews, then creates linked files.
function SmartImportModal({ onClose, onOpenWorker, onOpenFamily, onReload }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]); // [{ file, url }]
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { docType, rawText }
  const [wFields, setWFields] = useState({});
  const [pFields, setPFields] = useState({});
  const [created, setCreated] = useState(null); // { workerId, familyId }
  const fileRef = useRef(null);

  function addImages(fileList) {
    const picked = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/'));
    if (!picked.length) return;
    setImages((prev) => [...prev, ...picked.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
  }
  function removeImage(i) {
    setImages((prev) => { const u = prev[i]?.url; if (u) URL.revokeObjectURL(u); return prev.filter((_, j) => j !== i); });
  }
  useEffect(() => () => { images.forEach((im) => im.url && URL.revokeObjectURL(im.url)); }, [images]);

  async function analyze() {
    setErr('');
    if (!hasAI()) { setErr('צריך מפתח Gemini (⚙ הגדרות).'); return; }
    if (!images.length && !text.trim()) { setErr('הדבק טקסט או בחר תמונה קודם.'); return; }
    setBusy(true);
    try {
      // Read every image (and/or the text) and merge — first non-empty value per
      // field wins. Each image is time-boxed so one slow/bad photo can't hang
      // the whole read; failures are skipped and the rest still fill.
      const parts = []; let lastErr = ''; let failed = 0;
      for (let i = 0; i < images.length; i++) {
        setProgress(`קורא תמונה ${i + 1} מתוך ${images.length}…`);
        try { parts.push(await withTimeout(smartImport({ blob: images[i].file }), 45000)); }
        catch (e) { failed += 1; lastErr = e?.message || 'timeout'; }
      }
      if (text.trim()) parts.push(await smartImport({ text }));
      setProgress('');
      const worker = {}; const patient = {}; const docTypes = []; const raw = [];
      for (const r of parts) {
        for (const [k, v] of Object.entries(r.worker || {})) if (v && !worker[k]) worker[k] = v;
        for (const [k, v] of Object.entries(r.patient || {})) if (v && !patient[k]) patient[k] = v;
        if (r.docType) docTypes.push(r.docType);
        if (r.rawText) raw.push(r.rawText);
      }
      const found = Object.keys(worker).length || Object.keys(patient).length;
      if (!found) {
        setErr(failed
          ? `הקריאה לא הצליחה (${failed}/${images.length} תמונות). נסה/י תמונה אחת ברורה בכל פעם, ובדוק/י מפתח/מכסת AI בהגדרות. ${lastErr}`
          : 'לא זוהו פרטים. נסה/י תמונה ברורה יותר או הדבק/י טקסט מסודר.');
        return;
      }
      setResult({ docType: [...new Set(docTypes)].join(' + '), rawText: raw.join('\n\n') });
      setWFields(worker);
      setPFields(patient);
      if (failed) setErr(`שים/י לב: ${failed} תמונות לא נקראו, אך השאר מולאו.`);
    } catch (e) {
      setErr(e?.message || 'שגיאה בקריאה.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const setW = (k, v) => setWFields((f) => ({ ...f, [k]: v }));
  const setP = (k, v) => setPFields((f) => ({ ...f, [k]: v }));
  const wKeys = Object.keys(wFields).filter((k) => wFields[k]);
  const pKeys = Object.keys(pFields).filter((k) => pFields[k]);

  // Which important details are still missing after the read — shown to the user.
  const someOf = (o, ks) => ks.some((k) => o[k]);
  const missingList = (() => {
    const m = [];
    if (!someOf(wFields, ['nameHe', 'nameEn', 'firstNameEn', 'lastNameEn', 'firstNameHe', 'lastNameHe'])) m.push('שם העובד/ת');
    if (!wFields.passportNo) m.push('מספר דרכון');
    if (!wFields.nationality) m.push('אזרחות');
    if (!wFields.dob) m.push('תאריך לידה של העובד/ת');
    if (!wFields.passportExpiry) m.push('תוקף דרכון');
    if (!someOf(pFields, ['fullName', 'firstName', 'lastName'])) m.push('שם המטופל/מעסיק');
    if (!pFields.idNumber) m.push('ת.ז מטופל');
    if (!pFields.city) m.push('עיר מגורים');
    if (!someOf(pFields, ['phone', 'mobile', 'contactMobile'])) m.push('מספר טלפון');
    return m;
  })();

  async function create(which) {
    setBusy(true); setErr('');
    try {
      // Warn about duplicates before creating new files.
      if (which !== 'family' && wFields.passportNo) {
        const dup = await findWorkerDuplicate(wFields.passportNo);
        if (dup && !confirm(`כבר קיים תיק עובד עם דרכון ${wFields.passportNo} (${dup.nameHe || dup.nameEn || 'ללא שם'}). ליצור בכל זאת?`)) { setBusy(false); return; }
      }
      if (which !== 'worker' && pFields.idNumber) {
        const dup = await findFamilyDuplicate(pFields.idNumber);
        if (dup && !confirm(`כבר קיים תיק משפחה עם ת.ז ${pFields.idNumber} (${dup.fullName || 'ללא שם'}). ליצור בכל זאת?`)) { setBusy(false); return; }
      }
      let workerId = null; let familyId = null;
      if (which !== 'family' && wKeys.length) {
        const w = { ...emptyWorker() };
        wKeys.forEach((k) => { w[k] = wFields[k]; });
        const saved = await saveWorker(w);
        workerId = saved.id;
      }
      if (which !== 'worker' && pKeys.length) {
        const f = { ...emptyFamily() };
        pKeys.forEach((k) => { f[k] = pFields[k]; });
        if (workerId) f.caregiverWorkerId = workerId; // link the two sides
        const saved = await saveFamily(f);
        familyId = saved.id;
      }
      if (!workerId && !familyId) { setErr('אין פרטים לשמירה.'); setBusy(false); return; }
      onReload?.();
      setCreated({ workerId, familyId });
    } catch (e) {
      setErr(e?.message || 'שמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tik-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <strong>🤖 ייבוא חכם</strong>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {!result && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              העלה תמונה אחת או <strong>כמה יחד</strong> (למשל דרכון + ת.ז), או צילום מסך, או הדבק טקסט —
              המערכת תזהה מה זה ותשייך לבד מה שייך למטפל ומה למעסיק/מטופל.
            </p>
            <div className="card-actions" style={{ marginTop: 6 }}>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>📷 בחר תמונות</button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
            </div>
            {images.length > 0 && (
              <div className="tik-thumbs">
                {images.map((im, i) => (
                  <div key={i} className="tik-thumb">
                    <img src={im.url} alt="" />
                    <button className="tik-thumb-x" onClick={() => removeImage(i)} title="הסר">✕</button>
                  </div>
                ))}
              </div>
            )}
            <p className="muted small" style={{ margin: '10px 0 4px' }}>וגם/או הדבק טקסט (אפשר יחד עם תמונות):</p>
            <textarea
              className="text-input"
              rows={5}
              value={text}
              placeholder="הדבק כאן פרטים שהעתקת (שם, דרכון, ת.ז, כתובת, טלפונים…)"
              onChange={(e) => { setText(e.target.value); }}
              style={{ resize: 'vertical' }}
            />
            {err && <p className="tik-error small">{err}</p>}
            <div className="card-actions" style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={analyze} disabled={busy}>{busy ? (progress || 'קורא…') : '✨ נתח פרטים'}</button>
              <button className="btn-ghost" onClick={onClose}>ביטול</button>
            </div>
          </div>
        )}

        {result && !created && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              זוהה: <strong>{result.docType || 'מסמך'}</strong>. בדוק/תקן ואז צור תיקים.
            </p>
            <div className="tik-smart-cols">
              <div className="card" style={{ padding: 12 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>🧑‍⚕️ מטפל (עובד){wKeys.length ? '' : ' — לא זוהה'}</h3>
                {wKeys.map((k) => (
                  <SmartRow key={k} label={WORKER_LABELS[k] || k} value={wFields[k]} onChange={(v) => setW(k, v)} />
                ))}
              </div>
              <div className="card" style={{ padding: 12 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>🏠 מעסיק / מטופל (משפחה){pKeys.length ? '' : ' — לא זוהה'}</h3>
                {pKeys.map((k) => (
                  <SmartRow key={k} label={FAMILY_LABELS[k] || k} value={pFields[k]} onChange={(v) => setP(k, v)} />
                ))}
              </div>
            </div>
            {missingList.length > 0 ? (
              <div className="tik-chk miss-sum" style={{ display: 'block', marginTop: 10, padding: '8px 12px', borderRadius: 10 }}>
                ⚠️ <strong>חסרים פרטים:</strong> {missingList.join(' · ')} — אפשר להשלים ידנית למטה או לצלם מסמך נוסף.
              </div>
            ) : (
              <div className="tik-chk ok" style={{ display: 'block', marginTop: 10, padding: '8px 12px', borderRadius: 10 }}>
                ✓ כל הפרטים החשובים זוהו.
              </div>
            )}
            {result.rawText && (
              <details style={{ marginTop: 10 }}>
                <summary className="muted small">כל הטקסט שזוהה (להעתקה ידנית)</summary>
                <div className="tik-input-row" style={{ marginTop: 6 }}>
                  <textarea className="text-input" rows={4} readOnly value={result.rawText} style={{ resize: 'vertical' }} />
                  <CopyBtn value={result.rawText} />
                </div>
              </details>
            )}
            {err && <p className="tik-error small">{err}</p>}
            <div className="card-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {wKeys.length > 0 && pKeys.length > 0 && (
                <button className="btn-primary" onClick={() => create('both')} disabled={busy}>
                  ✅ צור תיק (משפחה + עובד/ת)
                </button>
              )}
              {wKeys.length > 0 && (
                <button className="btn-ghost" onClick={() => create('worker')} disabled={busy}>רק עובד/ת</button>
              )}
              {pKeys.length > 0 && (
                <button className="btn-ghost" onClick={() => create('family')} disabled={busy}>רק משפחה</button>
              )}
              <button className="btn-ghost" onClick={() => { setResult(null); setErr(''); }} disabled={busy}>← חזרה</button>
            </div>
          </div>
        )}

        {created && (
          <div>
            <p style={{ marginTop: 0 }}>✅ נוצר בהצלחה{created.workerId && created.familyId ? ' — התיק כולל את המשפחה והעובד/ת' : ''}.</p>
            <div className="card-actions" style={{ flexWrap: 'wrap' }}>
              {created.familyId && <button className="btn-primary" onClick={() => onOpenFamily(created.familyId)}>פתח את התיק</button>}
              {created.workerId && !created.familyId && <button className="btn-primary" onClick={() => onOpenWorker(created.workerId)}>פתח תיק עובד/ת</button>}
              <button className="btn-ghost" onClick={onClose}>סגור</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Render **bold** inside an office-chat bubble.
function chatText(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

// WhatsApp-style office assistant. The office user drops photos and details into
// a chat; the AI reads each one (smart import), fills the running worker/family
// fields, tells them what it read and what's still missing, then builds the one
// unified family file (which contains the worker) — the same as the smart import,
// but as a friendly conversation instead of a form.
function OfficeChat({ onClose, onOpenFamily, onReload }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [, force] = useState(0);          // re-render when the field refs change
  const workerRef = useRef({});
  const patientRef = useRef({});
  const fileInput = useRef(null);
  const camInput = useRef(null);
  const scroller = useRef(null);
  const startedRef = useRef(false);

  const pushBot = (text) => setMessages((m) => [...m, { from: 'bot', text }]);
  const pushMe = (msg) => setMessages((m) => [...m, { from: 'me', ...msg }]);
  const botSay = (text, delay) => new Promise((res) => {
    const ms = delay != null ? delay : Math.min(2600, 700 + String(text).length * 16 + Math.random() * 300);
    setTyping(true);
    setTimeout(() => { setTyping(false); pushBot(text); res(); }, ms);
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      if (!hasAI()) {
        await botSay('כדי שאקרא מסמכים צריך מפתח Gemini. פתח/י ⚙ הגדרות והזן/י את המפתח — ואז נתחיל 🙂', 900);
        return;
      }
      await botSay('שלום! 👋 אני העוזר של עוגן.', 700);
      await botSay('שלח/י לי כאן תמונות של המסמכים (דרכון, ת״ז, היתר…) ו/או פשוט כתוב/י פרטים — ואני אקרא, אמלא את התיק ואגיד לך מה עוד חסר. בסוף בלחיצה אחת ניצור את התיק.', 1100);
    })();
  }, []);

  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [messages, typing]);

  // Merge a smart-import result into the running fields. A newer non-empty value
  // overrides, so a correction the user types later wins over an earlier read.
  function mergePart(part) {
    let added = 0;
    for (const [k, v] of Object.entries(part.worker || {})) if (v) { if (workerRef.current[k] !== v) added++; workerRef.current[k] = v; }
    for (const [k, v] of Object.entries(part.patient || {})) if (v) { if (patientRef.current[k] !== v) added++; patientRef.current[k] = v; }
    force((n) => n + 1);
    return added;
  }

  const someOf = (o, ks) => ks.some((k) => o[k]);
  function missing() {
    const w = workerRef.current; const p = patientRef.current; const m = [];
    if (!someOf(w, ['nameHe', 'nameEn', 'firstNameEn', 'lastNameEn', 'firstNameHe', 'lastNameHe'])) m.push('שם העובד/ת');
    if (!w.passportNo) m.push('מספר דרכון');
    if (!w.nationality) m.push('אזרחות');
    if (!w.dob) m.push('תאריך לידה של העובד/ת');
    if (!w.passportExpiry) m.push('תוקף דרכון');
    if (!someOf(p, ['fullName', 'firstName', 'lastName'])) m.push('שם המטופל/מעסיק');
    if (!p.idNumber) m.push('ת.ז מטופל');
    if (!p.city) m.push('עיר מגורים');
    if (!someOf(p, ['phone', 'mobile', 'contactMobile'])) m.push('מספר טלפון');
    return m;
  }

  function readSummary(part) {
    const w = part.worker || {}; const p = part.patient || {};
    return [
      w.nameEn || w.nameHe || [w.firstNameEn, w.lastNameEn].filter(Boolean).join(' '),
      w.passportNo && 'דרכון ' + w.passportNo,
      w.nationality,
      p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' '),
      p.idNumber && 'ת.ז ' + p.idNumber,
      p.city,
      (p.phone || p.mobile || p.contactMobile) && 'טל ' + (p.phone || p.mobile || p.contactMobile),
    ].filter(Boolean);
  }

  async function reportMissing() {
    const m = missing();
    if (m.length) await botSay('עדיין חסר לי: **' + m.join(' · ') + '**.\nאפשר לצלם עוד מסמך או פשוט לכתוב לי את הפרטים. 🙂', 800);
    else await botSay('מצוין! יש לי את כל הפרטים החשובים ✅ אפשר ליצור את התיק — הכפתור למטה.', 700);
  }

  const hasData = () => Object.keys(workerRef.current).length || Object.keys(patientRef.current).length;

  async function onFiles(list) {
    const files = Array.from(list || []).filter((f) => f.type?.startsWith('image/'));
    if (!files.length || typing || busy || created) return;
    setBusy(true);
    for (const f of files) pushMe({ image: URL.createObjectURL(f) });
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setTyping(true);
      try {
        const part = await withTimeout(smartImport({ blob: files[i] }), 45000);
        setTyping(false);
        const bits = readSummary(part);
        mergePart(part);
        await botSay(bits.length ? 'קראתי: ' + bits.join(' · ') + ' ✓' : 'קיבלתי את התמונה ✓ (לא זיהיתי ממנה פרטים ברורים)', 450);
      } catch { setTyping(false); failed++; }
    }
    if (failed) await botSay(`שים/י לב: ${failed} תמונות לא נקראו — נסה/י תמונה ברורה יותר, אחת בכל פעם.`, 500);
    await reportMissing();
    setBusy(false);
  }

  async function onText() {
    const text = input.trim();
    if (!text || typing || busy || created) return;
    setInput('');
    pushMe({ text });
    if (!hasAI()) { await botSay('צריך מפתח AI (⚙ הגדרות) כדי שאבין את הפרטים.', 500); return; }
    setBusy(true);
    try {
      setTyping(true);
      const part = await withTimeout(smartImport({ text }), 30000);
      setTyping(false);
      const added = mergePart(part);
      const bits = readSummary(part);
      if (bits.length) await botSay('רשמתי: ' + bits.join(' · ') + ' ✓', 450);
      else if (added) await botSay('נרשם ✓', 350);
      else await botSay('קיבלתי 🙂 אם זה פרט לתיק (שם, ת״ז, טלפון, כתובת, דרכון…) כתוב/י אותו ואשייך אותו למקום הנכון.', 550);
      await reportMissing();
    } catch (e) { setTyping(false); await botSay('לא הצלחתי לקרוא את זה כרגע: ' + (e?.message || 'שגיאה') + '\nנסה/י שוב, או צלם/י את המסמך.', 450); }
    setBusy(false);
  }

  async function createFile() {
    if (busy || created || !hasData()) return;
    const w = workerRef.current; const p = patientRef.current;
    setBusy(true);
    try {
      if (w.passportNo) {
        const dup = await findWorkerDuplicate(w.passportNo);
        if (dup && !confirm(`כבר קיים עובד עם דרכון ${w.passportNo} (${dup.nameHe || dup.nameEn || 'ללא שם'}). ליצור בכל זאת?`)) { setBusy(false); return; }
      }
      if (p.idNumber) {
        const dup = await findFamilyDuplicate(p.idNumber);
        if (dup && !confirm(`כבר קיים תיק עם ת.ז ${p.idNumber} (${dup.fullName || 'ללא שם'}). ליצור בכל זאת?`)) { setBusy(false); return; }
      }
      let workerId = null;
      if (Object.keys(w).length) { const s = await saveWorker({ ...emptyWorker(), ...w }); workerId = s.id; }
      const fam = { ...emptyFamily(), ...p };
      if (workerId) fam.caregiverWorkerId = workerId; // one unified file: family holds the worker
      const savedFam = await saveFamily(fam);
      onReload?.();
      await botSay('התיק נוצר בהצלחה! ✅', 300);
      setCreated({ familyId: savedFam.id });
    } catch (e) { await botSay('שמירה נכשלה: ' + (e?.message || ''), 400); }
    setBusy(false);
  }

  return (
    <div className="chat-wrap office-chat">
      <div className="chat-head">
        <button className="chat-icon" onClick={onClose} title="חזרה" style={{ color: '#fff' }}>›</button>
        <div className="chat-avatar">ע</div>
        <div className="chat-head-txt">
          <strong>עוזר העלאה · עוגן</strong>
          <span>{typing ? 'קורא…' : busy ? 'עובד…' : 'מקוון'}</span>
        </div>
      </div>

      <div className="chat-body" ref={scroller}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-row ${m.from}`}>
            <div className="chat-bubble">{m.image ? <img className="chat-img" src={m.image} alt="" /> : chatText(m.text)}</div>
          </div>
        ))}
        {typing && (
          <div className="chat-row bot">
            <div className="chat-bubble chat-typing"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>

      {!created && hasData() && (
        <div className="chat-done">
          <button className="btn-primary full" onClick={createFile} disabled={busy}>{busy ? 'שומר…' : '✅ צור את התיק'}</button>
        </div>
      )}
      {!created && (
        <div className="chat-input">
          <button className="chat-icon" title="מצלמה" onClick={() => camInput.current?.click()}>📷</button>
          <button className="chat-icon" title="קובץ" onClick={() => fileInput.current?.click()}>📎</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input
            className="chat-text"
            placeholder="כתבו פרטים או שלחו תמונה…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onText(); }}
          />
          <button className="chat-send" onClick={onText} disabled={!input.trim() || busy}>שלח</button>
        </div>
      )}
      {created && (
        <div className="chat-done" style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary full" onClick={() => onOpenFamily(created.familyId)}>📂 פתח את התיק</button>
          <button className="btn-ghost" onClick={onClose}>סגור</button>
        </div>
      )}
    </div>
  );
}

function FamilyList({ onOpen, onNew, onLogout, onOpenWorker, onOpenFamily, onOpenChat }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showSmart, setShowSmart] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  const reloadFamilies = () => listFamilies().then(setItems);
  useEffect(() => { reloadFamilies(); }, []);
  useEffect(() => { countNewSubmissions().then(setInboxCount).catch(() => {}); }, [showInbox]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((f) =>
      [f.fullName, f.firstName, f.lastName, f.idNumber, f.city, f.contactName, f.clientNo]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <div className="app">
      <Header
        onLogout={onLogout}
        onSettings={() => setShowSettings(true)}
        right={<a className="header-settings" href="index.html">אזור החתימות</a>}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showInbox && <AgentInbox onClose={() => setShowInbox(false)} onImported={reloadFamilies} />}
      {showSmart && (
        <SmartImportModal
          onClose={() => setShowSmart(false)}
          onOpenWorker={onOpenWorker}
          onOpenFamily={onOpenFamily}
          onReload={reloadFamilies}
        />
      )}
      <div className="tik-list">
        <DashboardCard onDataChanged={reloadFamilies} />
        <div className="tik-list-head">
          <h2 style={{ margin: 0 }}>התיקים שלי</h2>
          <div className="tik-head-actions">
            <button className="btn-ghost" onClick={onOpenChat}>💬 צ'אט העלאה</button>
            <button className="btn-ghost" onClick={() => setShowSmart(true)}>🤖 ייבוא חכם</button>
            <button className="btn-ghost" onClick={() => setShowInbox(true)}>📥 הגשות{inboxCount ? ` (${inboxCount})` : ''}</button>
            <button className="btn-primary" onClick={onNew}>➕ תיק חדש</button>
          </div>
        </div>
        <input
          className="text-input"
          placeholder="חיפוש לפי שם משפחה, ת.ז, יישוב או עובד/ת…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ margin: '12px 0' }}
        />
        {items === null && <p className="muted">טוען…</p>}
        {items && !items.length && (
          <div className="card tik-empty"><p className="muted">עדיין אין תיקים. לחץ «תיק חדש» כדי לפתוח תיק משפחה — כולל העובד/ת שלה.</p></div>
        )}
        {filtered.length > 0 && (
          <ul className="req-list">
            {filtered.map((f) => (
              <li key={f.id} className="req-item" onClick={() => onOpen(f.id)}>
                <div className="req-main">
                  <span className="req-title">{familyName(f) || 'ללא שם'}</span>
                  <span className="req-sub">
                    {[f.idNumber && 'ת.ז ' + f.idNumber, f.city, f.contactName && 'איש קשר: ' + f.contactName]
                      .filter(Boolean).join('  ·  ')}
                  </span>
                </div>
                <div className="req-side"><span className="tik-chevron">‹</span></div>
              </li>
            ))}
          </ul>
        )}
        <BrandFooter />
      </div>
    </div>
  );
}

function FamilyEditor({ familyId, onBack, onDeleted, onOpenWorker }) {
  const [family, setFamily] = useState(null);
  const [files, setFiles] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [uploadCat, setUploadCat] = useState('id');
  const [busyUpload, setBusyUpload] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [showContractPicker, setShowContractPicker] = useState(false);
  const [linkedWorker, setLinkedWorker] = useState(null);
  const [signLink, setSignLink] = useState(null);
  const [makingContract, setMakingContract] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [flash, setFlash] = useState('');
  const [rawText, setRawText] = useState('');
  const fileInput = useRef(null);
  const camInput = useRef(null);
  const isNew = familyId == null;
  const FAM_LABELS = {
    fullName: 'שם מלא', firstName: 'שם פרטי', lastName: 'שם משפחה',
    idNumber: 'ת.ז', idIssueDate: 'ת. הוצאת ת.ז', dob: 'ת.לידה', gender: 'מין', city: 'עיר מגורים',
    street: 'כתובת', zip: 'מיקוד', phone: 'טלפון', contactName: 'איש קשר',
    contactMobile: 'נייד א.קשר', permitIssueDate: 'ת. הוצאת היתר', permitExpiry: 'ת. סיום היתר', insuranceExpiry: 'תוקף ביטוח',
  };

  useEffect(() => {
    if (isNew) { setFamily(emptyFamily()); setFiles([]); }
    else { getFamily(familyId).then((f) => setFamily(f || emptyFamily())); listFiles(familyId).then(setFiles); }
    listWorkers().then(setWorkers);
  }, [familyId, isNew]);

  // Keep the linked worker (current placement) loaded for the placement card.
  useEffect(() => {
    if (!family?.caregiverWorkerId) { setLinkedWorker(null); return; }
    getWorker(family.caregiverWorkerId).then((w) => setLinkedWorker(w || null));
  }, [family?.caregiverWorkerId]);

  if (!family) {
    return <div className="app"><Header /><p className="muted" style={{ padding: 24 }}>טוען…</p></div>;
  }

  const set = (patch) => setFamily((f) => ({ ...f, ...patch }));
  const reloadFiles = () => listFiles(family.id).then(setFiles);

  async function persist() {
    setSaving(true);
    try {
      const saved = await saveFamily(family);
      setFamily(saved);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1600);
      return saved;
    } finally { setSaving(false); }
  }

  async function saveManual() {
    if (family.idNumber) {
      const dup = await findFamilyDuplicate(family.idNumber, family.id);
      if (dup && !confirm(`כבר קיים תיק עם ת.ז ${family.idNumber} (${dup.fullName || 'ללא שם'}). לשמור בכל זאת?`)) return;
    }
    await persist();
  }

  const flashMsg = (m) => { setFlash(m); setTimeout(() => setFlash(''), 3000); };
  async function copyAll() {
    try { await navigator.clipboard.writeText(familyToText(family)); flashMsg('📋 כל הפרטים הועתקו — אפשר להדביק בטיק-טק'); }
    catch { flashMsg('ההעתקה נחסמה בדפדפן'); }
  }
  const shareWhatsapp = () => window.open(whatsappLink(family.phone || family.mobile, familyToText(family)), '_blank');
  const printPage = () => printSummary('תיק משפחה — ' + familyName(family), family, FAMILY_COLS);

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setBusyUpload(true);
    try {
      const saved = await persist();
      for (const f of picked) await addFile(saved.id, { category: uploadCat, file: f });
      await listFiles(saved.id).then(setFiles);

      // Auto-read the first ID/permit/insurance image (fills only empty fields).
      const img = picked.find((f) => f.type?.startsWith('image/'));
      if (img && ['id', 'permit', 'insurance'].includes(uploadCat) && hasAI()) {
        setFlash('✨ קורא את המסמך…');
        try {
          const { patch, rawText: rt } = await extractFamilyDocument(img, uploadCat);
          const apply = Object.fromEntries(Object.entries(patch).filter(([k]) => !family[k]));
          const applied = Object.keys(apply);
          if (applied.length) {
            const merged = { ...saved, ...apply };
            setFamily(merged);
            await saveFamily(merged);
            setFlash('✨ מולאו אוטומטית: ' + applied.map((k) => FAM_LABELS[k] || k).join(', '));
          } else {
            setFlash('✨ הקריאה הסתיימה — לא נמצאו שדות ריקים למילוי.');
          }
          if (rt) setRawText(rt);
        } catch (err) {
          setFlash('הקריאה האוטומטית נכשלה: ' + (err?.message || err));
        }
        setTimeout(() => setFlash(''), 7000);
      }
    } finally { setBusyUpload(false); }
  }

  async function extractFromFamily(file) {
    if (!hasAI()) { alert('כדי לקרוא מסמכים אוטומטית צריך מפתח Gemini (⚙ הגדרות).'); return; }
    setExtractingId(file.id);
    try {
      const { patch, rawText: rt } = await extractFamilyDocument(file.blob, file.category);
      setRawText(rt || '');
      const keys = Object.keys(patch);
      if (!keys.length) { alert('לא זוהו שדות. אפשר להשתמש בטקסט המזוהה למטה ולהעתיק ידנית.'); return; }
      const conflicts = keys.filter((k) => family[k] && family[k] !== patch[k]);
      let apply = patch;
      if (conflicts.length) {
        const overwrite = confirm(`זוהו ${keys.length} שדות. ${conflicts.length} כבר מלאים. אישור = לעדכן גם אותם · ביטול = רק ריקים.`);
        if (!overwrite) apply = Object.fromEntries(Object.entries(patch).filter(([k]) => !family[k]));
      }
      const applied = Object.keys(apply);
      if (applied.length) { set(apply); alert('מולאו: ' + applied.map((k) => FAM_LABELS[k] || k).join(', ')); }
      else alert('כל השדות שזוהו כבר מלאים.');
    } catch (err) {
      alert(err?.message || String(err));
    } finally { setExtractingId(null); }
  }

  async function remove() {
    if (isNew) return onBack();
    if (!confirm('למחוק את תיק המשפחה ואת כל המסמכים שבו? פעולה זו אינה הפיכה.')) return;
    await deleteFamily(family.id);
    onDeleted();
  }

  // Produce a contract from the family side — pulls in the linked worker so the
  // contract has both sides of the placement.
  async function openContractPicker() {
    const saved = await saveFamily(family).then((s) => { setFamily(s); return s; });
    const w = saved.caregiverWorkerId ? await getWorker(saved.caregiverWorkerId) : null;
    setLinkedWorker(w || null);
    setShowContractPicker(true);
  }
  async function makeBuiltinContract() {
    if (!linkedWorker) { alert('אין עובד מקושר. בחר/י עובד/ת ב«השמה נוכחית» כדי להפיק חוזה ברירת מחדל.'); return; }
    setMakingContract(true);
    try {
      const bytes = await buildContractPdf(linkedWorker, { companyName: COMPANY_NAME });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `חוזה - ${family.fullName || 'משפחה'}.pdf`);
    } catch (e) {
      alert('הפקת החוזה נכשלה: ' + (e?.message || e));
    } finally { setMakingContract(false); }
  }

  // Certificate of Placement (מכתב השמה) — עוגן's page-1 document, filled from
  // the family file + its linked worker.
  async function makeCertificate() {
    setMakingContract('cert');
    try {
      const saved = await saveFamily(family).then((s) => { setFamily(s); return s; });
      const w = saved.caregiverWorkerId ? await getWorker(saved.caregiverWorkerId) : (linkedWorker || {});
      const bytes = await buildPlacementCertificate(saved, w || {}, { date: saved.openDate || undefined });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `מכתב השמה - ${familyName(saved) || 'משפחה'}.pdf`);
    } catch (e) {
      alert('הפקת מכתב ההשמה נכשלה: ' + (e?.message || e));
    } finally { setMakingContract(false); }
  }

  // Full official packet — stamps the file's data onto עוגן's real 26-page
  // template (the exact document, filled from the file).
  async function makeFullPacket() {
    setMakingContract('full');
    try {
      const saved = await saveFamily(family).then((s) => { setFamily(s); return s; });
      const w = saved.caregiverWorkerId ? await getWorker(saved.caregiverWorkerId) : (linkedWorker || {});
      const bytes = await buildFilledContract(saved, w || {}, { date: saved.openDate || undefined });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `חוזה מלא - ${familyName(saved) || 'משפחה'}.pdf`);
    } catch (e) {
      alert('הפקת החוזה המלא נכשלה: ' + (e?.message || e));
    } finally { setMakingContract(false); }
  }

  return (
    <div className="app">
      <Header onLogout={null} right={<button className="header-settings" onClick={onBack}>‹ חזרה לרשימה</button>} />
      <div className="tik-editor">
        <div className="tik-actionsbar">
          <button className="btn-ghost small" onClick={copyAll}>📋 העתק הכול לטיק-טק</button>
          <button className="btn-ghost small" onClick={shareWhatsapp}>💬 וואטסאפ</button>
          <button className="btn-ghost small" onClick={printPage}>🖨️ דף סיכום</button>
        </div>

        {/* The worker belongs to this file. */}
        <div className="card tik-placement">
          <div className="tik-placement-head">
            <strong>👷 העובד/ת בתיק</strong>
            {linkedWorker
              ? <button className="btn-ghost small" onClick={() => onOpenWorker?.(linkedWorker.id)}>פתח את פרטי העובד/ת ›</button>
              : (
                <button className="btn-primary small" onClick={async () => {
                  const w = await saveWorker({ ...emptyWorker() });
                  const savedFam = await saveFamily({ ...family, caregiverWorkerId: w.id });
                  setFamily(savedFam); setLinkedWorker(w);
                  onOpenWorker?.(w.id);
                }}>➕ הוסף עובד/ת לתיק</button>
              )}
          </div>
          <div className="tik-placement-body muted small">
            {linkedWorker
              ? ([workerName(linkedWorker), linkedWorker.passportNo && 'דרכון ' + linkedWorker.passportNo,
                  linkedWorker.nationality, linkedWorker.phone].filter(Boolean).join('  ·  ') || 'לחץ «פתח את פרטי העובד/ת» למילוי')
              : 'עדיין לא שויך/ה עובד/ת לתיק הזה. לחץ «הוסף עובד/ת» כדי לפתוח את פרטי העובד/ת (דרכון, אשרה, היתר וכו׳).'}
          </div>
        </div>

        <div className="tik-renewal">
          <div>
            <strong>📄 הפקת מסמכים</strong>
            <div className="muted small">מסמכי ההשמה משלבים את פרטי המשפחה ואת פרטי העובד/ת המקושר/ת לתיק.</div>
          </div>
          <div className="card-actions" style={{ flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={makeFullPacket} disabled={makingContract}>
              {makingContract === 'full' ? 'מפיק…' : '📑 חוזה מלא (26 עמ׳)'}
            </button>
            <button className="btn-ghost" onClick={makeCertificate} disabled={makingContract}>
              {makingContract === 'cert' ? 'מפיק…' : '📜 מכתב השמה'}
            </button>
            <button className="btn-ghost" onClick={openContractPicker} disabled={makingContract}>
              {makingContract === true ? 'מפיק…' : '📄 חוזה קצר'}
            </button>
          </div>
        </div>
        {FAMILY_SECTIONS.map((sec) => (
          <section className="card tik-section" key={sec.title}>
            <h3>{sec.title}</h3>
            <div className="tik-grid">
              {sec.fields.map(([key, label, type, dir]) => (
                <F key={key} label={label} type={type || 'text'} dir={dir} value={family[key]} onChange={(v) => set({ [key]: v })} />
              ))}
            </div>
            {sec.title === 'פרטי מטופל/לקוח' && family.dob && (
              <p className="muted small" style={{ marginTop: 8 }}>גיל: {ageFrom(family.dob)}</p>
            )}
          </section>
        ))}

        {/* current placement — link a worker file */}
        <section className="card tik-section">
          <h3>השמה נוכחית (עובד/מטפל)</h3>
          <div className="tik-grid">
            <label className="tik-field">
              <span>עובד/ת מטפל/ת</span>
              <select className="text-input" value={family.caregiverWorkerId || ''} onChange={(e) => set({ caregiverWorkerId: e.target.value })}>
                <option value="">— ללא —</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.nameHe || w.nameEn || w.passportNo || 'עובד'}</option>
                ))}
              </select>
            </label>
            <F label="תאריך תחילת השמה" type="date" dir="ltr" value={family.placementStart} onChange={(v) => set({ placementStart: v })} />
          </div>
        </section>

        {/* documents */}
        <section className="card tik-section">
          <h3>מסמכים סרוקים</h3>
          <div className="tik-upload">
            <label className="tik-field" style={{ maxWidth: 220 }}>
              <span>סוג מסמך</span>
              <select className="text-input" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>
                {FAMILY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </label>
            <button className="btn-ghost" disabled={busyUpload} onClick={() => camInput.current?.click()}>
              📷 צלם
            </button>
            <button className="btn-ghost" disabled={busyUpload} onClick={() => fileInput.current?.click()}>
              {busyUpload ? 'מעלה…' : '⬆ העלאת קובץ (תמונה / PDF)'}
            </button>
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={onPickFiles} />
            <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={onPickFiles} />
          </div>
          <DocChecklist files={files} required={FAMILY_REQUIRED} />
          <p className="muted small" style={{ marginBottom: 10 }}>
            ✨ עם מפתח Gemini, תמונת ת.ז / היתר / ביטוח נקראת אוטומטית (גם בכתב יד). הטקסט המזוהה יוצג למטה כדי שתוכל להעתיק מילים ולמקם ידנית.
          </p>
          {flash && <div className="tik-flash">{flash}</div>}
          {files.length === 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>עדיין לא הועלו מסמכים.</p>
          ) : (
            <ul className="tik-doc-list">
              {files.map((f) => (
                <DocRow
                  key={f.id}
                  file={f}
                  onView={setViewing}
                  onChanged={reloadFiles}
                  onExtract={extractFromFamily}
                  extracting={extractingId === f.id}
                  extractCats={['id', 'permit', 'insurance']}
                />
              ))}
            </ul>
          )}
          {rawText && (
            <div className="tik-rawtext">
              <div className="tik-rawtext-head">
                <span>📝 טקסט שזוהה במסמך (להעתקה ומיקום ידני)</span>
                <button className="btn-ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(rawText); } catch { /* ignore */ } }}>העתק הכל</button>
              </div>
              <textarea className="text-input" readOnly rows={6} value={rawText} onFocus={(e) => e.target.select()} />
            </div>
          )}
        </section>

        <div className="tik-editor-foot">
          <button className="btn-danger" onClick={remove}>🗑 מחק תיק</button>
          <div className="tik-foot-right">
            {savedTick && <span className="tik-saved">✓ נשמר</span>}
            <button className="btn-primary" onClick={saveManual} disabled={saving}>{saving ? 'שומר…' : '💾 שמור תיק'}</button>
          </div>
        </div>
        <BrandFooter />
      </div>
      {viewing && <Lightbox file={viewing} onClose={() => setViewing(null)} />}
      {showContractPicker && (
        <ContractPicker
          worker={linkedWorker}
          family={family}
          onClose={() => setShowContractPicker(false)}
          onBuiltin={makeBuiltinContract}
          onSigned={(link) => setSignLink(link)}
        />
      )}
      {signLink && <SignLinkModal link={signLink} who={family.fullName || 'המטופל/ת'} onClose={() => setSignLink(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function TikApp() {
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState('workers'); // workers | families
  const [view, setView] = useState({ screen: 'list' }); // list | editWorker | editFamily

  // Auto cloud backup: every 45s (and when the tab is hidden), if the records
  // changed since the last upload, mirror them to Supabase so nothing is lost.
  const lastSigRef = useRef('');
  useEffect(() => {
    if (!authed) return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const rec = await collectRecords();
        if (!alive) return;
        if (!rec.workers.length && !rec.families.length) return;
        const sig = recordsSignature(rec);
        if (sig === lastSigRef.current) return;
        await backupNow(rec);
        lastSigRef.current = sig;
      } catch { /* offline / not configured — ignore, retry next tick */ }
    };
    const t = setInterval(tick, 45000);
    const onHide = () => { if (document.visibilityState === 'hidden') tick(); };
    document.addEventListener('visibilitychange', onHide);
    const first = setTimeout(tick, 4000);
    return () => { alive = false; clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', onHide); };
  }, [authed]);

  function logout() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setAuthed(false);
  }

  if (!authed) return <Gate onEnter={() => setAuthed(true)} />;

  if (view.screen === 'editWorker') {
    return (
      <WorkerEditor
        workerId={view.id}
        onBack={() => setView({ screen: 'list' })}
        onDeleted={() => setView({ screen: 'list' })}
        onOpenFamily={(id) => setView({ screen: 'editFamily', id })}
      />
    );
  }
  if (view.screen === 'editFamily') {
    return (
      <FamilyEditor
        familyId={view.id}
        onBack={() => setView({ screen: 'list' })}
        onDeleted={() => setView({ screen: 'list' })}
        onOpenWorker={(id) => setView({ screen: 'editWorker', id })}
      />
    );
  }

  if (view.screen === 'chat') {
    return (
      <OfficeChat
        onClose={() => setView({ screen: 'list' })}
        onOpenFamily={(id) => setView({ screen: 'editFamily', id })}
      />
    );
  }

  const openWorker = (id) => setView({ screen: 'editWorker', id });
  const openFamily = (id) => setView({ screen: 'editFamily', id });

  // One unified file per client: the family file (which contains the worker).
  return (
    <FamilyList
      onOpen={openFamily}
      onNew={() => setView({ screen: 'editFamily', id: null })}
      onLogout={logout}
      onOpenWorker={openWorker}
      onOpenFamily={openFamily}
      onOpenChat={() => setView({ screen: 'chat' })}
    />
  );
}
