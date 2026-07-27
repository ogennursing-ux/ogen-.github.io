import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadRegistry, searchFamilies, searchWorkers, computeRenewals, saveRenewalDate,
  loadLeads, createLead, convertLeadToCase, dismissLead,
} from './registry.js';
import { getOrAssignCaseNumber, payments } from './caseDetail.js';
import RecordPage from './RecordPage.jsx';

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

const fmtDate = (d) => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};

function downloadCsv(filename, header, rows) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const body = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const STAGE_PILL = {
  signed: ['חתום', 'ok'], ready: ['מוכן', 'info'], missing: ['חסר', 'warn'],
  sent: ['נשלח', 'info'], partial: ['נחתם חלקית', 'info'],
};
function Pill({ stage }) {
  const [label, tone] = STAGE_PILL[stage] || ['—', 'muted'];
  return <span className={`rg-pill ${tone}`}>{label}</span>;
}

// Days-until badge for a renewal date shown inside the directory table.
function DateCell({ value }) {
  if (!value) return <span className="rg-muted">—</span>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span className="rg-muted">—</span>;
  const days = Math.round((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const tone = days < 0 ? 'bad' : days < 60 ? 'warn' : 'ok';
  return <span className={`rg-date ${tone}`}>{fmtDate(d)}</span>;
}

function LeadsTab({ leads, onChanged }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!form.name && !form.phone) return;
    setBusy(true);
    try { await createLead(form); setForm({}); onChanged(); }
    catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="rp-inline-form" style={{ marginBottom: 16 }}>
        <input placeholder="שם" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="טלפון" dir="ltr" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="מקור" value={form.referrer || ''} onChange={(e) => setForm({ ...form, referrer: e.target.value })} />
        <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="rp-btn" disabled={busy || (!form.name && !form.phone)} onClick={add}>+ הוסף פנייה</button>
      </div>
      {leads.length ? (
        <div className="rg-tablewrap">
          <table className="rg-table">
            <thead><tr><th>שם</th><th>טלפון</th><th>מקור</th><th>הערה</th><th></th></tr></thead>
            <tbody>{leads.map((l) => {
              const f = l.data?.fields || {};
              return (
                <tr key={l.id}>
                  <td><b>{f.name || '—'}</b></td>
                  <td dir="ltr">{f.phone || '—'}</td>
                  <td>{f.referrer || '—'}</td>
                  <td className="rg-muted">{f.note || '—'}</td>
                  <td className="rg-row-actions">
                    <button className="rp-btn ghost sm" onClick={async () => { if (confirm('להפוך לתיק פעיל?')) { await convertLeadToCase(l); onChanged(); } }}>➡️ לתיק</button>
                    <button className="rp-btn ghost sm" onClick={async () => { if (confirm('להסיר?')) { await dismissLead(l); onChanged(); } }}>✕</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <p className="rg-empty">אין פניות פתוחות.</p>}
    </>
  );
}

export default function RegistryApp() {
  const [authed, setAuthed] = useState(isAuthed());
  const [cases, setCases] = useState(null);
  const [leads, setLeads] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('families');
  const [q, setQ] = useState('');
  const [renewFilter, setRenewFilter] = useState('all');
  const [rakazFilter, setRakazFilter] = useState('');
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, ''));

  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const reload = () => Promise.all([
    loadRegistry().then((r) => { setCases(r); setErr(''); }).catch((e) => { setCases([]); setErr(e?.message || String(e)); }),
    loadLeads().then(setLeads).catch(() => setLeads([])),
  ]);
  useEffect(() => { if (authed) reload(); }, [authed]);

  const rakazim = useMemo(() => {
    const s = new Set();
    for (const c of cases || []) { const r = c.data?.fields?.assignedTo; if (r) s.add(r); }
    return [...s].sort();
  }, [cases]);

  const byRakaz = (list) => (rakazFilter ? list.filter((c) => c.data?.fields?.assignedTo === rakazFilter) : list);
  const families = useMemo(() => (cases ? byRakaz(searchFamilies(cases, q)) : []), [cases, q, rakazFilter]);
  const workers = useMemo(() => (cases ? byRakaz(searchWorkers(cases, q)) : []), [cases, q, rakazFilter]);
  const renewals = useMemo(() => (cases ? computeRenewals(byRakaz(cases)) : []), [cases, rakazFilter]);
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
  const revenue = useMemo(
    () => (cases || []).reduce((s, c) => s + payments(c).reduce((t, p) => t + (Number(p.amount) || 0), 0), 0),
    [cases],
  );

  // ---- record page routing (#registry/f/<id> | #registry/w/<id>) ----
  const m = /^registry\/(f|w)\/(.+)$/.exec(route);
  const openRecord = m && cases ? cases.find((c) => c.id === m[2]) : null;
  const openKind = m && m[1] === 'w' ? 'worker' : 'family';

  async function goRecord(c, kind) {
    try { await getOrAssignCaseNumber(c, cases || []); } catch { /* best effort */ }
    location.hash = `registry/${kind === 'worker' ? 'w' : 'f'}/${c.id}`;
    window.scrollTo(0, 0);
  }
  const goList = () => { location.hash = 'registry'; window.scrollTo(0, 0); };

  function exportCsv() {
    if (tab === 'workers') {
      downloadCsv('ogen-workers.csv',
        ['מס׳ תיק', 'שם עובד/ת', 'דרכון', 'אזרחות', 'טלפון', 'תוקף אשרה', 'תוקף דרכון', 'משפחה', 'רכז/ת'],
        workers.map((c) => { const f = c.data?.fields || {}; return [f.caseNumber || '', c.worker?.nameHe || c.worker?.nameEn || '',
          c.worker?.passportNo || '', c.worker?.nationality || '', c.worker?.phone || '',
          fmtDate(f.visaExpiry), fmtDate(f.passportExpiry), c.family?.fullName || '', f.assignedTo || '']; }));
    } else if (tab === 'renewals') {
      downloadCsv('ogen-renewals.csv', ['שם', 'סוג', 'תאריך', 'ימים שנותרו', 'סטטוס'],
        shownRenewals.map((r) => [r.name, r.type.label, r.due ? fmtDate(r.due) : '', r.daysLeft ?? '',
          r.overdue ? 'עבר תוקף' : r.urgent ? 'דחוף' : r.due ? 'תקין' : 'חסר תאריך']));
    } else {
      downloadCsv('ogen-families.csv',
        ['מס׳ תיק', 'שם', 'ת״ז', 'טלפון', 'ישוב', 'עובד/ת', 'רכז/ת', 'סה״כ שולם'],
        families.map((c) => { const f = c.data?.fields || {}; return [f.caseNumber || '', c.family?.fullName || '',
          c.family?.idNumber || '', c.family?.phone || '', c.family?.city || '',
          c.worker?.nameHe || c.worker?.nameEn || '', f.assignedTo || '',
          payments(c).reduce((s, p) => s + (Number(p.amount) || 0), 0)]; }));
    }
  }

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  if (openRecord) {
    return (
      <div className="rg-shell">
        <RecordPage caseObj={openRecord} kind={openKind} onBack={goList} onChanged={reload} />
      </div>
    );
  }

  return (
    <div className="rg-shell">
      <header className="rg-header">
        <div className="rg-brand">
          <span className="rg-logo">⚓</span>
          <div>
            <h1>מערכת הרישום</h1>
            <p>{err ? '🔴 לא מחובר' : cases === null ? 'מתחבר…' : `🟢 מחובר · ${cases.length} תיקים`}</p>
          </div>
        </div>
        <div className="rg-header-actions">
          <button className="rp-btn ghost" onClick={reload}>↻ רענן</button>
          <button className="rp-btn ghost" onClick={() => { location.hash = 'board'; location.reload(); }}>מערכת החוזים ←</button>
        </div>
      </header>

      {cases && (
        <div className="rg-kpis">
          <div className="rg-kpi"><b>{families.length}</b><span>משפחות</span></div>
          <div className="rg-kpi"><b>{workers.length}</b><span>עובדים</span></div>
          <div className={`rg-kpi${renewCounts.overdue + renewCounts.urgent ? ' alert' : ''}`}><b>{renewCounts.overdue + renewCounts.urgent}</b><span>חידושים דחופים</span></div>
          <div className="rg-kpi"><b>{leads.length}</b><span>פניות פתוחות</span></div>
          <div className="rg-kpi"><b>{revenue.toLocaleString('he-IL')} ₪</b><span>סה״כ נגבה</span></div>
        </div>
      )}

      <nav className="rg-tabs">
        <button className={`rg-tab${tab === 'families' ? ' on' : ''}`} onClick={() => setTab('families')}>👨‍👩‍👧 משפחות <em>{families.length}</em></button>
        <button className={`rg-tab${tab === 'workers' ? ' on' : ''}`} onClick={() => setTab('workers')}>👷 עובדים <em>{workers.length}</em></button>
        <button className={`rg-tab${tab === 'renewals' ? ' on' : ''}`} onClick={() => setTab('renewals')}>
          🔔 דוח חידושים {renewCounts.overdue + renewCounts.urgent > 0 && <em className="alert">{renewCounts.overdue + renewCounts.urgent}</em>}
        </button>
        <button className={`rg-tab${tab === 'leads' ? ' on' : ''}`} onClick={() => setTab('leads')}>📞 פניות <em>{leads.length}</em></button>
      </nav>

      <div className="rg-toolbar">
        {tab !== 'renewals' && tab !== 'leads' && (
          <input className="rg-search" placeholder="🔍 חיפוש לפי שם / ת״ז / דרכון / טלפון…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        {rakazim.length > 0 && tab !== 'leads' && (
          <select className="rg-select" value={rakazFilter} onChange={(e) => setRakazFilter(e.target.value)}>
            <option value="">כל הרכזים</option>
            {rakazim.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {tab !== 'leads' && <button className="rp-btn ghost" onClick={exportCsv}>⬇️ ייצוא Excel</button>}
      </div>

      {err && <p className="rg-err">{err}</p>}
      {cases === null && !err && <p className="rg-empty">טוען…</p>}

      {cases && tab === 'families' && (
        families.length ? (
          <div className="rg-tablewrap">
            <table className="rg-table">
              <thead><tr><th>#</th><th>שם המטופל / מעסיק</th><th>ת״ז</th><th>טלפון</th><th>ישוב</th><th>עובד/ת</th><th>רכז/ת</th><th>תוקף היתר</th><th>סטטוס</th></tr></thead>
              <tbody>{families.map((c) => { const f = c.data?.fields || {}; return (
                <tr key={c.id} onClick={() => goRecord(c, 'family')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.family?.fullName || 'ללא שם'}</b></td>
                  <td dir="ltr">{c.family?.idNumber || '—'}</td>
                  <td dir="ltr">{c.family?.phone || '—'}</td>
                  <td>{c.family?.city || '—'}</td>
                  <td className="rg-muted">{c.worker?.nameHe || c.worker?.nameEn || '—'}</td>
                  <td>{f.assignedTo || '—'}</td>
                  <td><DateCell value={f.permitExpiry} /></td>
                  <td><Pill stage={c.stage} /></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        ) : <p className="rg-empty">לא נמצאו משפחות.</p>
      )}

      {cases && tab === 'workers' && (
        workers.length ? (
          <div className="rg-tablewrap">
            <table className="rg-table">
              <thead><tr><th>#</th><th>שם העובד/ת</th><th>דרכון</th><th>אזרחות</th><th>טלפון</th><th>תוקף אשרה</th><th>תוקף דרכון</th><th>משפחה</th><th>סטטוס</th></tr></thead>
              <tbody>{workers.map((c) => { const f = c.data?.fields || {}; return (
                <tr key={c.id} onClick={() => goRecord(c, 'worker')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.worker?.nameHe || c.worker?.nameEn || 'ללא שם'}</b></td>
                  <td dir="ltr">{c.worker?.passportNo || '—'}</td>
                  <td>{c.worker?.nationality || '—'}</td>
                  <td dir="ltr">{c.worker?.phone || '—'}</td>
                  <td><DateCell value={f.visaExpiry} /></td>
                  <td><DateCell value={f.passportExpiry} /></td>
                  <td className="rg-muted">{c.family?.fullName || '—'}</td>
                  <td><Pill stage={c.stage} /></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        ) : <p className="rg-empty">לא נמצאו עובדים.</p>
      )}

      {cases && tab === 'renewals' && (
        <>
          <div className="rg-filters">
            <button className={`rg-chip${renewFilter === 'all' ? ' on' : ''}`} onClick={() => setRenewFilter('all')}>הכל ({renewals.length})</button>
            <button className={`rg-chip bad${renewFilter === 'overdue' ? ' on' : ''}`} onClick={() => setRenewFilter('overdue')}>עבר תוקף ({renewCounts.overdue})</button>
            <button className={`rg-chip warn${renewFilter === 'urgent' ? ' on' : ''}`} onClick={() => setRenewFilter('urgent')}>דחוף ({renewCounts.urgent})</button>
            <button className={`rg-chip${renewFilter === 'missing' ? ' on' : ''}`} onClick={() => setRenewFilter('missing')}>חסר תאריך ({renewCounts.missing})</button>
          </div>
          {shownRenewals.length ? (
            <div className="rg-tablewrap">
              <table className="rg-table">
                <thead><tr><th>שם</th><th>סוג החידוש</th><th>תאריך</th><th>מצב</th><th></th></tr></thead>
                <tbody>{shownRenewals.map((r) => (
                  <tr key={r.id} className={r.overdue ? 'rg-row-bad' : r.urgent ? 'rg-row-warn' : ''}>
                    <td onClick={() => goRecord(r.caseObj, 'family')} className="rg-link"><b>{r.name}</b></td>
                    <td>{r.type.icon} {r.type.label}</td>
                    <td>{r.due ? fmtDate(r.due) : <RenewalDateInput row={r} onSaved={reload} />}</td>
                    <td>{r.due ? (r.daysLeft >= 0 ? `בעוד ${r.daysLeft} ימים` : `עבר לפני ${-r.daysLeft} ימים`) : <span className="rg-muted">—</span>}</td>
                    <td>{r.overdue ? <span className="rg-pill bad">עבר תוקף</span> : r.urgent ? <span className="rg-pill warn">דחוף</span> : r.due ? <span className="rg-pill ok">תקין</span> : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rg-empty">אין פריטים בקטגוריה הזו.</p>}
        </>
      )}

      {tab === 'leads' && <LeadsTab leads={leads} onChanged={reload} />}

      <footer className="rg-foot"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></footer>
    </div>
  );
}

function RenewalDateInput({ row, onSaved }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <span className="rg-inline-date">
      <input type="date" value={val} onChange={(e) => setVal(e.target.value)} />
      <button className="rp-btn sm" disabled={!val || busy} onClick={async () => {
        setBusy(true);
        try { await saveRenewalDate(row.caseObj, row.type.key, val); onSaved(); }
        catch (e) { alert(e?.message || e); } finally { setBusy(false); }
      }}>שמור</button>
    </span>
  );
}
