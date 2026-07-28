import { useMemo, useState } from 'react';
import { RENEWAL_TYPES } from './registry.js';
import { buildVisitReport } from './socialWorker.js';

// The month view: everything that lands on a date — visits already done,
// renewals coming due, and social-worker visits still owed — on one calendar.
export default function CalendarReport({ cases, placements, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const monthStart = cursor;
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999), [cursor]);

  const events = useMemo(() => {
    const out = [];
    const add = (date, kind, label, who, caseObj, tone) => {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime()) || d < monthStart || d > monthEnd) return;
      out.push({ id: `${kind}-${who}-${d.getTime()}-${label}`, date: d, kind, label, who, caseObj, tone });
    };
    for (const c of cases) {
      const f = c.data?.fields || {};
      const who = c.family?.fullName || f.employerName || c.worker?.nameHe || '';
      for (const v of (f.visits || [])) add(v.date, 'visit', v.type || 'ביקור', who, c, 'ok');
      for (const t of RENEWAL_TYPES) if (f[t.key]) add(f[t.key], 'renew', t.short, who, c, 'warn');
    }
    for (const v of buildVisitReport(placements)) {
      if (v.done) continue;
      add(v.due, 'sw', `עו״ס — ${v.kind.short}`, v.workerName || v.familyName, v.caseObj, v.overdue ? 'bad' : 'info');
    }
    return out.sort((a, b) => a.date - b.date);
  }, [cases, placements, monthStart, monthEnd]);

  const cells = useMemo(() => {
    const lead = monthStart.getDay();
    const days = monthEnd.getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor, monthStart, monthEnd]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      const k = e.date.getDate();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    return m;
  }, [events]);

  const monthName = cursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const step = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <>
      <div className="rg-report-bar">
        <button className="rp-btn ghost sm" onClick={() => step(-1)}>&lsaquo; חודש קודם</button>
        <b className="cal-month">{monthName}</b>
        <button className="rp-btn ghost sm" onClick={() => step(1)}>חודש הבא &rsaquo;</button>
        <div className="rg-presets">
          <button className="rg-chip" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }}>החודש</button>
          <span className="rg-muted">{events.length} אירועים</span>
        </div>
      </div>
      <div className="cal-grid">
        {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => <div key={d} className="cal-head">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty" />;
          const list = byDay.get(d.getDate()) || [];
          const isToday = d.getTime() === today.getTime();
          return (
            <div key={d.getTime()} className={`cal-cell${isToday ? ' today' : ''}`}>
              <div className="cal-day">{d.getDate()}</div>
              {list.slice(0, 4).map((e) => (
                <button key={e.id} className={`cal-ev ${e.tone}`} onClick={() => onOpen(e.caseObj, 'family')} title={`${e.label} — ${e.who}`}>
                  {e.label} · {e.who}
                </button>
              ))}
              {list.length > 4 && <div className="cal-more">ועוד {list.length - 4}…</div>}
            </div>
          );
        })}
      </div>
      <p className="rg-legend">
        <span className="rg-pill ok">ביקור שבוצע</span>
        <span className="rg-pill info">ביקור עו״ס מתוכנן</span>
        <span className="rg-pill bad">ביקור עו״ס באיחור</span>
        <span className="rg-pill warn">חידוש</span>
      </p>
    </>
  );
}
