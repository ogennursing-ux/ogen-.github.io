import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry, searchFamilies, searchWorkers, computeRenewals, saveRenewalDate, RENEWAL_TYPES } from './registry.js';

function Login({ onIn }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); };
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={submit}>
        <h2>🗂️ מערכת הרישום</h2>
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

function fmtDate(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function FamilyCard({ c }) {
  const f = c.family || {};
  return (
    <div className="reg-card">
      <div className="reg-card-top">
        <b>{f.fullName || 'ללא שם'}</b>
        <span className="reg-badge">{c.stage === 'signed' ? '✅ חתום' : c.stage === 'missing' ? '🟡 חסר' : '🔵'}</span>
      </div>
      <div className="reg-line">{[f.idNumber && `ת״ז ${f.idNumber}`, f.phone].filter(Boolean).join(' · ')}</div>
      {(f.street || f.city) && <div className="reg-line muted">{[f.street, f.city].filter(Boolean).join(', ')}</div>}
      {(c.worker?.nameHe || c.worker?.nameEn) && <div className="reg-line muted">👷 {c.worker.nameHe || c.worker.nameEn}</div>}
    </div>
  );
}

function WorkerCard({ c }) {
  const w = c.worker || {};
  return (
    <div className="reg-card">
      <div className="reg-card-top">
        <b>{w.nameHe || w.nameEn || 'ללא שם'}</b>
        <span className="reg-badge">{c.stage === 'signed' ? '✅ חתום' : c.stage === 'missing' ? '🟡 חסר' : '🔵'}</span>
      </div>
      <div className="reg-line">{[w.passportNo && `דרכון ${w.passportNo}`, w.nationality, w.phone].filter(Boolean).join(' · ')}</div>
      {c.family?.fullName && <div className="reg-line muted">🏠 {c.family.fullName}</div>}
    </div>
  );
}

function RenewalRow({ row, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.raw ? row.raw.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  const cls = row.overdue ? 'overdue' : row.urgent ? 'urgent' : row.due ? 'ok' : 'missing';

  async function save() {
    if (!val) return;
    setBusy(true);
    try { await saveRenewalDate(row.caseObj, row.type.key, val); onSaved(); }
    catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); setEditing(false); }
  }

  return (
    <div className={`reg-renew-row ${cls}`}>
      <div className="reg-renew-icon">{row.type.icon}</div>
      <div className="reg-renew-mid">
        <div className="reg-renew-name">{row.name}</div>
        <div className="reg-renew-type">{row.type.label}</div>
      </div>
      <div className="reg-renew-right">
        {row.due ? (
          <>
            <div className="reg-renew-date">{fmtDate(row.due)}</div>
            <div className="reg-renew-days">
              {row.daysLeft >= 0 ? `בעוד ${row.daysLeft} ימים` : `עבר לפני ${-row.daysLeft} ימים`}
            </div>
          </>
        ) : editing ? (
          <div className="reg-renew-edit">
            <input type="date" value={val} onChange={(e) => setVal(e.target.value)} />
            <button disabled={busy || !val} onClick={save}>{busy ? '…' : 'שמור'}</button>
          </div>
        ) : (
          <button className="reg-renew-add" onClick={() => setEditing(true)}>+ הזן תאריך</button>
        )}
      </div>
    </div>
  );
}

export default function RegistryApp() {
  const [authed, setAuthed] = useState(isAuthed());
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('families');
  const [q, setQ] = useState('');
  const [renewFilter, setRenewFilter] = useState('all');

  const reload = () => loadRegistry().then((r) => { setCases(r); setErr(''); }).catch((e) => { setCases([]); setErr(e?.message || String(e)); });
  useEffect(() => { if (authed) reload(); }, [authed]);

  const families = useMemo(() => (cases ? searchFamilies(cases, q) : []), [cases, q]);
  const workers = useMemo(() => (cases ? searchWorkers(cases, q) : []), [cases, q]);
  const renewals = useMemo(() => (cases ? computeRenewals(cases) : []), [cases]);
  const renewCounts = useMemo(() => ({
    overdue: renewals.filter((r) => r.overdue).length,
    urgent: renewals.filter((r) => !r.overdue && r.urgent).length,
    missing: renewals.filter((r) => !r.due).length,
  }), [renewals]);
  const shownRenewals = useMemo(() => {
    if (renewFilter === 'overdue') return renewals.filter((r) => r.overdue);
    if (renewFilter === 'urgent') return renewals.filter((r) => !r.overdue && r.urgent);
    if (renewFilter === 'missing') return renewals.filter((r) => !r.due);
    return renewals;
  }, [renewals, renewFilter]);

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  return (
    <div className="board-wrap">
      <div className="board-head">
        <div>
          <h1>🗂️ מערכת הרישום — עוגן סיעוד</h1>
          <p>{err ? '🔴 לא מחובר למסד הנתונים' : cases === null ? 'מתחבר…' : `🟢 מחובר · ${cases.length} מקרים`}</p>
        </div>
        <button className="board-refresh" onClick={reload} title="רענן">↻</button>
      </div>

      <div className="board-tabs">
        <button className={`board-tab${tab === 'families' ? ' on' : ''}`} onClick={() => setTab('families')}>👨‍👩‍👧 משפחות ({families.length})</button>
        <button className={`board-tab${tab === 'workers' ? ' on' : ''}`} onClick={() => setTab('workers')}>👷 עובדים ({workers.length})</button>
        <button className={`board-tab${tab === 'renewals' ? ' on' : ''}`} onClick={() => setTab('renewals')}>
          🔔 דוח חידושים {renewCounts.overdue + renewCounts.urgent > 0 && <span className="reg-alert-dot">{renewCounts.overdue + renewCounts.urgent}</span>}
        </button>
      </div>

      <div className="board-search">
        {tab !== 'renewals' && (
          <input className="text-input" placeholder="🔍 חיפוש לפי שם / ת״ז / דרכון / טלפון…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        <button className="board-toapp" onClick={() => { location.hash = 'board'; location.reload(); }}>מערכת החוזים ←</button>
      </div>

      {err && <p className="board-err">{err}</p>}
      {cases === null && !err && <p className="board-empty">טוען…</p>}

      {cases && tab === 'families' && (
        families.length ? <div className="board-list">{families.map((c) => <FamilyCard key={c.id} c={c} />)}</div>
          : <p className="board-empty">לא נמצאו משפחות.</p>
      )}
      {cases && tab === 'workers' && (
        workers.length ? <div className="board-list">{workers.map((c) => <WorkerCard key={c.id} c={c} />)}</div>
          : <p className="board-empty">לא נמצאו עובדים.</p>
      )}
      {cases && tab === 'renewals' && (
        <>
          <div className="reg-renew-filters">
            <button className={`reg-rf${renewFilter === 'all' ? ' on' : ''}`} onClick={() => setRenewFilter('all')}>הכל ({renewals.length})</button>
            <button className={`reg-rf overdue${renewFilter === 'overdue' ? ' on' : ''}`} onClick={() => setRenewFilter('overdue')}>🔴 עבר תוקף ({renewCounts.overdue})</button>
            <button className={`reg-rf urgent${renewFilter === 'urgent' ? ' on' : ''}`} onClick={() => setRenewFilter('urgent')}>🟠 דחוף ({renewCounts.urgent})</button>
            <button className={`reg-rf missing${renewFilter === 'missing' ? ' on' : ''}`} onClick={() => setRenewFilter('missing')}>⚪ חסר תאריך ({renewCounts.missing})</button>
          </div>
          {shownRenewals.length ? (
            <div className="reg-renew-list">
              {shownRenewals.map((r) => <RenewalRow key={r.id} row={r} onSaved={reload} />)}
            </div>
          ) : <p className="board-empty">אין פריטים בקטגוריה הזו.</p>}
        </>
      )}

      <div className="board-legal"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></div>
    </div>
  );
}
