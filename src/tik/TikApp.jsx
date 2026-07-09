import { useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { buildContractPdf } from './contractPdf.js';
import {
  emptyWorker,
  listWorkers,
  getWorker,
  saveWorker,
  deleteWorker,
  listFiles,
  addFile,
  duplicateFile,
  deleteFile,
  fileObjectUrl,
} from './workerFilesApi.js';
import {
  extractDocument,
  getGeminiKey,
  setGeminiKey,
  getGeminiModel,
  setGeminiModel,
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
const catLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label || 'מסמך';
const catIcon = (k) => CATEGORIES.find((c) => c.key === k)?.icon || '📎';

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

  function save() {
    setGeminiKey(key.trim());
    setGeminiModel(model.trim());
    onClose();
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="drawer tik-settings" onPointerDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>⚙ הגדרות</strong>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>קריאה אוטומטית של מסמכים (Gemini)</h3>
        <p className="muted small">
          כדי שהמערכת תקרא דרכון/אשרה ותמלא את השדות אוטומטית, הזן/י מפתח Gemini.
          מפתח חינמי מתקבל ב-Google AI Studio (aistudio.google.com/apikey). המפתח נשמר במכשיר בלבד.
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
        <div className="card-actions" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={save}>שמור</button>
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
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

function WorkerList({ onOpen, onNew, onLogout }) {
  const [workers, setWorkers] = useState(null);
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);

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
      <div className="tik-list">
        <div className="tik-list-head">
          <h2 style={{ margin: 0 }}>תיקי עובדים</h2>
          <button className="btn-primary" onClick={onNew}>➕ עובד חדש</button>
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

function DocRow({ file, onView, onChanged, onExtract, extracting }) {
  const [copied, setCopied] = useState(false);
  const isImage = file.mime?.startsWith('image/');
  const canExtract = isImage && ['passport', 'visa', 'permit'].includes(file.category);

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
      if (img && ['passport', 'visa', 'permit'].includes(uploadCat) && getGeminiKey()) {
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
    if (!getGeminiKey()) {
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

  async function makeContract() {
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
          <button className="btn-primary" onClick={makeContract} disabled={makingContract}>
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
  const [view, setView] = useState({ screen: 'list' }); // {screen:'list'} | {screen:'edit', id}

  function logout() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setAuthed(false);
  }

  if (!authed) return <Gate onEnter={() => setAuthed(true)} />;

  if (view.screen === 'edit') {
    return (
      <WorkerEditor
        workerId={view.id}
        onBack={() => setView({ screen: 'list' })}
        onDeleted={() => setView({ screen: 'list' })}
      />
    );
  }

  return (
    <WorkerList
      onOpen={(id) => setView({ screen: 'edit', id })}
      onNew={() => setView({ screen: 'edit', id: null })}
      onLogout={logout}
    />
  );
}
