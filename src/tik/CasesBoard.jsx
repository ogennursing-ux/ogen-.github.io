import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadCases, attachSigning, missingForCase, signProgress,
  STAGE_LABEL, STAGE_ORDER,
} from './casesBoard.js';
import { recordsFromChat } from './chatRecords.js';
import { buildFilledContract } from './filledContract.js';
import { createPlacementSigning, signingLink } from './signingBridge.js';

const APP_URL = location.origin + location.pathname; // the office app (for full details)

function Login({ onIn }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); };
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={submit}>
        <h2>📁 מערכת החוזים</h2>
        <p className="muted">כניסה עם פרטי המשרד.</p>
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

function caseName(c) {
  const f = c.data?.fields || {};
  return f.employerName || f.fullName || 'מקרה ללא שם';
}
function workerLine(c) {
  const f = c.data?.fields || {};
  const w = f.nameHe || f.nameEn;
  return [w && '👤 ' + w, f.passportNo && 'דרכון ' + f.passportNo].filter(Boolean).join(' · ');
}

function Card({ c, onCreate, busy }) {
  const [copied, setCopied] = useState(false);
  const link = c.data?.signLink || (c.data?.signRequestId ? signingLink(c.data.signRequestId) : '');
  const copy = () => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const prog = c.sign ? signProgress(c.sign) : null;
  const stageClass = { missing: 'miss', ready: 'ready', sent: 'sent', partial: 'sent', signed: 'signed' }[c.stage];

  return (
    <div className="board-card">
      <div className="board-card-top">
        <div className="board-who">
          <b>{caseName(c)}</b>
          <span>{workerLine(c) || 'ממתין לפרטים'}</span>
        </div>
        <div className={`board-bdg ${stageClass}`}>{STAGE_LABEL[c.stage]}</div>
      </div>

      <div className="board-card-body">
        {c.stage === 'missing' && (
          <div className="board-miss">
            <div className="t">חסר כדי לסגור את המקרה:</div>
            <ul>{c.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <div className="reason">→ המקרה לא סגור, לכן החוזה לא מוכן, ולכן <b>אין עדיין קישור לחתימה</b>.</div>
          </div>
        )}

        {c.stage === 'ready' && (
          <div className="board-ready">
            <div className="t">✓ כל הפרטים הושלמו — אפשר להפיק חוזה</div>
            <button className="btn-primary full" disabled={busy} onClick={() => onCreate(c)}>
              {busy ? 'מפיק חוזה…' : '📄 צור חוזה + קישור לחתימה'}
            </button>
          </div>
        )}

        {(c.stage === 'sent' || c.stage === 'partial' || c.stage === 'signed') && (
          <>
            {link && (
              <div className="board-linkrow">
                <input dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button onClick={copy}>{copied ? '✓' : '📋 העתק'}</button>
              </div>
            )}
            {prog && (
              <div className="board-prog">
                {prog.list.map((s, i) => (
                  <span key={i} className={s.signed ? 'ok' : 'wait'}>
                    {i === 0 ? 'מעסיק' : 'מטפל/ת'} {s.signed ? '✓ חתם' : '✗ ממתין'}
                  </span>
                ))}
              </div>
            )}
            <div className="board-actions">
              {link && <a className="board-link2" href={link} target="_blank" rel="noreferrer">🔗 פתח קישור חתימה</a>}
              {link && <a className="board-link2" href={`https://wa.me/?text=${encodeURIComponent('קישור לחתימה על החוזה: ' + link)}`} target="_blank" rel="noreferrer">💬 וואטסאפ</a>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CasesBoard() {
  const [authed, setAuthed] = useState(isAuthed());
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const reload = () => loadCases().then((r) => { setCases(r); setErr(''); }).catch((e) => { setCases([]); setErr(e?.message || String(e)); });
  useEffect(() => { if (authed) reload(); }, [authed]);

  async function onCreate(c) {
    setBusyId(c.id);
    try {
      const { worker, family } = recordsFromChat(c.data?.fields || {});
      const bytes = await buildFilledContract(family, worker, {});
      const { id, link } = await createPlacementSigning({
        pdfBytes: bytes,
        employerName: family.fullName,
        workerName: worker.nameEn || worker.nameHe || [worker.firstNameEn, worker.lastNameEn].filter(Boolean).join(' '),
      });
      await attachSigning(c, id, link);
      await reload();
    } catch (e) { alert('יצירת החוזה/הקישור נכשלה: ' + (e?.message || e)); }
    finally { setBusyId(null); }
  }

  const counts = useMemo(() => {
    const m = { all: 0, missing: 0, ready: 0, sent: 0, partial: 0, signed: 0 };
    for (const c of cases || []) { m.all++; m[c.stage] = (m[c.stage] || 0) + 1; }
    return m;
  }, [cases]);

  const shown = useMemo(() => {
    let list = cases || [];
    if (filter !== 'all') list = list.filter((c) => (filter === 'sent' ? (c.stage === 'sent' || c.stage === 'partial') : c.stage === filter));
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((c) => JSON.stringify(c.data?.fields || {}).toLowerCase().includes(s));
    return list;
  }, [cases, filter, q]);

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  const tabs = [
    ['all', `הכל (${counts.all})`],
    ['missing', `🟡 חסר (${counts.missing})`],
    ['ready', `🔵 מוכן (${counts.ready})`],
    ['sent', `✍️ נשלח (${counts.sent + counts.partial})`],
    ['signed', `✅ חתום (${counts.signed})`],
  ];

  return (
    <div className="board-wrap">
      <div className="board-head">
        <div>
          <h1>📁 מערכת החוזים — עוגן סיעוד</h1>
          <p>{err ? '🔴 לא מחובר למסד הנתונים' : cases === null ? 'מתחבר…' : `🟢 מחובר · ${counts.all} מקרים`}</p>
        </div>
        <button className="board-refresh" onClick={reload} title="רענן">↻</button>
      </div>

      <div className="board-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`board-tab${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div className="board-search">
        <input className="text-input" placeholder="🔍 חיפוש לפי שם / דרכון / טלפון…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="board-toapp" onClick={() => { location.hash = ''; location.reload(); }}>המשרד המלא ←</button>
      </div>

      {err && (/agent_submissions|schema cache|Could not find the table/i.test(err) ? (
        <div className="board-err">
          <b>המערכת עדיין לא חוברה למסד הנתונים.</b><br />
          יש להריץ פעם אחת את קובץ ההתקנה <code>supabase/schema.sql</code> ב‑Supabase
          (Dashboard → SQL Editor → Run). אחרי זה כל המקרים יופיעו כאן אוטומטית.
        </div>
      ) : (
        <p className="board-err">{err}</p>
      ))}
      {cases === null && !err && <p className="board-empty">טוען…</p>}
      {cases && !shown.length && !err && <p className="board-empty">אין מקרים בקטגוריה הזו.</p>}

      <div className="board-list">
        {shown.map((c) => <Card key={c.id} c={c} onCreate={onCreate} busy={busyId === c.id} />)}
      </div>

      <div className="board-legal"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></div>
    </div>
  );
}
