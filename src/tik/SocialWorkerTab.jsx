import { useMemo, useState } from 'react';
import {
  buildVisitReport, quarterOptions, reportDueFor, saveVisitsBatch, setQuarterFiled, VISIT_KINDS,
} from './socialWorker.js';

const fmtDate = (d) => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};
const isoOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : '');

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

export default function SocialWorkerTab({ cases, onOpen, onChanged }) {
  const quarters = useMemo(() => quarterOptions(4, 2), []);
  const current = quarters.find((q) => q.current) || quarters[0];
  const [quarterId, setQuarterId] = useState(current.id);
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open'); // open | all | done | overdue
  const [draft, setDraft] = useState({});   // rowId -> yyyy-mm-dd
  const [notes, setNotes] = useState({});   // rowId -> text
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => buildVisitReport(cases), [cases]);
  const quarter = quarters.find((q) => q.id === quarterId) || current;

  const inQuarter = useMemo(
    () => all.filter((v) => v.due >= quarter.from && v.due <= quarter.to),
    [all, quarter],
  );
  // "באיחור" deliberately looks across every quarter — an overdue visit from a
  // past quarter still needs doing, and hiding it behind a quarter switch is
  // how it gets forgotten.
  const shown = useMemo(() => {
    const base = statusFilter === 'overdue' ? all : inQuarter;
    return base.filter((v) => {
      if (kindFilter !== 'all' && v.kind.key !== kindFilter) return false;
      if (statusFilter === 'open') return !v.done;
      if (statusFilter === 'done') return v.done;
      if (statusFilter === 'overdue') return v.overdue;
      return true;
    });
  }, [all, inQuarter, kindFilter, statusFilter]);
  const overdueAll = useMemo(() => all.filter((v) => v.overdue).length, [all]);

  const counts = useMemo(() => ({
    total: inQuarter.length,
    done: inQuarter.filter((v) => v.done).length,
    overdue: inQuarter.filter((v) => v.overdue).length,
    placement: inQuarter.filter((v) => v.kind.key === 'placement').length,
    day30: inQuarter.filter((v) => v.kind.key === 'day30').length,
    periodic: inQuarter.filter((v) => v.kind.key === 'periodic').length,
  }), [inQuarter]);

  const pending = Object.entries(draft).filter(([, d]) => d);

  async function saveAll() {
    if (!pending.length) return;
    setBusy(true);
    try {
      const entries = pending.map(([rowId, date]) => {
        const row = all.find((v) => v.rowId === rowId);
        return { caseObj: row.caseObj, visitId: row.id, date, note: notes[rowId] || '' };
      });
      await saveVisitsBatch(entries);
      setDraft({}); setNotes({});
      onChanged();
    } catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }

  const exportCsv = () => downloadCsv(`ogen-visits-${quarter.id}.csv`,
    ['#', 'עובד/ת', 'משפחה', 'ישוב', 'סוג ביקור', 'תאריך יעד', 'בוצע בתאריך', 'מצב', 'עו״ס', 'הערה'],
    shown.map((v) => [v.caseNumber, v.workerName, v.familyName, v.city, v.kind.label,
      fmtDate(v.due), v.doneDate ? fmtDate(v.doneDate) : '',
      v.done ? 'בוצע' : v.overdue ? 'באיחור' : 'ממתין', v.socialWorker, v.note]));

  const reportDue = reportDueFor(quarter.year, quarter.q);

  return (
    <>
      <div className="rg-report-bar">
        <label>רבעון
          <select value={quarterId} onChange={(e) => { setQuarterId(e.target.value); setDraft({}); }}>
            {quarters.map((q) => <option key={q.id} value={q.id}>{q.label}{q.current ? ' (נוכחי)' : ''}</option>)}
          </select>
        </label>
        <span className="sw-range">{fmtDate(quarter.from)} – {fmtDate(quarter.to)}</span>
        <span className="sw-duedate">📄 הגשת הדוח עד <b>{fmtDate(reportDue)}</b></span>
        <div className="rg-presets">
          <button className="rp-btn ghost sm" onClick={exportCsv}>⬇️ ייצוא</button>
        </div>
      </div>

      <div className="rg-kpis">
        <div className="rg-kpi"><b>{counts.total}</b><span>ביקורים ברבעון</span></div>
        <div className="rg-kpi"><b>{counts.done}</b><span>בוצעו</span></div>
        <div className={`rg-kpi${counts.overdue ? ' alert' : ''}`}><b>{counts.overdue}</b><span>באיחור</span></div>
        <div className="rg-kpi"><b>{counts.placement}</b><span>ביקורי השמה</span></div>
        <div className="rg-kpi"><b>{counts.day30}</b><span>ביקורי 30 יום</span></div>
        <div className="rg-kpi"><b>{counts.periodic}</b><span>ביקורים שוטפים</span></div>
      </div>

      <div className="rg-filters">
        <button className={`rg-chip${statusFilter === 'open' ? ' on' : ''}`} onClick={() => setStatusFilter('open')}>לביצוע ({counts.total - counts.done})</button>
        <button className={`rg-chip bad${statusFilter === 'overdue' ? ' on' : ''}`} onClick={() => setStatusFilter('overdue')}
          title="כולל ביקורים באיחור מרבעונים קודמים">באיחור — כל הרבעונים ({overdueAll})</button>
        <button className={`rg-chip${statusFilter === 'done' ? ' on' : ''}`} onClick={() => setStatusFilter('done')}>בוצעו ({counts.done})</button>
        <button className={`rg-chip${statusFilter === 'all' ? ' on' : ''}`} onClick={() => setStatusFilter('all')}>הכל ({counts.total})</button>
        <span className="sw-sep" />
        {['all', ...Object.keys(VISIT_KINDS)].map((k) => (
          <button key={k} className={`rg-chip${kindFilter === k ? ' on' : ''}`} onClick={() => setKindFilter(k)}>
            {k === 'all' ? 'כל הסוגים' : `${VISIT_KINDS[k].icon} ${VISIT_KINDS[k].short}`}
          </button>
        ))}
      </div>

      {shown.length ? (
        <>
          <div className="sw-batchbar">
            <span>עדכון ידני — לכל ביקור מזינים את <b>התאריך שבו העו״ס באמת ביקר</b>. אפשר למלא כמה שורות ולשמור בבת אחת.</span>
            <button className="rp-btn sm" disabled={!pending.length || busy} onClick={saveAll}>
              {busy ? 'שומר…' : `💾 שמור ${pending.length || ''} עדכונים`}
            </button>
          </div>
          <div className="rg-tablewrap">
            <table className="rg-table sw-table">
              <thead>
                <tr>
                  <th>#</th><th>עובד/ת</th><th>משפחה / מטופל</th><th>ישוב</th>
                  <th>סוג הביקור</th><th>תאריך יעד</th><th>מצב</th><th>בוצע בתאריך</th><th>הערה</th>
                </tr>
              </thead>
              <tbody>{shown.map((v) => (
                <tr key={v.rowId} className={v.done ? 'sw-done' : v.overdue ? 'rg-row-bad' : v.soon ? 'rg-row-warn' : ''}>
                  <td className="rg-num">{v.caseNumber || '—'}</td>
                  <td className="rg-link" onClick={() => onOpen(v.caseObj, 'worker')}><b>{v.workerName || '—'}</b></td>
                  <td className="rg-link" onClick={() => onOpen(v.caseObj, 'family')}>{v.familyName || '—'}</td>
                  <td>{v.city || '—'}</td>
                  <td><span className={`sw-kind ${v.kind.key}`}>{v.kind.icon} {v.kind.label}</span></td>
                  <td><b>{fmtDate(v.due)}</b></td>
                  <td>
                    {v.done ? <span className="rg-pill ok">בוצע</span>
                      : v.overdue ? <span className="rg-pill bad">באיחור {-v.daysLeft} ימים</span>
                      : <span className="rg-pill warn">בעוד {v.daysLeft} ימים</span>}
                  </td>
                  <td>
                    <input type="date" className="sw-date"
                      value={draft[v.rowId] ?? (v.doneDate ? isoOf(v.doneDate) : '')}
                      onChange={(e) => setDraft({ ...draft, [v.rowId]: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" className="sw-note" placeholder="הערה…"
                      value={notes[v.rowId] ?? v.note}
                      onChange={(e) => setNotes({ ...notes, [v.rowId]: e.target.value })} />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pending.length > 0 && (
            <div className="sw-savebar">
              <span>{pending.length} עדכונים ממתינים לשמירה</span>
              <button className="rp-btn" disabled={busy} onClick={saveAll}>{busy ? 'שומר…' : '💾 שמור הכל'}</button>
              <button className="rp-btn ghost" onClick={() => { setDraft({}); setNotes({}); }}>בטל</button>
            </div>
          )}
        </>
      ) : <p className="rg-empty">אין ביקורים בקטגוריה הזו ברבעון {quarter.q}/{quarter.year}.</p>}
    </>
  );
}
