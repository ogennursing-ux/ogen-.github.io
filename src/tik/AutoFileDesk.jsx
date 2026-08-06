import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry } from './registry.js';
import { hasAI } from './gemini.js';
import { DOC_TYPES } from './caseDetail.js';
import { analyzeDocument, fileDocument, expiryOf } from './autoFile.js';

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>📂 תיוק אוטומטי</h2>
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

let SEQ = 0;

function Desk() {
  const [cases, setCases] = useState(null);
  const [items, setItems] = useState([]); // {key, file, status, ...analysis, caseId}

  useEffect(() => { loadRegistry().then(setCases).catch(() => setCases([])); }, []);

  const workers = useMemo(
    () => (cases || []).filter((c) => c.worker?.passportNo || c.worker?.nameEn || c.worker?.nameHe)
      .map((c) => ({ id: c.id, label: `${c.worker?.nameEn || c.worker?.nameHe || '—'}${c.worker?.passportNo ? ' · ' + c.worker.passportNo : ''}` })),
    [cases],
  );
  const caseById = (id) => (cases || []).find((c) => c.id === id);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      const key = `f${++SEQ}`;
      setItems((xs) => [...xs, { key, file, status: 'analyzing', docKey: 'passport', expiry: '', personName: '', passport: '', caseId: '', fields: {} }]);
      try {
        const a = await analyzeDocument(file, cases || []);
        setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...a, status: 'ready' } : it)));
      } catch (err) {
        setItems((xs) => xs.map((it) => (it.key === key ? { ...it, status: 'error', error: err?.message || String(err) } : it)));
      }
    }
  }

  const patch = (key, p) => setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...p } : it)));

  async function fileOne(it) {
    const c = caseById(it.caseId);
    if (!c) return;
    patch(it.key, { status: 'filing' });
    try { await fileDocument(it, c); patch(it.key, { status: 'done' }); }
    catch (e) { patch(it.key, { status: 'error', error: e?.message || String(e) }); }
  }

  const typeLabel = (k) => DOC_TYPES.find((t) => t.key === k)?.label || k;

  return (
    <div className="af-wrap">
      <header className="mn-head">
        <div>
          <h1>📂 תיוק אוטומטי של מסמכים</h1>
          <p className="mn-sub">גרור/י או בחר/י מסמכים (דרכון / ויזה / היתר / ביטוח). ה-AI קורא, מזהה את סוג המסמך ואת בעל התיק לפי הדרכון, ומתייק — אחרי אישורך.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {!hasAI() && <div className="aid-warn">לא הוגדר מפתח AI. היכנס/י ל-🤖 עוזר AI פעם אחת להזין מפתח.</div>}

      <label className="ct-file" style={{ marginTop: 14 }}>
        <input type="file" accept="image/*" multiple onChange={onFiles} />
        <span>📎 בחר/י מסמכים לתיוק — צילום/סריקה (JPG/PNG). אפשר כמה יחד.</span>
      </label>

      {cases === null && <p className="muted" style={{ marginTop: 12 }}>טוען תיקים…</p>}

      <div className="af-list">
        {items.map((it) => (
          <div key={it.key} className={`af-card af-${it.status}`}>
            <div className="af-main">
              <div className="af-name">{it.file.name}</div>
              {it.status === 'analyzing' && <div className="af-meta muted">🔎 קורא את המסמך…</div>}
              {it.status === 'error' && <div className="af-meta af-err">⚠️ {it.error}</div>}
              {(it.status === 'ready' || it.status === 'filing' || it.status === 'done') && (
                <div className="af-fields">
                  <label>סוג
                    <select value={it.docKey} disabled={it.status !== 'ready'}
                      onChange={(e) => patch(it.key, { docKey: e.target.value, expiry: expiryOf(e.target.value, it.fields) || it.expiry })}>
                      {DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                    </select>
                  </label>
                  <label>תוקף
                    <input type="date" value={it.expiry || ''} disabled={it.status !== 'ready'} onChange={(e) => patch(it.key, { expiry: e.target.value })} />
                  </label>
                  <label>שייך לתיק
                    <select value={it.caseId} disabled={it.status !== 'ready'} onChange={(e) => patch(it.key, { caseId: e.target.value })}>
                      <option value="">— בחר/י עובד/ת —</option>
                      {workers.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                  </label>
                  {it.personName && <div className="af-detected">זוהה: <b>{it.personName}</b>{it.passport ? ` · ${it.passport}` : ''}{it.caseId ? '' : ' · ⚠️ לא נמצא תיק תואם'}</div>}
                </div>
              )}
            </div>
            <div className="af-action">
              {it.status === 'done' ? <span className="af-done">✓ תויק</span>
                : it.status === 'filing' ? <span className="muted">מתייק…</span>
                : it.status === 'ready' ? <button className="rp-btn" disabled={!it.caseId} onClick={() => fileOne(it)}>📥 תייק</button>
                : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AutoFileDesk() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  return <Desk />;
}
