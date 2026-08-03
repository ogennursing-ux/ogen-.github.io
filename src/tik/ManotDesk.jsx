import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry, searchWorkers } from './registry.js';
import {
  MANOT, MANOT_ACTIONS, extractManotData, buildRecordLine, manotCoverLetter, downloadManotFile,
} from './manot.js';

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>📮 מנות — רשות האוכלוסין</h2>
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

const hashCase = () => new URLSearchParams((location.hash.split('?')[1] || '')).get('case') || '';

function CopyBtn({ text, label = '📋 העתק' }) {
  const [done, setDone] = useState(false);
  return (
    <button className="rp-btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
      catch { /* clipboard blocked — the text is on screen to copy by hand */ }
    }}>{done ? '✓ הועתק' : label}</button>
  );
}

// A monospace ruler so the fixed-width columns can be checked against a real file.
function Ruler({ len = 80 }) {
  let s = '';
  for (let i = 0; i < len; i += 10) s += String(i).padEnd(10, '·');
  return <pre className="mn-ruler">{s.slice(0, len)}</pre>;
}

function Desk() {
  const [cases, setCases] = useState(null);
  const [q, setQ] = useState('');
  const [caseId, setCaseId] = useState(hashCase());
  const [action, setAction] = useState('transfer');
  const [ov, setOv] = useState({}); // manual overrides: countryCode, citySymbol, origin*

  useEffect(() => { loadRegistry().then(setCases).catch((e) => { console.error(e); setCases([]); }); }, []);

  const workers = useMemo(() => (cases ? searchWorkers(cases, q) : []), [cases, q]);
  const selected = useMemo(() => (cases || []).find((c) => c.id === caseId) || null, [cases, caseId]);

  const data = useMemo(() => (selected ? extractManotData(selected, ov) : null), [selected, ov]);
  const act = MANOT_ACTIONS[action];
  const line = useMemo(() => (data ? buildRecordLine(action, data) : ''), [data, action]);
  const letter = useMemo(() => (data ? manotCoverLetter(action, data) : null), [data, action]);

  const setField = (k, v) => setOv((o) => ({ ...o, [k]: v }));

  return (
    <div className="mn-wrap">
      <header className="mn-head">
        <div>
          <h1>📮 מנות — שידור לרשות האוכלוסין</h1>
          <p className="mn-sub">בחר/י עובד ופעולה — המערכת מפיקה את קובץ המנה (Windows-1255) ואת מכתב הלוואי התואם.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {!MANOT.calibrated && (
        <div className="mn-warn">
          ⚠️ <b>טרם כויל מול קובץ אמיתי.</b> מכתב הלוואי, קוד הפעולה והקידוד מדויקים — אך מיקומי העמודות
          בשורת ה-704 הם שחזור זמני. <b>אל תשדר קובץ אמיתי</b> לפני שנוודא אותו מול קובץ .txt מקורי אחד.
        </div>
      )}

      <div className="mn-grid">
        <section className="mn-panel">
          <h3>1 · בחירת עובד</h3>
          <input className="text-input" placeholder="חיפוש לפי שם / דרכון…" value={q} onChange={(e) => setQ(e.target.value)} />
          {cases === null ? <p className="muted">טוען…</p> : (
            <div className="mn-list">
              {workers.slice(0, 40).map((c) => (
                <button key={c.id} className={`mn-item${c.id === caseId ? ' on' : ''}`} onClick={() => setCaseId(c.id)}>
                  <b>{c.worker?.nameEn || c.worker?.nameHe || '—'}</b>
                  <span>{c.worker?.passportNo || ''} · {c.family?.fullName || ''}</span>
                </button>
              ))}
              {!workers.length && <p className="muted">לא נמצאו עובדים.</p>}
            </div>
          )}
        </section>

        <section className="mn-panel">
          <h3>2 · סוג הפעולה</h3>
          <div className="mn-actions">
            {Object.entries(MANOT_ACTIONS).map(([k, a]) => (
              <label key={k} className={`mn-radio${action === k ? ' on' : ''}`}>
                <input type="radio" name="action" checked={action === k} onChange={() => setAction(k)} />
                <span><b>{a.label}</b><em>קוד {a.code}</em></span>
              </label>
            ))}
          </div>

          {selected && (
            <>
              <h3 style={{ marginTop: 18 }}>3 · השלמת קודים</h3>
              <div className="mn-fields">
                <label>קוד מדינת מוצא
                  <input className="text-input" value={data.countryCode || ''} placeholder="למשל 110"
                    onChange={(e) => setField('countryCode', e.target.value)} />
                </label>
                <label>סמל יישוב (מעסיק)
                  <input className="text-input" value={data.citySymbol || ''} placeholder="למשל 6100"
                    onChange={(e) => setField('citySymbol', e.target.value)} />
                </label>
                {act.foreignAddress && (
                  <>
                    <label>עיר במדינת המוצא
                      <input className="text-input" value={data.originCity || ''} onChange={(e) => setField('originCity', e.target.value)} />
                    </label>
                    <label>אזור במדינת המוצא
                      <input className="text-input" value={data.originArea || ''} onChange={(e) => setField('originArea', e.target.value)} />
                    </label>
                    <label>מיקוד במדינת המוצא
                      <input className="text-input" value={data.originPostal || ''} onChange={(e) => setField('originPostal', e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {selected && data && (
        <>
          <section className="mn-panel mn-out">
            <div className="mn-out-head">
              <h3>מכתב הלוואי (גוף המייל)</h3>
              <CopyBtn text={letter.body} label="📋 העתק מייל" />
            </div>
            <pre className="mn-letter">{letter.body}</pre>
          </section>

          <section className="mn-panel mn-out">
            <div className="mn-out-head">
              <h3>קובץ המנה — שורת הנתונים ({line.length} תווים)</h3>
              <button className="rp-btn matash" onClick={() => downloadManotFile([{ action, data }])}>
                ⬇️ הורד קובץ {MANOT.filePrefix}_01.txt
              </button>
            </div>
            <div className="mn-record-scroll">
              <Ruler len={Math.min(line.length, 720)} />
              <pre className="mn-record">{line}</pre>
            </div>
            <p className="mn-note">שם קובץ: <code>{MANOT.filePrefix}_XX.txt</code> · קידוד Windows-1255 · שורת סוגר: <code>{MANOT.footer}</code></p>
          </section>
        </>
      )}
    </div>
  );
}

export default function ManotDesk() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  return <Desk />;
}
