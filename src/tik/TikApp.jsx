import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { buildContractPdf } from './contractPdf.js';
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
import { createSigningRequest, getSigningUrl, setSigningUrl } from './signingBridge.js';
import { listNewSubmissions, countNewSubmissions, setSubmissionStatus, AGENT_ENDPOINT, AGENT_ANON_KEY } from './agentInbox.js';
import PdfPlacementEditor from './PdfPlacementEditor.jsx';
import {
  extractDocument,
  extractFamilyDocument,
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
  const [groqKey, setGroqKeyS] = useState(getGroqKey());
  const [groqText, setGroqTextS] = useState(getGroqTextModel());
  const [groqVision, setGroqVisionS] = useState(getGroqVisionModel());
  const [signUrl, setSignUrl] = useState(getSigningUrl());
  const [busy, setBusy] = useState('');
  const importRef = useRef(null);

  function save() {
    setGeminiKey(key.trim());
    setGeminiModel(model.trim());
    setGroqKey(groqKey.trim());
    setGroqTextModel(groqText.trim());
    setGroqVisionModel(groqVision.trim());
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
          מספיק להזין מפתח אחד (Groq או Gemini) כדי שהמערכת תקרא דרכון/ת.ז ותמלא שדות. אם הוזנו שניהם — Groq בשימוש. המפתח נשמר במכשיר בלבד.
        </p>
        <label className="tik-field" style={{ marginTop: 10 }}>
          <span>מפתח Groq API (מתחיל ב-gsk_)</span>
          <input className="text-input" dir="ltr" type="password" value={groqKey} placeholder="gsk_…" onChange={(e) => setGroqKeyS(e.target.value)} />
        </label>
        <div className="tik-grid" style={{ marginTop: 8 }}>
          <label className="tik-field">
            <span>דגם Groq — טקסט</span>
            <input className="text-input" dir="ltr" value={groqText} onChange={(e) => setGroqTextS(e.target.value)} />
          </label>
          <label className="tik-field">
            <span>דגם Groq — תמונות</span>
            <input className="text-input" dir="ltr" value={groqVision} onChange={(e) => setGroqVisionS(e.target.value)} />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          לחלופין — מפתח Gemini (חינמי ב-Google AI Studio, aistudio.google.com/apikey):
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
          <span>דגם (ברירת מחדל: gemini-2.5-flash)</span>
          <input
            className="text-input"
            dir="ltr"
            value={model}
            placeholder="gemini-2.5-flash"
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
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

  const reload = () => listNewSubmissions().then((r) => { setItems(r); setErr(''); }).catch((e) => { setItems([]); setErr(e?.message || String(e)); });
  useEffect(() => { reload(); }, []);

  async function importOne(sub, type) {
    setBusyId(sub.id);
    try {
      const rec = recordFromSubmission(sub.data || {}, type);
      if (type === 'family') await saveFamily(rec); else await saveWorker(rec);
      await setSubmissionStatus(sub.id, 'imported');
      await reload();
      onImported && onImported();
    } catch (e) { alert('הייבוא נכשל: ' + (e?.message || e)); }
    finally { setBusyId(null); }
  }
  async function dismiss(sub) {
    setBusyId(sub.id);
    try { await setSubmissionStatus(sub.id, 'dismissed'); await reload(); }
    catch (e) { alert(e?.message || String(e)); }
    finally { setBusyId(null); }
  }
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
  const summary = (d) => [d.nameHe, d.fullName, d.nameEn, d.passportNo && 'דרכון ' + d.passportNo, d.idNumber && 'ת.ז ' + d.idNumber].filter(Boolean).join(' · ') || 'הגשה';

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
                  <div className="tik-doc-name">{summary(s.data || {})}</div>
                  <div className="tik-doc-meta">{s.kind === 'family' ? 'משפחה' : 'עובד'} · {fmt(s.created_at)}</div>
                </div>
                <div className="tik-sub-actions">
                  <button className="btn-primary sm" disabled={busyId === s.id} onClick={() => importOne(s, 'worker')}>ייבא כעובד</button>
                  <button className="btn-ghost sm" disabled={busyId === s.id} onClick={() => importOne(s, 'family')}>ייבא כמשפחה</button>
                  <button className="icon-btn" title="התעלם" disabled={busyId === s.id} onClick={() => dismiss(s)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WorkerList({ mode, onMode, onOpen, onNew, onLogout }) {
  const [workers, setWorkers] = useState(null);
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
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
      [w.nameHe, w.nameEn, w.passportNo, w.nationality, w.patientName]
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
      <div className="tik-list">
        <ModeTabs mode={mode} onMode={onMode} />
        <div className="tik-list-head">
          <h2 style={{ margin: 0 }}>תיקי עובדים</h2>
          <div className="tik-head-actions">
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
                    <span className="req-title">{w.nameHe || w.nameEn || 'ללא שם'}</span>
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Small copy-to-clipboard button placed beside every field, so each value can
// be pasted into the Tik-Tak system with one click.
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

function WorkerEditor({ workerId, onBack, onDeleted }) {
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
      alert('כדי לקרוא מסמכים אוטומטית צריך מפתח AI (Groq או Gemini). פותח את ההגדרות…');
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
            <F label="שם בעברית" value={worker.nameHe} onChange={(v) => set({ nameHe: v })} />
            <F label="שם באנגלית" value={worker.nameEn} onChange={(v) => set({ nameEn: v })} dir="ltr" />
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
            <F label="טלפון נייד" value={worker.phone} onChange={(v) => set({ phone: v })} dir="ltr" />
            <F label="אימייל" value={worker.email} onChange={(v) => set({ email: v })} dir="ltr" />
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
          </div>
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
            <button className="btn-primary" onClick={persist} disabled={saving}>
              {saving ? 'שומר…' : '💾 שמור תיק'}
            </button>
          </div>
        </div>
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
    ['fullName', 'שם מלא'], ['idNumber', 'ת.זהות', 'text', 'ltr'], ['dob', 'ת.לידה', 'date', 'ltr'],
    ['gender', 'מין'], ['maritalStatus', 'מצב משפחתי'], ['city', 'יישוב'], ['street', 'רחוב'],
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
    ['permitExpiry', 'תוקף היתר', 'date', 'ltr'],
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

function FamilyList({ mode, onMode, onOpen, onNew, onLogout }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  const reloadFamilies = () => listFamilies().then(setItems);
  useEffect(() => { reloadFamilies(); }, []);
  useEffect(() => { countNewSubmissions().then(setInboxCount).catch(() => {}); }, [showInbox]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((f) =>
      [f.fullName, f.idNumber, f.city, f.contactName, f.clientNo]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <div className="app">
      <Header onLogout={onLogout} onSettings={() => setShowSettings(true)} />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showInbox && <AgentInbox onClose={() => setShowInbox(false)} onImported={reloadFamilies} />}
      <div className="tik-list">
        <ModeTabs mode={mode} onMode={onMode} />
        <div className="tik-list-head">
          <h2 style={{ margin: 0 }}>תיקי משפחות</h2>
          <div className="tik-head-actions">
            <button className="btn-ghost" onClick={() => setShowInbox(true)}>📥 הגשות{inboxCount ? ` (${inboxCount})` : ''}</button>
            <button className="btn-primary" onClick={onNew}>➕ משפחה חדשה</button>
          </div>
        </div>
        <input
          className="text-input"
          placeholder="חיפוש לפי שם, ת.ז, יישוב או איש קשר…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ margin: '12px 0' }}
        />
        {items === null && <p className="muted">טוען…</p>}
        {items && !items.length && (
          <div className="card tik-empty"><p className="muted">עדיין אין תיקי משפחות. לחץ «משפחה חדשה» כדי לפתוח תיק.</p></div>
        )}
        {filtered.length > 0 && (
          <ul className="req-list">
            {filtered.map((f) => (
              <li key={f.id} className="req-item" onClick={() => onOpen(f.id)}>
                <div className="req-main">
                  <span className="req-title">{f.fullName || 'ללא שם'}</span>
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
      </div>
    </div>
  );
}

function FamilyEditor({ familyId, onBack, onDeleted }) {
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
  const isNew = familyId == null;
  const FAM_LABELS = {
    fullName: 'שם מלא', idNumber: 'ת.ז', dob: 'ת.לידה', gender: 'מין', city: 'יישוב',
    street: 'רחוב', zip: 'מיקוד', phone: 'טלפון', contactName: 'איש קשר',
    contactMobile: 'נייד א.קשר', permitExpiry: 'תוקף היתר', insuranceExpiry: 'תוקף ביטוח',
  };

  useEffect(() => {
    if (isNew) { setFamily(emptyFamily()); setFiles([]); }
    else { getFamily(familyId).then((f) => setFamily(f || emptyFamily())); listFiles(familyId).then(setFiles); }
    listWorkers().then(setWorkers);
  }, [familyId, isNew]);

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
    if (!hasAI()) { alert('כדי לקרוא מסמכים אוטומטית צריך מפתח AI — Groq או Gemini (⚙ הגדרות).'); return; }
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

  return (
    <div className="app">
      <Header onLogout={null} right={<button className="header-settings" onClick={onBack}>‹ חזרה לרשימה</button>} />
      <div className="tik-editor">
        <div className="tik-renewal">
          <div>
            <strong>📄 הפקת חוזה</strong>
            <div className="muted small">החוזה משלב את פרטי המשפחה ואת פרטי העובד/ת המקושר/ת ב«השמה נוכחית».</div>
          </div>
          <button className="btn-primary" onClick={openContractPicker} disabled={makingContract}>
            {makingContract ? 'מפיק…' : '📄 הפק חוזה'}
          </button>
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
            <button className="btn-ghost" disabled={busyUpload} onClick={() => fileInput.current?.click()}>
              {busyUpload ? 'מעלה…' : '⬆ העלאת קובץ (תמונה / PDF)'}
            </button>
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={onPickFiles} />
          </div>
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
            <button className="btn-primary" onClick={persist} disabled={saving}>{saving ? 'שומר…' : '💾 שמור תיק'}</button>
          </div>
        </div>
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
      />
    );
  }
  if (view.screen === 'editFamily') {
    return (
      <FamilyEditor
        familyId={view.id}
        onBack={() => setView({ screen: 'list' })}
        onDeleted={() => setView({ screen: 'list' })}
      />
    );
  }

  if (mode === 'families') {
    return (
      <FamilyList
        mode={mode}
        onMode={setMode}
        onOpen={(id) => setView({ screen: 'editFamily', id })}
        onNew={() => setView({ screen: 'editFamily', id: null })}
        onLogout={logout}
      />
    );
  }

  return (
    <WorkerList
      mode={mode}
      onMode={setMode}
      onOpen={(id) => setView({ screen: 'editWorker', id })}
      onNew={() => setView({ screen: 'editWorker', id: null })}
      onLogout={logout}
    />
  );
}
