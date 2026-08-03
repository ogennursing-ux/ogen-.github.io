import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry, searchWorkers, searchFamilies } from './registry.js';
import {
  SOURCE_FIELDS, scanDocxTokens, fillTemplateForCase, bytesToBase64,
  listTemplates, saveTemplate, deleteTemplate,
} from './contractTemplates.js';

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>📑 תבניות חוזים</h2>
        <label className="field-label">שם משתמש</label>
        <input className="text-input" value={user} autoFocus onChange={(e) => setUser(e.target.value)} />
        <label className="field-label" style={{ marginTop: 10 }}>סיסמה</label>
        <input className="text-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <p className="login-error">שם משתמש או סיסמה שגויים</p>}
        <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>התחבר</button>
      </form>
    </div>
  );
}

const ALL_SRC = SOURCE_FIELDS.flatMap((g) => g.keys);
// Guess a binding: token equals a field key or its Hebrew label.
function guessSource(token) {
  const t = token.trim().toLowerCase();
  const hit = ALL_SRC.find((f) => f.key.toLowerCase() === t || f.label === token.trim());
  return hit ? hit.key : '';
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// Pick a case to fill a template for.
function CasePicker({ onPick, onClose }) {
  const [cases, setCases] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { loadRegistry().then(setCases).catch(() => setCases([])); }, []);
  const list = useMemo(() => {
    if (!cases) return [];
    const w = searchWorkers(cases, q); const seen = new Set(w.map((c) => c.id));
    return [...w, ...searchFamilies(cases, q).filter((c) => !seen.has(c.id))].slice(0, 40);
  }, [cases, q]);
  return (
    <div className="aid-overlay" onClick={onClose}>
      <div className="aid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aid-head"><h3>בחר/י תיק למילוי</h3><button className="aid-x" onClick={onClose}>✕</button></div>
        <input className="text-input" placeholder="חיפוש עובד/משפחה…" value={q} onChange={(e) => setQ(e.target.value)} />
        {cases === null ? <p className="muted">טוען…</p> : (
          <div className="mn-list" style={{ marginTop: 10 }}>
            {list.map((c) => (
              <button key={c.id} className="mn-item" onClick={() => onPick(c)}>
                <b>{c.worker?.nameEn || c.worker?.nameHe || c.family?.fullName || '—'}</b>
                <span>{c.family?.fullName || ''} {c.worker?.passportNo ? '· ' + c.worker.passportNo : ''}</span>
              </button>
            ))}
            {!list.length && <p className="muted">לא נמצא.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Uploader({ onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [tokens, setTokens] = useState(null);
  const [mapping, setMapping] = useState({});
  const [docxBase64, setDocxBase64] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const found = await scanDocxTokens(buf);
      setDocxBase64(bytesToBase64(buf));
      setTokens(found);
      const init = {}; for (const t of found) init[t] = guessSource(t);
      setMapping(init);
      if (!name) setName(file.name.replace(/\.docx$/i, ''));
    } catch (e2) { setErr('קריאת הקובץ נכשלה. ודא/י שזה קובץ Word ‎.docx. ' + (e2?.message || '')); }
    finally { setBusy(false); }
  }

  const mappedCount = tokens ? tokens.filter((t) => mapping[t]).length : 0;

  async function save() {
    setBusy(true); setErr('');
    try { await saveTemplate({ name: name.trim() || 'תבנית', docxBase64, mapping, tokens }); onSaved(); }
    catch (e2) { setErr(e2?.message || String(e2)); }
    finally { setBusy(false); }
  }

  return (
    <div className="ct-panel">
      <div className="ct-panel-head"><h3>העלאת תבנית חדשה</h3><button className="rp-btn ghost sm" onClick={onCancel}>ביטול</button></div>
      <label className="ct-file">
        <input type="file" accept=".docx" onChange={onFile} />
        <span>📎 בחר/י קובץ חוזה (‎.docx) עם שדות בסגנון <code dir="ltr">{'{{שדה}}'}</code></span>
      </label>
      {busy && !tokens && <p className="muted">סורק…</p>}
      {err && <p className="aid-warn">{err}</p>}

      {tokens && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>שם התבנית</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />

          <p className="ct-count">זוהו <b>{tokens.length}</b> שדות · הוצמדו <b>{mappedCount}</b>. הצמד/י כל שדה למקור במערכת:</p>
          {tokens.length === 0 && <p className="muted">לא זוהו שדות בסגנון {'{{...}}'}. ודא/י שהחוזה מכיל אותם.</p>}
          <div className="ct-map">
            {tokens.map((t) => (
              <div key={t} className="ct-row">
                <code className="ct-token">{`{{${t}}}`}</code>
                <span className="ct-arrow">←</span>
                <select className="ct-select" value={mapping[t] || ''} onChange={(e) => setMapping((m) => ({ ...m, [t]: e.target.value }))}>
                  <option value="">— השאר ריק —</option>
                  {SOURCE_FIELDS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.keys.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button className="rp-btn" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? 'שומר…' : '💾 שמור תבנית'}</button>
        </>
      )}
    </div>
  );
}

function Desk() {
  const [templates, setTemplates] = useState(null);
  const [view, setView] = useState('list');
  const [picking, setPicking] = useState(null); // template being filled
  const [msg, setMsg] = useState('');

  const reload = () => listTemplates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => { reload(); }, []);

  async function fillFor(tpl, caseObj) {
    setPicking(null); setMsg('ממלא…');
    try {
      const blob = await fillTemplateForCase(tpl, caseObj);
      const who = caseObj.worker?.nameEn || caseObj.family?.fullName || 'חוזה';
      download(blob, `${tpl.name} — ${who}.docx`);
      setMsg('✓ הקובץ הורד');
    } catch (e) { setMsg('נכשל: ' + (e?.message || e)); }
    setTimeout(() => setMsg(''), 3000);
  }

  return (
    <div className="ct-wrap">
      <header className="mn-head">
        <div>
          <h1>📑 תבניות חוזים</h1>
          <p className="mn-sub">העלה/י חוזה, הצמד/י את שדותיו למקורות במערכת, ומאז הוא מתמלא לבד לכל תיק.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {msg && <div className="ct-msg">{msg}</div>}

      {view === 'new' ? (
        <Uploader onSaved={() => { setView('list'); reload(); }} onCancel={() => setView('list')} />
      ) : (
        <>
          <button className="rp-btn matash" onClick={() => setView('new')}>➕ העלאת תבנית חדשה</button>
          {templates === null ? <p className="muted" style={{ marginTop: 16 }}>טוען…</p> : templates.length === 0 ? (
            <p className="muted" style={{ marginTop: 16 }}>אין עדיין תבניות. העלה/י חוזה ראשון.</p>
          ) : (
            <div className="ct-list">
              {templates.map((t) => (
                <div key={t.id} className="ct-card">
                  <div>
                    <b>{t.name}</b>
                    <span>{(t.tokens || []).length} שדות · {Object.values(t.mapping || {}).filter(Boolean).length} מוצמדים</span>
                  </div>
                  <div className="ct-card-actions">
                    <button className="rp-btn sm" onClick={() => setPicking(t)}>📝 מלא לפי תיק</button>
                    <button className="rp-btn ghost sm" onClick={async () => { if (confirm('למחוק את התבנית?')) { await deleteTemplate(t.id); reload(); } }}>מחק</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picking && <CasePicker onPick={(c) => fillFor(picking, c)} onClose={() => setPicking(null)} />}
    </div>
  );
}

export default function ContractTemplates() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  return <Desk />;
}
