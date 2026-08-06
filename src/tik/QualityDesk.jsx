import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry } from './registry.js';
import { computeIssues } from './dataQuality.js';
import { openRecordTab } from './recordLink.js';

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>🔎 בדיקת תקינות</h2>
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

function Desk() {
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { loadRegistry().then(setCases).catch((e) => setErr(e?.message || String(e))); }, []);
  const issues = useMemo(() => (cases ? computeIssues(cases) : []), [cases]);
  const groups = [
    { key: 'critical', label: 'קריטי', icon: '⛔', tone: 'bad' },
    { key: 'warning', label: 'לבדיקה', icon: '⚠️', tone: 'warn' },
  ];
  const byGroup = (k) => issues.filter((i) => i.severity === k);

  return (
    <div className="q-wrap">
      <header className="mn-head">
        <div>
          <h1>🔎 בדיקת תקינות נתונים</h1>
          <p className="mn-sub">סריקה אוטומטית של כל התיקים — כפילויות, ת"ז שגויה, תאריכים לא הגיוניים ושדות חובה חסרים.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {err && <div className="aid-warn">שגיאה בטעינה: {err}</div>}
      {cases === null && !err && <p className="muted" style={{ marginTop: 16 }}>סורק…</p>}

      {cases && (
        issues.length === 0 ? (
          <div className="wl-empty"><div className="wl-empty-mark" aria-hidden>✓</div><p>הכל תקין</p><span>לא נמצאו בעיות בנתונים. 👍</span></div>
        ) : (
          <>
            <div className="wl-summary" style={{ maxWidth: 420 }}>
              <div className="wl-stat crit"><b>{byGroup('critical').length}</b><span>קריטי</span></div>
              <div className="wl-stat"><b>{byGroup('warning').length}</b><span>לבדיקה</span></div>
            </div>
            <div className="q-groups">
              {groups.map((g) => {
                const items = byGroup(g.key);
                if (!items.length) return null;
                return (
                  <section key={g.key} className="q-group" data-tone={g.tone}>
                    <h3>{g.icon} {g.label} <em>{items.length}</em></h3>
                    <ul className="q-list">
                      {items.map((it, i) => (
                        <li key={i} className="q-item" onClick={() => it.caseObj && openRecordTab(it.kind, it.caseObj.id)}>
                          <span className="q-text">{it.text}</span>
                          <span className="q-who">{it.caseObj?.worker?.nameEn || it.caseObj?.worker?.nameHe || it.caseObj?.family?.fullName || ''} ↗</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )
      )}
    </div>
  );
}

export default function QualityDesk() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  return <Desk />;
}
