import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadRegistry, buildReport, activePlacements, RENEWAL_TYPES, WORKER_PAYMENTS,
} from './registry.js';
import {
  buildVisitReport, quarterOptions, reportDueFor, VISIT_KINDS, saveVisitsBatch,
} from './socialWorker.js';
import CalendarReport from './CalendarReport.jsx';
import { openRecordTab } from './recordLink.js';

// Each report is a small wizard in its own browser tab:
//   step 1 — pick the parameters (dates / quarter)
//   step 2 — the result table
// The parameters live in the URL, so a finished report can be bookmarked,
// refreshed, or sent to someone else and it opens the same numbers.

const fmtDate = (v) => {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtMoney = (n) => `${(Number(n) || 0).toLocaleString('he-IL')} ₪`;
const isoToday = () => new Date().toISOString().slice(0, 10);

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

export const REPORTS = {
  income: { label: 'הכנסות', icon: '💰', desc: 'כמה כסף נכנס בתקופה', params: 'range' },
  due: { label: 'חידושים ותשלומים', icon: '🔔', desc: 'ויזה, דרכון, ביטוח, היתר, תאגיד ותשלומי העובד/ת', params: 'range' },
  social: { label: 'ביקורי עובד/ת סוציאלי/ת', icon: '🧑‍⚕️', desc: 'ביקורי השמה, 30 יום ושוטף לפי רבעון', params: 'quarter' },
  placements: { label: 'השמות פעילות', icon: '🤝', desc: 'כל העובדים המועסקים כרגע', params: 'none' },
  calendar: { label: 'יומן פגישות', icon: '📅', desc: 'כל הביקורים, החידושים והפגישות על לוח שנה חודשי', params: 'none' },
};

function Login({ onIn }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>📊 דוחות</h2>
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

// --- step 1: parameters --------------------------------------------------------
function ParamsStep({ reportKey, onRun }) {
  const meta = REPORTS[reportKey];
  const quarters = useMemo(() => quarterOptions(4, 2), []);
  const current = quarters.find((q) => q.current) || quarters[0];
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); });
  const [quarterId, setQuarterId] = useState(current.id);

  const preset = (which) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const iso = (d) => d.toISOString().slice(0, 10);
    const s = new Date(t); const e = new Date(t);
    if (which === 'week') { e.setDate(e.getDate() + 7); }
    if (which === 'month') { s.setDate(1); e.setMonth(e.getMonth() + 1, 0); }
    if (which === 'nextMonth') { e.setMonth(e.getMonth() + 1); }
    if (which === 'quarterAhead') { e.setMonth(e.getMonth() + 3); }
    if (which === 'year') { s.setMonth(0, 1); e.setMonth(11, 31); }
    if (which === 'lastYear') { s.setFullYear(s.getFullYear() - 1, 0, 1); e.setFullYear(e.getFullYear() - 1, 11, 31); }
    setFrom(iso(s)); setTo(iso(e));
  };

  return (
    <div className="rpt-step">
      <div className="rpt-card">
        <h2><span>{meta.icon}</span>{meta.label}</h2>
        <p className="rpt-desc">{meta.desc}</p>

        {meta.params === 'range' && (
          <>
            <div className="rpt-fields">
              <label>מתאריך<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>עד תאריך<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            <div className="rpt-presets">
              <button className="rg-chip" onClick={() => preset('week')}>השבוע הקרוב</button>
              <button className="rg-chip" onClick={() => preset('month')}>החודש</button>
              <button className="rg-chip" onClick={() => preset('nextMonth')}>החודש הקרוב</button>
              <button className="rg-chip" onClick={() => preset('quarterAhead')}>3 חודשים קדימה</button>
              <button className="rg-chip" onClick={() => preset('year')}>השנה</button>
              <button className="rg-chip" onClick={() => preset('lastYear')}>שנה שעברה</button>
            </div>
            <button className="rp-btn rpt-run" onClick={() => onRun({ from, to })}>הפק דוח ←</button>
          </>
        )}

        {meta.params === 'quarter' && (
          <>
            <div className="rpt-fields">
              <label>רבעון
                <select value={quarterId} onChange={(e) => setQuarterId(e.target.value)}>
                  {quarters.map((q) => <option key={q.id} value={q.id}>{q.label}{q.current ? ' (נוכחי)' : ''}</option>)}
                </select>
              </label>
            </div>
            <button className="rp-btn rpt-run" onClick={() => onRun({ quarter: quarterId })}>הפק דוח ←</button>
          </>
        )}

        {meta.params === 'none' && (
          <button className="rp-btn rpt-run" onClick={() => onRun({})}>הפק דוח ←</button>
        )}
      </div>
    </div>
  );
}

// --- step 2: results -----------------------------------------------------------
function IncomeResult({ cases, params }) {
  const r = useMemo(() => buildReport(cases, params.from, params.to), [cases, params]);
  return (
    <>
      <div className="rg-kpis">
        <div className="rg-kpi"><b>{fmtMoney(r.total)}</b><span>סה״כ נגבה</span></div>
        <div className="rg-kpi"><b>{fmtMoney(r.net)}</b><span>לפני מע״מ</span></div>
        <div className="rg-kpi"><b>{fmtMoney(r.vat)}</b><span>מע״מ (17%)</span></div>
        <div className="rg-kpi"><b>{r.income.length}</b><span>תשלומים</span></div>
      </div>
      <button className="rp-btn ghost" onClick={() => downloadCsv('ogen-income.csv',
        ['תאריך', 'שם', 'סכום', 'אמצעי תשלום'],
        r.income.map((i) => [fmtDate(i.date), i.who, i.amount, i.method]))}>⬇️ ייצוא Excel</button>
      {r.income.length ? (
        <div className="rg-tablewrap" style={{ marginTop: 14 }}>
          <table className="rg-table">
            <thead><tr><th>תאריך</th><th>שם</th><th>סכום</th><th>אמצעי תשלום</th></tr></thead>
            <tbody>{r.income.map((i) => (
              <tr key={i.id} className="rg-clickrow" onClick={() => i.caseObj && openRecordTab('family', i.caseObj.id)}>
                <td>{fmtDate(i.date)}</td><td><b>{i.who || '—'}</b></td>
                <td><b>{fmtMoney(i.amount)}</b></td><td><span className="rg-pill info">{i.method || '—'}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="rg-empty">לא נרשמו תשלומים בתקופה הזו.</p>}
    </>
  );
}

function DueResult({ cases, params }) {
  const r = useMemo(() => buildReport(cases, params.from, params.to), [cases, params]);
  return (
    <>
      <div className="rg-kpis">
        <div className="rg-kpi"><b>{r.due.length}</b><span>פריטים בתקופה</span></div>
        <div className="rg-kpi alert"><b>{r.due.filter((d) => d.cell.overdue).length}</b><span>עברו תוקף</span></div>
      </div>
      <button className="rp-btn ghost" onClick={() => downloadCsv('ogen-due.csv',
        ['תאריך', 'שם', 'סוג', 'מצב'],
        r.due.map((d) => [fmtDate(d.cell.due), d.who, d.type.label,
          d.cell.paid ? 'שולם' : d.cell.overdue ? 'עבר' : 'ממתין']))}>⬇️ ייצוא Excel</button>
      {r.due.length ? (
        <div className="rg-tablewrap" style={{ marginTop: 14 }}>
          <table className="rg-table">
            <thead><tr><th>תאריך</th><th>שם</th><th>סוג</th><th>מצב</th></tr></thead>
            <tbody>{r.due.map((d) => (
              <tr key={d.id} className="rg-clickrow" onClick={() => d.caseObj && openRecordTab('worker', d.caseObj.id)}>
                <td>{fmtDate(d.cell.due)}</td><td><b>{d.who || '—'}</b></td>
                <td>{d.type.icon ? d.type.icon + ' ' : '💵 '}{d.type.label}</td>
                <td>{d.cell.paid ? <span className="rg-pill ok">שולם</span>
                  : d.cell.overdue ? <span className="rg-pill bad">עבר</span>
                  : <span className="rg-pill warn">ממתין</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="rg-empty">אין פריטים בתקופה הזו.</p>}
    </>
  );
}

function SocialResult({ cases, params, onChanged }) {
  const quarters = useMemo(() => quarterOptions(4, 2), []);
  const quarter = quarters.find((q) => q.id === params.quarter) || quarters.find((q) => q.current);
  const all = useMemo(() => buildVisitReport(activePlacements(cases)), [cases]);
  const rows = useMemo(() => all.filter((v) => v.due >= quarter.from && v.due <= quarter.to), [all, quarter]);
  const [draft, setDraft] = useState({});
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const pending = Object.entries(draft).filter(([, d]) => d);

  async function saveAll() {
    setBusy(true);
    try {
      await saveVisitsBatch(pending.map(([rowId, date]) => {
        const row = all.find((v) => v.rowId === rowId);
        return { caseObj: row.caseObj, visitId: row.id, date, note: notes[rowId] || '' };
      }));
      setDraft({}); setNotes({}); onChanged();
    } catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }

  const counts = {
    total: rows.length, done: rows.filter((v) => v.done).length,
    overdue: rows.filter((v) => v.overdue).length,
    placement: rows.filter((v) => v.kind.key === 'placement').length,
    day30: rows.filter((v) => v.kind.key === 'day30').length,
    periodic: rows.filter((v) => v.kind.key === 'periodic').length,
  };

  return (
    <>
      <p className="rpt-range">
        {fmtDate(quarter.from)} – {fmtDate(quarter.to)} · 📄 הגשת הדוח עד <b>{fmtDate(reportDueFor(quarter.year, quarter.q))}</b>
      </p>
      <div className="rg-kpis">
        <div className="rg-kpi"><b>{counts.total}</b><span>ביקורים ברבעון</span></div>
        <div className="rg-kpi"><b>{counts.done}</b><span>בוצעו</span></div>
        <div className={`rg-kpi${counts.overdue ? ' alert' : ''}`}><b>{counts.overdue}</b><span>באיחור</span></div>
        <div className="rg-kpi"><b>{counts.placement}</b><span>ביקורי השמה</span></div>
        <div className="rg-kpi"><b>{counts.day30}</b><span>ביקורי 30 יום</span></div>
        <div className="rg-kpi"><b>{counts.periodic}</b><span>ביקורים שוטפים</span></div>
      </div>
      <button className="rp-btn ghost" onClick={() => downloadCsv(`ogen-visits-${quarter.id}.csv`,
        ['#', 'עובד/ת', 'משפחה', 'ישוב', 'סוג', 'תאריך יעד', 'בוצע', 'מצב', 'עו״ס'],
        rows.map((v) => [v.caseNumber, v.workerName, v.familyName, v.city, v.kind.label,
          fmtDate(v.due), v.doneDate ? fmtDate(v.doneDate) : '',
          v.done ? 'בוצע' : v.overdue ? 'באיחור' : 'ממתין', v.socialWorker]))}>⬇️ ייצוא Excel</button>

      {rows.length ? (
        <>
          <p className="sw-batchbar" style={{ marginTop: 14 }}>
            <span>עדכון ידני — לכל ביקור מזינים את <b>התאריך שבו העו״ס באמת ביקר</b>.</span>
            <button className="rp-btn sm" disabled={!pending.length || busy} onClick={saveAll}>
              {busy ? 'שומר…' : `💾 שמור ${pending.length || ''} עדכונים`}
            </button>
          </p>
          <div className="rg-tablewrap">
            <table className="rg-table sw-table">
              <thead><tr><th>#</th><th>עובד/ת</th><th>משפחה</th><th>ישוב</th><th>סוג</th><th>תאריך יעד</th><th>מצב</th><th>בוצע בתאריך</th><th>הערה</th></tr></thead>
              <tbody>{rows.map((v) => (
                <tr key={v.rowId} className={v.done ? 'sw-done' : v.overdue ? 'rg-row-bad' : ''}>
                  <td className="rg-num">{v.caseNumber || '—'}</td>
                  <td className="rg-link" onClick={() => openRecordTab('worker', v.caseObj.id)}><b>{v.workerName || '—'}</b></td>
                  <td className="rg-link" onClick={() => openRecordTab('family', v.caseObj.id)}>{v.familyName || '—'}</td>
                  <td>{v.city || '—'}</td>
                  <td><span className={`sw-kind ${v.kind.key}`}>{v.kind.icon} {v.kind.label}</span></td>
                  <td><b>{fmtDate(v.due)}</b></td>
                  <td>{v.done ? <span className="rg-pill ok">בוצע</span>
                    : v.overdue ? <span className="rg-pill bad">באיחור</span>
                    : <span className="rg-pill warn">בעוד {v.daysLeft} ימים</span>}</td>
                  <td><input type="date" className="sw-date"
                    value={draft[v.rowId] ?? (v.doneDate ? v.doneDate.toISOString().slice(0, 10) : '')}
                    onChange={(e) => setDraft({ ...draft, [v.rowId]: e.target.value })} /></td>
                  <td><input type="text" className="sw-note" placeholder="הערה…"
                    value={notes[v.rowId] ?? v.note}
                    onChange={(e) => setNotes({ ...notes, [v.rowId]: e.target.value })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : <p className="rg-empty">אין ביקורים ברבעון הזה.</p>}
    </>
  );
}

function PlacementsResult({ cases }) {
  const rows = useMemo(() => activePlacements(cases), [cases]);
  return (
    <>
      <div className="rg-kpis"><div className="rg-kpi"><b>{rows.length}</b><span>השמות פעילות</span></div></div>
      <button className="rp-btn ghost" onClick={() => downloadCsv('ogen-placements.csv',
        ['#', 'עובד/ת', 'דרכון', 'אזרחות', 'מעסיק', 'ישוב', 'תחילת העסקה', 'שכר', 'רכז/ת'],
        rows.map((c) => { const f = c.data?.fields || {}; return [f.caseNumber, c.worker?.nameHe || c.worker?.nameEn,
          c.worker?.passportNo, c.worker?.nationality, c.family?.fullName, c.family?.city,
          f.startDate ? fmtDate(f.startDate) : '', f.salary, f.assignedTo]; }))}>⬇️ ייצוא Excel</button>
      <div className="rg-tablewrap" style={{ marginTop: 14 }}>
        <table className="rg-table">
          <thead><tr><th>#</th><th>עובד/ת</th><th>דרכון</th><th>אזרחות</th><th>מעסיק</th><th>ישוב</th><th>תחילת העסקה</th><th>שכר</th><th>רכז/ת</th></tr></thead>
          <tbody>{rows.map((c) => { const f = c.data?.fields || {}; return (
            <tr key={c.id} className="rg-clickrow" onClick={() => openRecordTab('worker', c.id)}>
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
    </>
  );
}

// --- the page ------------------------------------------------------------------
export default function ReportPage() {
  const [authed, setAuthed] = useState(isAuthed());
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState('');
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, ''));

  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const reload = () => loadRegistry()
    .then((r) => { setCases(r); setErr(''); })
    .catch((e) => { setCases([]); setErr(e?.message || String(e)); });
  useEffect(() => { if (authed) reload(); }, [authed]);

  // #report/<key>            → parameters
  // #report/<key>?from=…&to=… → results
  const [, key = ''] = /^report\/([^?]+)/.exec(route) || [];
  const query = Object.fromEntries(new URLSearchParams((route.split('?')[1] || '')));
  const meta = REPORTS[key];
  const hasParams = meta && (meta.params === 'none'
    ? query.run === '1'
    : meta.params === 'quarter' ? !!query.quarter : !!(query.from || query.to));

  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  if (!meta) {
    return (
      <div className="rpt-shell">
        <p className="rg-empty">דוח לא מוכר.</p>
        <a className="rp-btn" href="#registry">חזרה למערכת</a>
      </div>
    );
  }

  const run = (params) => {
    const qs = new URLSearchParams(meta.params === 'none' ? { run: '1' } : params).toString();
    location.hash = `report/${key}?${qs}`;
  };

  return (
    <div className="rpt-shell">
      <header className="rpt-header">
        <div className="rg-brand">
          <span className="rg-logo">{meta.icon}</span>
          <div>
            <h1>{meta.label}</h1>
            <p>{hasParams
              ? (meta.params === 'range' ? `${fmtDate(query.from)} – ${fmtDate(query.to)}` : meta.desc)
              : 'בחרו את הפרמטרים לדוח'}</p>
          </div>
        </div>
        <div className="rg-header-actions">
          {hasParams && <button className="rp-btn ghost" onClick={() => { location.hash = `report/${key}`; }}>↺ שנה פרמטרים</button>}
          <button className="rp-btn ghost" onClick={() => window.print()}>🖨️ הדפס</button>
          <a className="rp-btn ghost" href="#registry">מערכת הרישום ←</a>
        </div>
      </header>

      {err && <p className="rg-err">{err}</p>}
      {cases === null && !err && <p className="rg-empty">טוען…</p>}

      {cases && !hasParams && <ParamsStep reportKey={key} onRun={run} />}
      {cases && hasParams && (
        key === 'income' ? <IncomeResult cases={cases} params={query} />
          : key === 'due' ? <DueResult cases={cases} params={query} />
          : key === 'social' ? <SocialResult cases={cases} params={query} onChanged={reload} />
          : key === 'calendar' ? <CalendarReport cases={cases} placements={activePlacements(cases)} onOpen={(c, k) => openRecordTab(k, c.id)} />
          : <PlacementsResult cases={cases} />
      )}
    </div>
  );
}
