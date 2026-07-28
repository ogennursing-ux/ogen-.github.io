import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry, buildReport, activePlacements } from './registry.js';
import {
  buildVisitReport, quarterOptions, reportDueFor, saveVisitsBatch, VISIT_CHANNELS,
} from './socialWorker.js';
import { REPORTS, REPORT_GROUPS, runReport, coordinators } from './reports.js';
import CalendarReport from './CalendarReport.jsx';
import { openRecordTab } from './recordLink.js';
import { loadDigitalForms } from './digitalForms.js';
import { downloadInteriorReport } from './interiorReport.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';

// Each report is a small wizard in its own browser tab:
//   step 1 — pick the parameters (dates / quarter / coordinator)
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

export { REPORTS, REPORT_GROUPS };

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
function ParamsStep({ report, cases, onRun }) {
  const wants = report.params || [];
  const quarters = useMemo(() => quarterOptions(4, 2), []);
  const rakazim = useMemo(() => coordinators(cases || []), [cases]);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); });
  const [quarter, setQuarter] = useState(() => (quarters.find((q) => q.current) || quarters[0]).id);
  const [rakaz, setRakaz] = useState('');
  const [channel, setChannel] = useState('');

  const preset = (which) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const iso = (d) => d.toISOString().slice(0, 10);
    const s = new Date(t); const e = new Date(t);
    if (which === 'week') { e.setDate(e.getDate() + 7); }
    if (which === 'month') { s.setDate(1); e.setMonth(e.getMonth() + 1, 0); }
    if (which === 'lastMonth') { s.setMonth(s.getMonth() - 1, 1); e.setDate(0); }
    if (which === 'nextMonth') { e.setMonth(e.getMonth() + 1); }
    if (which === 'quarterAhead') { e.setMonth(e.getMonth() + 3); }
    if (which === 'year') { s.setMonth(0, 1); e.setMonth(11, 31); }
    if (which === 'lastYear') { s.setFullYear(s.getFullYear() - 1, 0, 1); e.setFullYear(e.getFullYear() - 1, 11, 31); }
    setFrom(iso(s)); setTo(iso(e));
  };

  const submit = () => {
    const p = {};
    if (wants.includes('range')) { p.from = from; p.to = to; }
    if (wants.includes('quarter')) p.quarter = quarter;
    if (wants.includes('rakaz') && rakaz) p.rakaz = rakaz;
    if (wants.includes('channel') && channel) p.channel = channel;
    p.run = '1';
    onRun(p);
  };

  return (
    <div className="rpt-step">
      <div className="rpt-card">
        <span className="rpt-no">{report.no}</span>
        <h2>{report.label}</h2>
        <p className="rpt-desc">{report.desc}</p>
        {report.note && <p className="rpt-note">ℹ️ {report.note}</p>}
        {report.soon && <p className="rpt-soon">🚧 הדוח עדיין לא מחושב. {report.soon}</p>}

        {wants.includes('range') && (
          <>
            <div className="rpt-fields">
              <label>מתאריך<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>עד תאריך<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            <div className="rpt-presets">
              <button className="rg-chip" onClick={() => preset('week')}>השבוע הקרוב</button>
              <button className="rg-chip" onClick={() => preset('month')}>החודש</button>
              <button className="rg-chip" onClick={() => preset('lastMonth')}>החודש שעבר</button>
              <button className="rg-chip" onClick={() => preset('nextMonth')}>החודש הקרוב</button>
              <button className="rg-chip" onClick={() => preset('quarterAhead')}>3 חודשים קדימה</button>
              <button className="rg-chip" onClick={() => preset('year')}>השנה</button>
              <button className="rg-chip" onClick={() => preset('lastYear')}>שנה שעברה</button>
            </div>
          </>
        )}

        {wants.includes('quarter') && (
          <div className="rpt-fields">
            <label>רבעון
              <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                {quarters.map((q) => <option key={q.id} value={q.id}>{q.label}{q.current ? ' (נוכחי)' : ''}</option>)}
              </select>
            </label>
          </div>
        )}

        {wants.includes('rakaz') && (
          <div className="rpt-fields" style={{ marginTop: 14 }}>
            <label>רכז/ת
              <select value={rakaz} onChange={(e) => setRakaz(e.target.value)}>
                <option value="">כל הרכזים</option>
                {rakazim.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
        )}

        {wants.includes('channel') && (
          <div className="rpt-fields" style={{ marginTop: 14 }}>
            <label>אופן הביקור
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">הכול</option>
                {Object.values(VISIT_CHANNELS).map((ch) => (
                  <option key={ch.key} value={ch.key}>{ch.icon} {ch.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button className="rp-btn rpt-run" onClick={submit}>הפק דוח ←</button>
      </div>
    </div>
  );
}

// A tally reads as magnitude, so it gets the form magnitude asks for: a
// horizontal bar chart on one hue, light→dark, with the table right underneath
// it. The four teal steps were validated for monotone lightness, step spacing
// and contrast against a white surface.
const TALLY_RAMP = ['#06b6d4', '#0891b2', '#0e7490', '#164e63'];
const CHART_ROWS = 15;

function TallyChart({ rows, label }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return null;

  const shown = rows.slice(0, CHART_ROWS);
  const hidden = rows.length - shown.length;
  const max = Math.max(1, ...shown.map((r) => r.count));
  // Darker means more, so the ramp step follows the value, not the row order.
  const stepOf = (n) => TALLY_RAMP[Math.min(TALLY_RAMP.length - 1,
    Math.floor((n / max) * TALLY_RAMP.length - 1e-9))];

  return (
    <figure className="tly">
      <figcaption className="tly-cap">{label} — {rows.length} ערכים</figcaption>
      <div className="tly-rows">
        {shown.map((r) => {
          const pct = (r.count / max) * 100;
          return (
            <div key={r.id} className={`tly-row${hover === r.id ? ' on' : ''}`}
              onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <span className="tly-label" title={r.group}>{r.group}</span>
              <span className="tly-track">
                <span className="tly-bar" style={{ width: `${pct}%`, background: stepOf(r.count) }} />
                {hover === r.id && (
                  <span className="tly-tip" role="status">{r.group}: {r.count} · {r.pct}%</span>
                )}
              </span>
              <span className="tly-val">{r.count}</span>
            </div>
          );
        })}
      </div>
      {hidden > 0 && <p className="tly-more">ועוד {hidden} ערכים — בטבלה שלמטה.</p>}
    </figure>
  );
}

// --- generic result table ------------------------------------------------------
const cellText = (row, col) => {
  const v = row[col.key];
  if (v === undefined || v === null || v === '') return '';
  if (col.type === 'date') return fmtDate(v);
  if (col.type === 'money') return fmtMoney(v);
  if (col.type === 'pct') return `${v}%`;
  return String(v);
};

// Every catalogue report that declares columns renders through here, so they
// all look the same and all export the same way.
function TableResult({ report, rows }) {
  const cols = report.columns || [];
  const totals = report.totals || [];
  const sum = (key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const exportCsv = () => downloadCsv(
    `ogen-${report.no}.csv`,
    cols.map((c) => c.label),
    rows.map((r) => cols.map((c) => cellText(r, c))),
  );

  return (
    <>
      <div className="rg-kpis">
        {report.group === 'stats' && (
          <div className="rg-kpi"><b>{rows.reduce((n, r) => n + (Number(r.count) || 0), 0)}</b><span>סה״כ</span></div>
        )}
        <div className="rg-kpi"><b>{rows.length}</b><span>שורות בדוח</span></div>
        {totals.map((t) => {
          const col = cols.find((c) => c.key === t);
          return <div key={t} className="rg-kpi"><b>{fmtMoney(sum(t))}</b><span>{col?.label || t}</span></div>;
        })}
      </div>
      <button className="rp-btn ghost" onClick={exportCsv} disabled={!rows.length}>⬇️ ייצוא Excel</button>
      {report.group === 'stats' && <TallyChart rows={rows} label={cols[0]?.label || ''} />}
      {rows.length ? (
        <div className="rg-tablewrap" style={{ marginTop: 14 }}>
          <table className="rg-table">
            <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => {
                  const txt = cellText(r, c);
                  const clickable = c.link && r.caseObj;
                  const cls = [c.type === 'num' ? 'rg-num' : '', clickable ? 'rg-link' : '']
                    .filter(Boolean).join(' ');
                  return (
                    <td key={c.key} className={cls || undefined} dir={c.ltr ? 'ltr' : undefined}
                      onClick={clickable ? () => openRecordTab(c.link, r.caseObj.id) : undefined}
                      title={clickable ? 'פתיחת התיק בלשונית חדשה' : undefined}>
                      {c.type === 'pill' && txt
                        ? <span className={`rg-pill ${r.tone || 'info'}`}>{txt}</span>
                        : (c.type === 'strong' || c.strong) ? <b>{txt || '—'}</b> : (txt || '—')}
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="rg-empty">אין נתונים בתקופה הזו.</p>}
    </>
  );
}


// A report whose rules the office still has to explain. The card, the number
// and the parameters page exist; only the calculation is missing.
function SoonResult({ report }) {
  return (
    <div className="rpt-soonbox">
      <span className="rpt-soonicon">🚧</span>
      <h3>הדוח שמור במקום — עדיין לא מחושב</h3>
      <p>{report.soon}</p>
      <p className="rg-muted">
        השדות שהדוח הזה צריך כבר נאספים בתיקים, כך שברגע שנסגור את הכללים
        הוא יתמלא מהנתונים שכבר קיימים במערכת — בלי להזין שום דבר מחדש.
      </p>
      <a className="rp-btn ghost" href="#registry">חזרה למערכת ←</a>
    </div>
  );
}

// --- the reports that keep their own hand-built layout --------------------------
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

// The social-worker quarter: the only report the office also *writes* into,
// because the visit dates are filled in by hand from what really happened.
// The one report that produces the official government file: it fills משרד
// הפנים's own quarterly Excel template with the quarter's visits and downloads it.
function InteriorButton({ quarter, rows }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await downloadInteriorReport({
        agency: COMPANY_NAME,
        year: String(quarter.year),
        quarter: `Q${quarter.q}`,
        visits: [...rows].sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0)),
      });
    } catch (e) { alert('הפקת הדוח למשרד הפנים נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <button className="rp-btn matash" disabled={busy || !rows.length} onClick={go} style={{ marginInlineStart: 8 }}>
      {busy ? 'מפיק…' : '📤 הורד דוח רבעוני למשרד הפנים'}
    </button>
  );
}

function SocialResult({ report, cases, params, onChanged }) {
  const quarters = useMemo(() => quarterOptions(4, 2), []);
  const quarter = quarters.find((q) => q.id === params.quarter) || quarters.find((q) => q.current);
  const all = useMemo(() => buildVisitReport(activePlacements(cases)), [cases]);
  const rows = useMemo(() => all.filter((v) => v.due >= quarter.from && v.due <= quarter.to
    && (!report.channel || !v.done || v.channel.key === report.channel)), [all, quarter, report.channel]);
  const [draft, setDraft] = useState({});
  const [notes, setNotes] = useState({});
  const [chans, setChans] = useState({});
  const [busy, setBusy] = useState(false);
  const pending = Object.entries(draft).filter(([, d]) => d);

  async function saveAll() {
    setBusy(true);
    try {
      await saveVisitsBatch(pending.map(([rowId, date]) => {
        const row = all.find((v) => v.rowId === rowId);
        return {
          caseObj: row.caseObj, visitId: row.id, date,
          note: notes[rowId] ?? row.note,
          channel: chans[rowId] || row.channel.key,
        };
      }));
      setDraft({}); setNotes({}); setChans({}); onChanged();
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
        {report.channel && <> · מסונן ל<b>{VISIT_CHANNELS[report.channel].label}</b></>}
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
        ['#', 'עובד/ת', 'משפחה', 'ישוב', 'סוג', 'אופן', 'תאריך יעד', 'בוצע', 'מצב', 'עו״ס'],
        rows.map((v) => [v.caseNumber, v.workerName, v.familyName, v.city, v.kind.label, v.channel.label,
          fmtDate(v.due), v.doneDate ? fmtDate(v.doneDate) : '',
          v.done ? 'בוצע' : v.overdue ? 'באיחור' : 'ממתין', v.socialWorker]))}>⬇️ ייצוא Excel</button>
      {report.interior && <InteriorButton quarter={quarter} rows={rows} />}

      {rows.length ? (
        <>
          <p className="sw-batchbar" style={{ marginTop: 14 }}>
            <span>עדכון ידני — לכל ביקור מזינים את <b>התאריך שבו העו״ס באמת ביקר</b> ואת אופן הביקור.</span>
            <button className="rp-btn sm" disabled={!pending.length || busy} onClick={saveAll}>
              {busy ? 'שומר…' : `💾 שמור ${pending.length || ''} עדכונים`}
            </button>
          </p>
          <div className="rg-tablewrap">
            <table className="rg-table sw-table">
              <thead><tr><th>#</th><th>עובד/ת</th><th>משפחה</th><th>ישוב</th><th>סוג</th><th>תאריך יעד</th><th>מצב</th><th>בוצע בתאריך</th><th>אופן</th><th>הערה</th></tr></thead>
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
                  <td>
                    <select className="sw-channel" value={chans[v.rowId] ?? v.channel.key}
                      onChange={(e) => setChans({ ...chans, [v.rowId]: e.target.value })}>
                      {Object.values(VISIT_CHANNELS).map((ch) => (
                        <option key={ch.key} value={ch.key}>{ch.icon} {ch.label}</option>
                      ))}
                    </select>
                  </td>
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
  const [forms, setForms] = useState(null);
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

  // Reports about the digital forms read the signing system, not the case rows.
  const needsForms = REPORTS[(/^report\/([^?]+)/.exec(route) || [])[1]]?.source === 'forms';
  useEffect(() => {
    if (!authed || !needsForms || forms !== null) return;
    loadDigitalForms().then(setForms).catch((e) => { setForms([]); setErr(e?.message || String(e)); });
  }, [authed, needsForms, forms]);

  // #report/<key>              → parameters
  // #report/<key>?run=1&…      → results
  const [, key = ''] = /^report\/([^?]+)/.exec(route) || [];
  const query = useMemo(
    () => Object.fromEntries(new URLSearchParams(route.split('?')[1] || '')),
    [route],
  );
  const report = REPORTS[key];
  const hasParams = !!report && query.run === '1';

  const rows = useMemo(
    () => (report && hasParams && cases && report.run
      ? runReport(report, cases, query, { forms: forms || [] }) : []),
    [report, hasParams, cases, forms, query],
  );

  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  if (!report) {
    return (
      <div className="rpt-shell">
        <header className="rpt-header">
          <div className="rg-brand"><span className="rg-logo">📊</span><div><h1>דוחות</h1></div></div>
        </header>
        <p className="rg-empty">דוח לא מוכר.</p>
        <a className="rp-btn" href="#registry">חזרה למערכת</a>
      </div>
    );
  }

  const group = REPORT_GROUPS.find((g) => g.id === report.group);
  const run = (params) => { location.hash = `report/${key}?${new URLSearchParams(params).toString()}`; };

  const subtitle = !hasParams ? 'בחרו את הפרמטרים לדוח'
    : query.quarter ? `רבעון ${query.quarter.replace('-Q', ' / ')}`
    : (query.from || query.to) ? `${fmtDate(query.from)} – ${fmtDate(query.to)}`
    : report.desc;

  return (
    <div className="rpt-shell">
      <header className="rpt-header">
        <div className="rg-brand">
          <span className="rg-logo">{group?.icon || '📊'}</span>
          <div>
            <h1><span className="rpt-no inline">{report.no}</span>{report.label}</h1>
            <p>{group?.title} · {subtitle}{query.rakaz ? ` · ${query.rakaz}` : ''}</p>
          </div>
        </div>
        <div className="rg-header-actions">
          {hasParams && <button className="rp-btn ghost" onClick={() => { location.hash = `report/${key}`; }}>↺ שנה פרמטרים</button>}
          <button className="rp-btn ghost" onClick={() => window.print()}>🖨️ הדפס</button>
          <a className="rp-btn ghost" href="#registry">מערכת הרישום ←</a>
        </div>
      </header>

      {err && <p className="rg-err">{err}</p>}
      {(cases === null || (needsForms && forms === null)) && !err && <p className="rg-empty">טוען…</p>}

      {cases && !hasParams && <ParamsStep report={report} cases={cases} onRun={run} />}
      {cases && hasParams && (!needsForms || forms !== null) && (
        report.soon ? <SoonResult report={report} />
          : report.render === 'social' ? <SocialResult report={report} cases={cases} params={query} onChanged={reload} />
          : report.render === 'income' ? <IncomeResult cases={cases} params={query} />
          : report.render === 'due' ? <DueResult cases={cases} params={query} />
          : report.render === 'placements' ? <PlacementsResult cases={cases} />
          : report.render === 'calendar' ? <CalendarReport cases={cases} placements={activePlacements(cases)} onOpen={(c, k) => openRecordTab(k, c.id)} />
          : <TableResult report={report} rows={rows} />
      )}
    </div>
  );
}
