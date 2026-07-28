import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadRegistry, searchFamilies, searchWorkers, computeRenewalRows, saveRenewalDate,
  loadLeads, createLead, convertLeadToCase, dismissLead, RENEWAL_TYPES,
  WORKER_PAYMENTS, activePlacements, buildReport, setWorkerPaymentDone,
} from './registry.js';
import { getOrAssignCaseNumber, payments } from './caseDetail.js';
import RecordPage from './RecordPage.jsx';
import SocialWorkerTab from './SocialWorkerTab.jsx';
import { buildVisitReport } from './socialWorker.js';

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
  const renewals = useMemo(() => (cases ? computeRenewalRows(byRakaz(cases)) : []), [cases, rakazFilter]);
  const renewCounts = useMemo(() => ({
    overdue: renewals.filter((r) => r.anyOverdue).length,
    urgent: renewals.filter((r) => !r.anyOverdue && r.anyUrgent).length,
    missing: renewals.filter((r) => r.anyMissing).length,
  }), [renewals]);
  const shownRenewals = useMemo(() => {
    if (renewFilter === 'overdue') return renewals.filter((r) => r.anyOverdue);
    if (renewFilter === 'urgent') return renewals.filter((r) => !r.anyOverdue && r.anyUrgent);
    if (renewFilter === 'missing') return renewals.filter((r) => r.anyMissing);
    return renewals;
  }, [renewals, renewFilter]);
  const placements = useMemo(() => (cases ? byRakaz(activePlacements(cases)) : []), [cases, rakazFilter]);
  const socialOverdue = useMemo(
    () => (cases ? buildVisitReport(activePlacements(cases)).filter((v) => v.overdue).length : 0),
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
      downloadCsv('ogen-renewals.csv',
        ['#', 'שם העובד/ת', 'מס׳ דרכון', 'ת. כניסה', 'טל׳ עובד/ת', 'מעסיק', 'טל׳ מעסיק',
          ...RENEWAL_TYPES.map((t) => t.short)],
        shownRenewals.map((r) => [r.caseNumber, r.workerName, r.passportNo,
          r.arrivalDate ? fmtDate(r.arrivalDate) : '', r.workerPhone, r.employerName, r.employerPhone,
          ...RENEWAL_TYPES.map((t) => (r.cells[t.key].due ? fmtDate(r.cells[t.key].due) : ''))]));
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
          <div className="rg-kpi"><b>{placements.length}</b><span>השמות פעילות</span></div>
          <div className={`rg-kpi${renewCounts.overdue + renewCounts.urgent ? ' alert' : ''}`}><b>{renewCounts.overdue + renewCounts.urgent}</b><span>חידושים דחופים</span></div>
          <div className="rg-kpi"><b>{leads.length}</b><span>פניות פתוחות</span></div>
        </div>
      )}

      <nav className="rg-tabs">
        <button className={`rg-tab${tab === 'families' ? ' on' : ''}`} onClick={() => setTab('families')}>👨‍👩‍👧 משפחות <em>{families.length}</em></button>
        <button className={`rg-tab${tab === 'workers' ? ' on' : ''}`} onClick={() => setTab('workers')}>👷 עובדים <em>{workers.length}</em></button>
        <button className={`rg-tab${tab === 'placements' ? ' on' : ''}`} onClick={() => setTab('placements')}>🤝 השמות פעילות <em>{placements.length}</em></button>
        <button className={`rg-tab${tab === 'renewals' ? ' on' : ''}`} onClick={() => setTab('renewals')}>
          🔔 דוח חידושים {renewCounts.overdue + renewCounts.urgent > 0 && <em className="alert">{renewCounts.overdue + renewCounts.urgent}</em>}
        </button>
        <button className={`rg-tab${tab === 'social' ? ' on' : ''}`} onClick={() => setTab('social')}>
          🧑‍⚕️ עובד/ת סוציאלי/ת {socialOverdue > 0 && <em className="alert">{socialOverdue}</em>}
        </button>
        <button className={`rg-tab${tab === 'reports' ? ' on' : ''}`} onClick={() => setTab('reports')}>📊 דוחות</button>
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
              <table className="rg-table rg-renew-table">
                <thead>
                  <tr>
                    <th>#</th><th>שם העובד/ת</th><th>מס׳ דרכון</th><th>ת. כניסה</th>
                    <th>טל׳ עובד/ת</th><th>מעסיק</th><th>טל׳ מעסיק</th>
                    {RENEWAL_TYPES.map((t) => <th key={t.key} className="rg-renew-col" title={t.label}>{t.short}</th>)}
                    {WORKER_PAYMENTS.map((t) => <th key={t.key} className="rg-renew-col wpay" title={t.label}>{t.short}</th>)}
                  </tr>
                </thead>
                <tbody>{shownRenewals.map((r) => (
                  <tr key={r.id}>
                    <td className="rg-num">{r.caseNumber || '—'}</td>
                    <td className="rg-link" onClick={() => goRecord(r.caseObj, 'worker')}><b>{r.workerName || '—'}</b></td>
                    <td dir="ltr">{r.passportNo || '—'}</td>
                    <td>{r.arrivalDate ? fmtDate(r.arrivalDate) : '—'}</td>
                    <td dir="ltr">{r.workerPhone || '—'}</td>
                    <td className="rg-link" onClick={() => goRecord(r.caseObj, 'family')}>{r.employerName || '—'}</td>
                    <td dir="ltr">{r.employerPhone || '—'}</td>
                    {RENEWAL_TYPES.map((t) => {
                      const cell = r.cells[t.key];
                      const cls = cell.overdue ? 'rg-cell-bad' : cell.urgent ? 'rg-cell-warn' : cell.due ? '' : 'rg-cell-empty';
                      return (
                        <td key={t.key} className={`rg-renew-col ${cls}`}
                            title={cell.due ? `${t.label} — ${cell.daysLeft >= 0 ? `בעוד ${cell.daysLeft} ימים` : `עבר לפני ${-cell.daysLeft} ימים`}` : t.label}>
                          {cell.due ? fmtDate(cell.due)
                            : <RenewalDateInput caseObj={r.caseObj} typeKey={t.key} onSaved={reload} />}
                        </td>
                      );
                    })}
                    {WORKER_PAYMENTS.map((t) => {
                      const cell = r.cells[t.key];
                      const cls = cell.paid ? 'rg-cell-paid'
                        : cell.overdue ? 'rg-cell-bad'
                        : cell.thisWeek ? 'rg-cell-week'
                        : cell.urgent ? 'rg-cell-warn'
                        : cell.due ? '' : 'rg-cell-empty';
                      return (
                        <td key={t.key} className={`rg-renew-col wpay ${cls}`}
                            title={cell.due ? `${t.label} — ${cell.paid ? 'שולם' : cell.daysLeft >= 0 ? `בעוד ${cell.daysLeft} ימים` : `עבר לפני ${-cell.daysLeft} ימים`}` : `${t.label} — חסר תאריך הגעה`}>
                          {cell.due ? (
                            <button className="rg-wpay-btn" title="סמן כשולם / לא שולם"
                              onClick={async (e) => { e.stopPropagation(); await setWorkerPaymentDone(r.caseObj, t.key, !cell.paid); reload(); }}>
                              {cell.paid ? '✓ ' : ''}{fmtDate(cell.due)}
                            </button>
                          ) : <span className="rg-muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rg-empty">אין פריטים בקטגוריה הזו.</p>}
          <p className="rg-legend">
            <span className="rg-cell-bad">עבר תוקף</span>
            <span className="rg-cell-week">השבוע</span>
            <span className="rg-cell-warn">בחודש הקרוב</span>
            <span className="rg-cell-paid">שולם</span>
            <span className="rg-muted">תשלומי העובד/ת מחושבים מתאריך ההגעה (בהגעה · 26 חודשים · 38 חודשים) — לחיצה מסמנת כשולם</span>
          </p>
        </>
      )}

      {cases && tab === 'placements' && (
        placements.length ? (
          <div className="rg-tablewrap">
            <table className="rg-table">
              <thead><tr><th>#</th><th>עובד/ת</th><th>דרכון</th><th>אזרחות</th><th>מעסיק / מטופל</th><th>ישוב</th><th>תחילת העסקה</th><th>שכר</th><th>רכז/ת</th></tr></thead>
              <tbody>{placements.map((c) => { const f = c.data?.fields || {}; return (
                <tr key={c.id} onClick={() => goRecord(c, 'worker')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.worker?.nameHe || c.worker?.nameEn}</b></td>
                  <td dir="ltr">{c.worker?.passportNo || '—'}</td>
                  <td>{c.worker?.nationality || '—'}</td>
                  <td>{c.family?.fullName || '—'}</td>
                  <td>{c.family?.city || '—'}</td>
                  <td>{f.startDate ? fmtDate(f.startDate) : '—'}</td>
                  <td>{f.salary ? `${Number(f.salary).toLocaleString('he-IL')} ₪` : '—'}</td>
                  <td>{f.assignedTo || '—'}</td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        ) : <p className="rg-empty">אין השמות פעילות.</p>
      )}

      {cases && tab === 'social' && (
        <SocialWorkerTab cases={activePlacements(byRakaz(cases))} onOpen={goRecord} onChanged={reload} />
      )}

      {cases && tab === 'reports' && <ReportsTab cases={cases} onOpen={goRecord} />}

      {tab === 'leads' && <LeadsTab leads={leads} onChanged={reload} />}

      <footer className="rg-foot"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></footer>
    </div>
  );
}

// Quick presets so the office doesn't have to type dates for the common cases.
function rangePreset(which) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  const start = new Date(t); const end = new Date(t);
  if (which === 'month') { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  if (which === 'nextMonth') { end.setMonth(end.getMonth() + 1); }
  if (which === 'nextWeek') { end.setDate(end.getDate() + 7); }
  if (which === 'year') { start.setMonth(0, 1); end.setMonth(11, 31); }
  if (which === 'lastYear') { start.setFullYear(start.getFullYear() - 1, 0, 1); end.setFullYear(end.getFullYear() - 1, 11, 31); }
  return { from: iso(start), to: iso(end) };
}

function ReportsTab({ cases, onOpen }) {
  const init = rangePreset('month');
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [kind, setKind] = useState('all'); // all | income | due
  const report = useMemo(() => buildReport(cases, from, to), [cases, from, to]);
  const preset = (w) => { const r = rangePreset(w); setFrom(r.from); setTo(r.to); };

  const exportIncome = () => downloadCsv('ogen-income.csv',
    ['תאריך', 'שם', 'סכום', 'אמצעי תשלום'],
    report.income.map((i) => [fmtDate(i.date), i.who, i.amount, i.method]));
  const exportDue = () => downloadCsv('ogen-due.csv',
    ['תאריך', 'שם', 'סוג', 'מצב'],
    report.due.map((d) => [fmtDate(d.cell.due), d.who, d.type.label,
      d.cell.paid ? 'שולם' : d.cell.overdue ? 'עבר' : 'ממתין']));

  return (
    <>
      <div className="rg-report-bar">
        <label>מתאריך <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>עד תאריך <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="rg-presets">
          <button className="rg-chip" onClick={() => preset('nextWeek')}>השבוע הקרוב</button>
          <button className="rg-chip" onClick={() => preset('month')}>החודש</button>
          <button className="rg-chip" onClick={() => preset('nextMonth')}>החודש הקרוב</button>
          <button className="rg-chip" onClick={() => preset('year')}>השנה</button>
          <button className="rg-chip" onClick={() => preset('lastYear')}>שנה שעברה</button>
        </div>
      </div>

      <div className="rg-kpis">
        <div className="rg-kpi"><b>{report.total.toLocaleString('he-IL')} ₪</b><span>סה״כ נגבה בתקופה</span></div>
        <div className="rg-kpi"><b>{report.net.toLocaleString('he-IL')} ₪</b><span>לפני מע״מ</span></div>
        <div className="rg-kpi"><b>{report.vat.toLocaleString('he-IL')} ₪</b><span>מע״מ (17%)</span></div>
        <div className="rg-kpi"><b>{report.income.length}</b><span>תשלומים</span></div>
        <div className={`rg-kpi${report.due.length ? ' alert' : ''}`}><b>{report.due.length}</b><span>חידושים בתקופה</span></div>
      </div>

      <div className="rg-filters">
        <button className={`rg-chip${kind === 'all' ? ' on' : ''}`} onClick={() => setKind('all')}>הכל</button>
        <button className={`rg-chip${kind === 'income' ? ' on' : ''}`} onClick={() => setKind('income')}>💰 הכנסות ({report.income.length})</button>
        <button className={`rg-chip${kind === 'due' ? ' on' : ''}`} onClick={() => setKind('due')}>🔔 חידושים ותשלומים ({report.due.length})</button>
      </div>

      {(kind === 'all' || kind === 'income') && (
        <section className="rg-report-block">
          <h3>💰 כסף שנכנס בתקופה
            <button className="rp-btn ghost sm" onClick={exportIncome}>⬇️ ייצוא</button>
          </h3>
          {report.income.length ? (
            <div className="rg-tablewrap">
              <table className="rg-table">
                <thead><tr><th>תאריך</th><th>שם</th><th>סכום</th><th>אמצעי תשלום</th></tr></thead>
                <tbody>{report.income.map((i) => (
                  <tr key={i.id} onClick={() => onOpen(i.caseObj, 'family')}>
                    <td>{fmtDate(i.date)}</td>
                    <td><b>{i.who || '—'}</b></td>
                    <td><b>{i.amount.toLocaleString('he-IL')} ₪</b></td>
                    <td><span className="rg-pill info">{i.method || '—'}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rg-empty">לא נרשמו תשלומים בתקופה הזו.</p>}
        </section>
      )}

      {(kind === 'all' || kind === 'due') && (
        <section className="rg-report-block">
          <h3>🔔 מה צריך חידוש / תשלום בתקופה
            <button className="rp-btn ghost sm" onClick={exportDue}>⬇️ ייצוא</button>
          </h3>
          {report.due.length ? (
            <div className="rg-tablewrap">
              <table className="rg-table">
                <thead><tr><th>תאריך</th><th>שם</th><th>סוג</th><th>מצב</th></tr></thead>
                <tbody>{report.due.map((d) => (
                  <tr key={d.id} onClick={() => onOpen(d.caseObj, 'worker')}>
                    <td>{fmtDate(d.cell.due)}</td>
                    <td><b>{d.who || '—'}</b></td>
                    <td>{d.type.icon ? d.type.icon + ' ' : '💵 '}{d.type.label}</td>
                    <td>
                      {d.cell.paid ? <span className="rg-pill ok">שולם</span>
                        : d.cell.overdue ? <span className="rg-pill bad">עבר</span>
                        : <span className="rg-pill warn">ממתין</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rg-empty">אין חידושים או תשלומים בתקופה הזו.</p>}
        </section>
      )}
    </>
  );
}

function RenewalDateInput({ caseObj, typeKey, onSaved }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (v) => {
    setBusy(true);
    try { await saveRenewalDate(caseObj, typeKey, v); onSaved(); }
    catch (e) { alert(e?.message || e); } finally { setBusy(false); }
  };
  return (
    <input className="rg-cell-date" type="date" value={val} disabled={busy}
      onChange={(e) => { setVal(e.target.value); if (e.target.value) save(e.target.value); }} />
  );
}
