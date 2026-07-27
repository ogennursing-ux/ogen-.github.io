import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadRegistry, searchFamilies, searchWorkers, computeRenewals, saveRenewalDate,
  loadLeads, createLead, convertLeadToCase, dismissLead,
} from './registry.js';
import { getOrAssignCaseNumber, payments } from './caseDetail.js';
import CaseDetail from './CaseDetail.jsx';

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

// Download a UTF-8 CSV (BOM so Hebrew opens correctly in Excel).
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

function StatDot({ stage }) {
  const map = { signed: '✅', missing: '🟡', ready: '🔵', sent: '✍️', partial: '✍️' };
  return <span className="reg-badge">{map[stage] || '🔵'}</span>;
}

function FamilyCard({ c, onOpen }) {
  const f = c.family || {};
  const paid = payments(c).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return (
    <div className="reg-card reg-clickable" onClick={() => onOpen(c)}>
      <div className="reg-card-top">
        <b>{f.fullName || 'ללא שם'}</b>
        <StatDot stage={c.stage} />
      </div>
      <div className="reg-line">{[f.idNumber && `ת״ז ${f.idNumber}`, f.phone].filter(Boolean).join(' · ')}</div>
      {(f.street || f.city) && <div className="reg-line muted">{[f.street, f.city].filter(Boolean).join(', ')}</div>}
      {(c.worker?.nameHe || c.worker?.nameEn) && <div className="reg-line muted">👷 {c.worker.nameHe || c.worker.nameEn}</div>}
      <div className="reg-chips">
        {c.data?.fields?.caseNumber && <span className="reg-chip">תיק #{c.data.fields.caseNumber}</span>}
        {c.data?.fields?.assignedTo && <span className="reg-chip">רכז/ת: {c.data.fields.assignedTo}</span>}
        {paid > 0 && <span className="reg-chip paid">שולם {paid.toLocaleString('he-IL')} ₪</span>}
      </div>
    </div>
  );
}

function WorkerCard({ c, onOpen }) {
  const w = c.worker || {};
  return (
    <div className="reg-card reg-clickable" onClick={() => onOpen(c)}>
      <div className="reg-card-top">
        <b>{w.nameHe || w.nameEn || 'ללא שם'}</b>
        <StatDot stage={c.stage} />
      </div>
      <div className="reg-line">{[w.passportNo && `דרכון ${w.passportNo}`, w.nationality, w.phone].filter(Boolean).join(' · ')}</div>
      {c.family?.fullName && <div className="reg-line muted">🏠 {c.family.fullName}</div>}
      <div className="reg-chips">
        {c.data?.fields?.caseNumber && <span className="reg-chip">תיק #{c.data.fields.caseNumber}</span>}
        {c.data?.fields?.assignedTo && <span className="reg-chip">רכז/ת: {c.data.fields.assignedTo}</span>}
      </div>
    </div>
  );
}

function RenewalRow({ row, onSaved, onOpen }) {
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
      <div className="reg-renew-mid reg-clickable" onClick={() => onOpen(row.caseObj)}>
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
  const convert = async (l) => {
    if (!confirm('להפוך את הפנייה לתיק פעיל?')) return;
    try { await convertLeadToCase(l); onChanged(); } catch (e) { alert(e?.message || e); }
  };
  const drop = async (l) => {
    if (!confirm('להסיר את הפנייה?')) return;
    try { await dismissLead(l); onChanged(); } catch (e) { alert(e?.message || e); }
  };
  return (
    <>
      <div className="cd-doc-form" style={{ marginBottom: 14 }}>
        <input placeholder="שם" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="טלפון" dir="ltr" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="מקור (המלצה/גוגל…)" value={form.referrer || ''} onChange={(e) => setForm({ ...form, referrer: e.target.value })} />
        <input placeholder="הערה" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="cd-save-btn" disabled={busy || (!form.name && !form.phone)} onClick={add}>+ הוסף פנייה</button>
      </div>
      {leads.length ? (
        <div className="board-list">
          {leads.map((l) => {
            const f = l.data?.fields || {};
            return (
              <div key={l.id} className="reg-card">
                <div className="reg-card-top"><b>{f.name || 'ללא שם'}</b><span className="reg-badge">📞</span></div>
                <div className="reg-line">{[f.phone, f.referrer].filter(Boolean).join(' · ')}</div>
                {f.note && <div className="reg-line muted">{f.note}</div>}
                <div className="cd-toolbar" style={{ marginTop: 8 }}>
                  <button className="cd-mini-btn" onClick={() => convert(l)}>➡️ הפוך לתיק</button>
                  <button className="cd-mini-btn" onClick={() => drop(l)}>✕ הסר</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="board-empty">אין פניות פתוחות.</p>}
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
  const [detail, setDetail] = useState(null);

  const reload = () => Promise.all([
    loadRegistry().then((r) => { setCases(r); setErr(''); }).catch((e) => { setCases([]); setErr(e?.message || String(e)); }),
    loadLeads().then(setLeads).catch(() => setLeads([])),
  ]);
  useEffect(() => { if (authed) reload(); }, [authed]);

  // Keep the open detail view in sync with freshly-loaded data.
  useEffect(() => {
    if (detail && cases) {
      const next = cases.find((c) => c.id === detail.id);
      if (next && next !== detail) setDetail(next);
    }
  }, [cases]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Revenue across every case (what was actually recorded as paid).
  const revenue = useMemo(
    () => (cases || []).reduce((s, c) => s + payments(c).reduce((t, p) => t + (Number(p.amount) || 0), 0), 0),
    [cases],
  );

  async function openCase(c) {
    setDetail(c);
    try { await getOrAssignCaseNumber(c, cases || []); } catch { /* numbering is best-effort */ }
  }

  function exportCsv() {
    if (tab === 'workers') {
      downloadCsv('ogen-workers.csv',
        ['מס׳ תיק', 'שם עובד/ת', 'דרכון', 'אזרחות', 'טלפון', 'משפחה', 'רכז/ת'],
        workers.map((c) => [c.data?.fields?.caseNumber || '', c.worker?.nameHe || c.worker?.nameEn || '',
          c.worker?.passportNo || '', c.worker?.nationality || '', c.worker?.phone || '',
          c.family?.fullName || '', c.data?.fields?.assignedTo || '']));
    } else if (tab === 'renewals') {
      downloadCsv('ogen-renewals.csv',
        ['שם', 'סוג', 'תאריך', 'ימים שנותרו', 'סטטוס'],
        shownRenewals.map((r) => [r.name, r.type.label, r.due ? fmtDate(r.due) : '',
          r.daysLeft ?? '', r.overdue ? 'עבר תוקף' : r.urgent ? 'דחוף' : r.due ? 'תקין' : 'חסר תאריך']));
    } else {
      downloadCsv('ogen-families.csv',
        ['מס׳ תיק', 'שם משפחה/מטופל', 'ת״ז', 'טלפון', 'כתובת', 'עובד/ת', 'רכז/ת', 'סה״כ שולם'],
        families.map((c) => [c.data?.fields?.caseNumber || '', c.family?.fullName || '', c.family?.idNumber || '',
          c.family?.phone || '', [c.family?.street, c.family?.city].filter(Boolean).join(', '),
          c.worker?.nameHe || c.worker?.nameEn || '', c.data?.fields?.assignedTo || '',
          payments(c).reduce((s, p) => s + (Number(p.amount) || 0), 0)]));
    }
  }

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

      {cases && (
        <div className="reg-kpis">
          <div className="reg-kpi"><span>{families.length}</span><small>משפחות</small></div>
          <div className="reg-kpi"><span>{workers.length}</span><small>עובדים</small></div>
          <div className={`reg-kpi${renewCounts.overdue + renewCounts.urgent ? ' alert' : ''}`}>
            <span>{renewCounts.overdue + renewCounts.urgent}</span><small>חידושים דחופים</small>
          </div>
          <div className="reg-kpi"><span>{revenue.toLocaleString('he-IL')} ₪</span><small>סה״כ נגבה</small></div>
        </div>
      )}

      <div className="board-tabs">
        <button className={`board-tab${tab === 'families' ? ' on' : ''}`} onClick={() => setTab('families')}>👨‍👩‍👧 משפחות ({families.length})</button>
        <button className={`board-tab${tab === 'workers' ? ' on' : ''}`} onClick={() => setTab('workers')}>👷 עובדים ({workers.length})</button>
        <button className={`board-tab${tab === 'renewals' ? ' on' : ''}`} onClick={() => setTab('renewals')}>
          🔔 דוח חידושים {renewCounts.overdue + renewCounts.urgent > 0 && <span className="reg-alert-dot">{renewCounts.overdue + renewCounts.urgent}</span>}
        </button>
        <button className={`board-tab${tab === 'leads' ? ' on' : ''}`} onClick={() => setTab('leads')}>📞 פניות ({leads.length})</button>
      </div>

      <div className="board-search">
        {tab !== 'renewals' && tab !== 'leads' && (
          <input className="text-input" placeholder="🔍 חיפוש לפי שם / ת״ז / דרכון / טלפון…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        {rakazim.length > 0 && tab !== 'leads' && (
          <select className="reg-select" value={rakazFilter} onChange={(e) => setRakazFilter(e.target.value)}>
            <option value="">כל הרכזים</option>
            {rakazim.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {tab !== 'leads' && <button className="board-toapp" onClick={exportCsv}>⬇️ ייצוא Excel</button>}
        <button className="board-toapp" onClick={() => { location.hash = 'board'; location.reload(); }}>מערכת החוזים ←</button>
      </div>

      {err && <p className="board-err">{err}</p>}
      {cases === null && !err && <p className="board-empty">טוען…</p>}

      {cases && tab === 'families' && (
        families.length ? <div className="board-list">{families.map((c) => <FamilyCard key={c.id} c={c} onOpen={openCase} />)}</div>
          : <p className="board-empty">לא נמצאו משפחות.</p>
      )}
      {cases && tab === 'workers' && (
        workers.length ? <div className="board-list">{workers.map((c) => <WorkerCard key={c.id} c={c} onOpen={openCase} />)}</div>
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
              {shownRenewals.map((r) => <RenewalRow key={r.id} row={r} onSaved={reload} onOpen={openCase} />)}
            </div>
          ) : <p className="board-empty">אין פריטים בקטגוריה הזו.</p>}
        </>
      )}
      {tab === 'leads' && <LeadsTab leads={leads} onChanged={reload} />}

      {detail && <CaseDetail caseObj={detail} onClose={() => setDetail(null)} onChanged={reload} />}

      <div className="board-legal"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></div>
    </div>
  );
}
