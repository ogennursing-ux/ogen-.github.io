import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import {
  loadRegistry, searchFamilies, searchWorkers, computeRenewalRows, saveRenewalDate,
  loadLeads, createLead, convertLeadToCase, dismissLead, RENEWAL_TYPES, createCase,
  activePlacements, setWorkerPaymentDone,
} from './registry.js';
import { payments } from './caseDetail.js';
import RecordPage from './RecordPage.jsx';
import { REPORT_GROUPS } from './reports.js';
import { openRecordTab } from './recordLink.js';
import { seedDemoData, clearDemoData } from './demoData.js';
import { buildVisitReport } from './socialWorker.js';
import { buildAgenda, BUCKETS } from './agenda.js';
import AiBriefing from './AiBriefing.jsx';

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
                    <button className="rp-btn ghost sm" onClick={async () => {
                      if (!confirm('להפוך לתיק פעיל?')) return;
                      const id = await convertLeadToCase(l);
                      onChanged();
                      if (id) openRecordTab('family', id);
                    }}>➡️ לתיק</button>
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

// The home screen: today's date, who is connected, and the to-do list grouped
// into overdue / today / this-week / this-month. Every item opens its file.
function HomeAgenda({ agenda, me, rakazim, onMe, onOpen }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dueLabel = (item) => {
    if (item.days < 0) return `לפני ${Math.abs(item.days)} ימים`;
    if (item.days === 0) return 'היום';
    if (item.days === 1) return 'מחר';
    return `בעוד ${item.days} ימים`;
  };
  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h2>שלום 👋</h2>
          <p className="home-date">{dateStr}</p>
        </div>
        <label className="home-me">
          מחובר/ת כ־
          <select value={me} onChange={(e) => onMe(e.target.value)}>
            <option value="">כל המשרד</option>
            {rakazim.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      {agenda.total === 0 ? (
        <div className="home-empty">
          <span>✅</span>
          <p>אין משימות פתוחות לתקופה הקרובה{me ? ` עבור ${me}` : ''}. יום טוב!</p>
        </div>
      ) : (
        <div className="home-groups">
          {agenda.groups.map((g) => (
            <section key={g.key} className={`home-group ${g.tone}`}>
              <h3>{g.label} <em>{g.items.length}</em></h3>
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <button className="home-task" onClick={() => onOpen(item)} disabled={!item.caseObj && !item.lead}>
                      <span className="home-task-icon">{item.icon}</span>
                      <span className="home-task-main">
                        <b>{item.label}</b>
                        <i>{item.who}</i>
                      </span>
                      <span className="home-task-when">{dueLabel(item)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RegistryApp() {
  const [authed, setAuthed] = useState(isAuthed());
  const [cases, setCases] = useState(null);
  const [leads, setLeads] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('home');
  const [me, setMe] = useState(() => { try { return localStorage.getItem('ogen_me') || ''; } catch { return ''; } });
  const [q, setQ] = useState('');
  const [renewFilter, setRenewFilter] = useState('all');
  const [rakazFilter, setRakazFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, ''));
  const setConnected = (v) => { setMe(v); try { localStorage.setItem('ogen_me', v); } catch { /* ignore */ } };

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

  const branches = useMemo(() => {
    const s2 = new Set();
    for (const c of cases || []) { const b2 = c.data?.fields?.branch; if (b2) s2.add(b2); }
    return [...s2].sort();
  }, [cases]);

  // "דוח על פי חתך" — every list and report narrows by coordinator and branch.
  const byRakaz = (list) => {
    let out = list;
    if (rakazFilter) out = out.filter((c) => c.data?.fields?.assignedTo === rakazFilter);
    if (branchFilter) out = out.filter((c) => c.data?.fields?.branch === branchFilter);
    return out;
  };
  const families = useMemo(() => (cases ? byRakaz(searchFamilies(cases, q)) : []), [cases, q, rakazFilter, branchFilter]);
  const workers = useMemo(() => (cases ? byRakaz(searchWorkers(cases, q)) : []), [cases, q, rakazFilter, branchFilter]);
  const renewals = useMemo(() => (cases ? computeRenewalRows(byRakaz(cases)) : []), [cases, rakazFilter, branchFilter]);
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
  const placements = useMemo(() => (cases ? byRakaz(activePlacements(cases)) : []), [cases, rakazFilter, branchFilter]);
  const socialOverdue = useMemo(
    () => (cases ? buildVisitReport(activePlacements(cases)).filter((v) => v.overdue).length : 0),
    [cases],
  );

  // The last file of each kind you opened — that is what "משפחות" / "עובדים"
  // reopens. If you have not opened one yet, fall back to the newest registered.
  const lastOpened = (kind, list) => {
    let id = '';
    try { id = localStorage.getItem(`ogen_last_${kind}`) || ''; } catch { /* ignore */ }
    const found = id && list.find((c) => c.id === id || (c.ids || []).includes(id));
    if (found) return found;
    return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  };
  const allFamilies = useMemo(() => (cases ? cases.filter((c) => c.family?.fullName) : []), [cases]);
  const allWorkers = useMemo(() => (cases ? cases.filter((c) => c.worker?.nameEn || c.worker?.nameHe) : []), [cases]);
  const latestFamily = useMemo(() => lastOpened('family', allFamilies), [allFamilies, route]);
  const latestWorker = useMemo(() => lastOpened('worker', allWorkers), [allWorkers, route]);

  // The home screen's to-do list, for the connected coordinator (or everyone
  // until one is chosen).
  const agenda = useMemo(() => {
    if (!cases) return { groups: [], total: 0 };
    const mine = me ? cases.filter((c) => c.data?.fields?.assignedTo === me) : cases;
    const myLeads = me ? leads.filter((l) => (l.data?.fields?.assignedTo || '') === me || !l.data?.fields?.assignedTo) : leads;
    return buildAgenda(mine, myLeads);
  }, [cases, leads, me]);

  // ---- record page routing (#registry/f/<id> | #registry/w/<id>) ----
  const m = /^registry\/(f|w)\/(.+)$/.exec(route);
  const openRecord = m && cases ? cases.find((c) => c.id === m[2]) : null;
  const openKind = m && m[1] === 'w' ? 'worker' : 'family';

  // Opening a file always opens a browser tab, so the list you were reading
  // stays exactly where it was. The tab is opened straight from the click —
  // no await in front of it — or the browser would block it as a popup.
  const goRecord = (c, kind) => openRecordTab(kind, c.id);
  const goList = () => { location.hash = 'registry'; window.scrollTo(0, 0); };

  // "לקוח חדש" — create an empty case from the office and open it.
  async function newCase(kind) {
    const name = prompt(kind === 'worker' ? 'שם העובד/ת החדש/ה:' : 'שם המטופל / מעסיק:');
    if (name == null || !name.trim()) return;
    try {
      const seed = kind === 'worker' ? { nameHe: name.trim() } : { employerName: name.trim() };
      const id = await createCase(seed);
      await reload();
      openRecordTab(kind, id);
    } catch (e) { alert(e?.message || e); }
  }

  // Ordered list behind the record page, so it can offer prev/next.
  const siblingsFor = (kind) => (kind === 'worker' ? workers : families);

  function exportCsv() {
    if (tab === 'workers') {
      downloadCsv('ogen-workers.csv',
        ['מס׳ תיק', 'שם עובד/ת', 'דרכון', 'אזרחות', 'טלפון', 'תוקף אשרה', 'תוקף דרכון', 'משפחה', 'רכז/ת'],
        workers.map((c) => { const f = c.data?.fields || {}; return [f.caseNumber || '', c.worker?.nameEn || c.worker?.nameHe || '',
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
          c.worker?.nameEn || c.worker?.nameHe || '', f.assignedTo || '',
          payments(c).reduce((s, p) => s + (Number(p.amount) || 0), 0)]; }));
    }
  }

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  if (openRecord) {
    return (
      <div className="rg-shell">
        <RecordPage
          caseObj={openRecord}
          kind={openKind}
          siblings={siblingsFor(openKind)}
          onNavigate={(c) => { location.hash = `registry/${openKind === 'worker' ? 'w' : 'f'}/${c.id}`; window.scrollTo(0, 0); }}
          onBack={goList}
          onChanged={reload}
        />
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
        <button className={`rg-tab${tab === 'home' ? ' on' : ''}`} onClick={() => setTab('home')}>
          🏠 בית {agenda.total > 0 && <em className={agenda.groups[0]?.key === 'overdue' ? 'alert' : ''}>{agenda.total}</em>}
        </button>
        <button className={`rg-tab${tab === 'families' ? ' on' : ''}`} onClick={() => setTab('families')}>👨‍👩‍👧 משפחות</button>
        <button className={`rg-tab${tab === 'workers' ? ' on' : ''}`} onClick={() => setTab('workers')}>👷 עובדים</button>
        <button className={`rg-tab${tab === 'placements' ? ' on' : ''}`} onClick={() => setTab('placements')}>🤝 השמות פעילות <em>{placements.length}</em></button>
        <button className={`rg-tab${tab === 'renewals' ? ' on' : ''}`} onClick={() => setTab('renewals')}>
          🔔 דוח חידושים {renewCounts.overdue + renewCounts.urgent > 0 && <em className="alert">{renewCounts.overdue + renewCounts.urgent}</em>}
        </button>
        <button className={`rg-tab${tab === 'reports' ? ' on' : ''}`} onClick={() => setTab('reports')}>
          📊 דוחות {socialOverdue > 0 && <em className="alert">{socialOverdue}</em>}
        </button>
        <button className={`rg-tab${tab === 'leads' ? ' on' : ''}`} onClick={() => setTab('leads')}>📞 פניות <em>{leads.length}</em></button>
        <a className="rg-tab" href="#templates">📑 תבניות חוזים</a>
        <a className="rg-tab" href="#quality">🔎 תקינות</a>
        <a className="rg-tab rg-tab-ai" href="#assistant">🤖 עוזר AI</a>
      </nav>

      {tab !== 'home' && (
      <div className="rg-toolbar">
        {(tab === 'families' || tab === 'workers') && (
          <input className="rg-search" placeholder="🔍 חיפוש לפתיחת תיק אחר — שם / ת״ז / דרכון / טלפון…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        {rakazim.length > 0 && tab !== 'leads' && (
          <select className="rg-select" value={rakazFilter} onChange={(e) => setRakazFilter(e.target.value)}>
            <option value="">כל הרכזים</option>
            {rakazim.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {branches.length > 0 && tab !== 'leads' && (
          <select className="rg-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">כל הסניפים</option>
            {branches.map((b2) => <option key={b2} value={b2}>{b2}</option>)}
          </select>
        )}
        {tab === 'families' && <button className="rp-btn" onClick={() => newCase('family')}>+ לקוח חדש</button>}
        {tab === 'workers' && <button className="rp-btn" onClick={() => newCase('worker')}>+ עובד/ת חדש/ה</button>}
        {tab !== 'leads' && <button className="rp-btn ghost" onClick={exportCsv}>⬇️ ייצוא Excel</button>}
        <DemoDataButton cases={cases} onChanged={reload} />
      </div>
      )}

      {err && <p className="rg-err">{err}</p>}
      {cases === null && !err && <p className="rg-empty">טוען…</p>}

      {cases && tab === 'home' && (
        <>
          <AiBriefing />
          <HomeAgenda agenda={agenda} me={me} rakazim={rakazim} onMe={setConnected}
            onOpen={(item) => {
              if (item.lead) { setTab('leads'); return; }
              if (item.caseObj) openRecordTab(item.recordKind, item.caseObj.id);
            }} />
        </>
      )}

      {cases && tab === 'families' && (
        q ? (
          families.length ? (
          <div className="rg-tablewrap">
            <table className="rg-table">
              <thead><tr><th>#</th><th>שם המטופל / מעסיק</th><th>ת״ז</th><th>טלפון</th><th>ישוב</th><th>עובד/ת</th><th>רכז/ת</th><th>תוקף היתר</th><th>סטטוס</th></tr></thead>
              <tbody>{families.map((c) => { const f = c.data?.fields || {}; return (
                <tr key={c.id} className="rg-clickrow" title="פתיחת התיק בלשונית חדשה" onClick={() => goRecord(c, 'family')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.family?.fullName || 'ללא שם'}</b><MergedTag c={c} /></td>
                  <td dir="ltr">{c.family?.idNumber || '—'}</td>
                  <td dir="ltr">{c.family?.phone || '—'}</td>
                  <td>{c.family?.city || '—'}</td>
                  <td className="rg-muted">{c.worker?.nameEn || c.worker?.nameHe || '—'}</td>
                  <td>{f.assignedTo || '—'}</td>
                  <td><DateCell value={f.permitExpiry} /></td>
                  <td><Pill stage={c.stage} /></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
          ) : <p className="rg-empty">לא נמצאו משפחות התואמות לחיפוש.</p>
        ) : latestFamily ? (
          <RecordPage caseObj={latestFamily} kind="family" onChanged={reload} />
        ) : <p className="rg-empty">אין עדיין משפחות. הוסיפו לקוח חדש, או צרו נתוני הדגמה.</p>
      )}

      {cases && tab === 'workers' && (
        q ? (
          workers.length ? (
          <div className="rg-tablewrap">
            <table className="rg-table">
              <thead><tr><th>#</th><th>שם העובד/ת</th><th>דרכון</th><th>אזרחות</th><th>טלפון</th><th>תוקף אשרה</th><th>תוקף דרכון</th><th>משפחה</th><th>סטטוס</th></tr></thead>
              <tbody>{workers.map((c) => { const f = c.data?.fields || {}; return (
                <tr key={c.id} className="rg-clickrow" title="פתיחת התיק בלשונית חדשה" onClick={() => goRecord(c, 'worker')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.worker?.nameEn || c.worker?.nameHe || 'ללא שם'}</b><MergedTag c={c} /></td>
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
          ) : <p className="rg-empty">לא נמצאו עובדים התואמים לחיפוש.</p>
        ) : latestWorker ? (
          <RecordPage caseObj={latestWorker} kind="worker" onChanged={reload} />
        ) : <p className="rg-empty">אין עדיין עובדים. הוסיפו עובד/ת חדש/ה, או צרו נתוני הדגמה.</p>
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
                    <th className="rg-renew-col wpay" title="התשלום הבא של העובד/ת — התאריך והמספר, או ״שילם הכל״">תשלום הבא</th>
                  </tr>
                </thead>
                <tbody>{shownRenewals.map((r) => (
                  <tr key={r.id}>
                    <td className="rg-num">{r.caseNumber || '—'}</td>
                    <td className="rg-link" onClick={() => openRecordTab('worker', r.caseObj.id)} title="פתיחת תיק העובד/ת בלשונית חדשה"><b>{r.workerName || '—'}</b></td>
                    <td dir="ltr">{r.passportNo || '—'}</td>
                    <td>{r.arrivalDate ? fmtDate(r.arrivalDate) : '—'}</td>
                    <td dir="ltr">{r.workerPhone || '—'}</td>
                    <td className="rg-link" onClick={() => openRecordTab('family', r.caseObj.id)} title="פתיחת תיק המשפחה בלשונית חדשה">{r.employerName || '—'}</td>
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
                    {(() => {
                      const cell = r.cells.wpayNext;
                      if (cell.allPaid) return <td className="rg-renew-col wpay rg-cell-paid" title="כל התשלומים שולמו"><span className="rg-wpay-done">✓ שילם הכל</span></td>;
                      if (cell.none || !cell.due) return <td className="rg-renew-col wpay rg-cell-empty"><span className="rg-muted">—</span></td>;
                      const cls = cell.overdue ? 'rg-cell-bad' : cell.thisWeek ? 'rg-cell-week' : cell.urgent ? 'rg-cell-warn' : '';
                      return (
                        <td className={`rg-renew-col wpay ${cls}`}
                            title={`תשלום ${cell.number} — ${cell.daysLeft >= 0 ? `בעוד ${cell.daysLeft} ימים` : `עבר לפני ${-cell.daysLeft} ימים`}. לחיצה מסמנת כשולם.`}>
                          <button className="rg-wpay-btn" title="סמן את התשלום הזה כשולם"
                            onClick={async (e) => { e.stopPropagation(); await setWorkerPaymentDone(r.caseObj, cell.key, true); reload(); }}>
                            {fmtDate(cell.due)} <b className="rg-wpay-num">· {cell.number}</b>
                          </button>
                        </td>
                      );
                    })()}
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
                <tr key={c.id} className="rg-clickrow" title="פתיחת התיק בלשונית חדשה" onClick={() => goRecord(c, 'worker')}>
                  <td className="rg-num">{f.caseNumber || '—'}</td>
                  <td><b>{c.worker?.nameEn || c.worker?.nameHe}</b></td>
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

      {tab === 'reports' && <ReportsTab />}

      {tab === 'leads' && <LeadsTab leads={leads} onChanged={reload} />}

      <footer className="rg-foot"><a href="privacy.html" target="_blank" rel="noreferrer">🔒 מדיניות פרטיות ותנאי שימוש</a></footer>
    </div>
  );
}

// The reports screen, laid out the way the office's own one is: numbered
// reports grouped into columns, general on top and per-coordinator below.
// Clicking one opens a fresh browser tab — first the parameters page (dates /
// quarter / coordinator), then the results — so a report you ran stays open
// next to the record you are working on.
function ReportsTab() {
  // Two sides, like the office's own reports screen: the everyday reports on
  // one side, the statistical roll-ups on the other.
  const [side, setSide] = useState('general');
  const href = (key) => `${location.pathname}${location.search}#report/${key}`;
  const groups = REPORT_GROUPS.filter((g) => (side === 'stats' ? g.id === 'stats' : g.id !== 'stats'));
  const statsCount = REPORT_GROUPS.find((g) => g.id === 'stats')?.reports.length || 0;
  const genCount = REPORT_GROUPS.filter((g) => g.id !== 'stats').reduce((n, g) => n + g.reports.length, 0);

  return (
    <div>
      <div className="rpt-sides">
        <button className={`rpt-side${side === 'general' ? ' on' : ''}`} onClick={() => setSide('general')}>
          📋 דוחות כלליים ואישיים <em>{genCount}</em>
        </button>
        <button className={`rpt-side${side === 'stats' ? ' on' : ''}`} onClick={() => setSide('stats')}>
          📈 דוחות סטטיסטיים <em>{statsCount}</em>
        </button>
      </div>

      <div className="rpt-catalog">
        {groups.map((g) => (
          <section key={g.id} className="rpt-group">
            <h3>{g.icon} {g.title} <em>{g.scope}</em></h3>
            <ul>
              {g.reports.map((r) => (
                <li key={r.key}>
                  <a href={r.to ? `${location.pathname}${location.search}${r.to}` : href(r.key)} target="_blank" rel="noreferrer"
                    className={r.soon ? 'soon' : undefined} title={r.to ? 'פתיחת מסך הקבלות והחשבוניות' : (r.soon || r.desc)}>
                    <span className="rpt-rowno">{r.no}</span>
                    <span className="rpt-rowlabel">{r.label}</span>
                    {r.soon && <span className="rpt-rowtag">בהמתנה</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="rpt-legend">
          כל דוח נפתח בלשונית חדשה ↗ · דוח מסומן <span className="rpt-rowtag">בהמתנה</span> שמור במקומו,
          השדות שלו כבר נאספים והוא יחושב ברגע שנסגור את הכללים.
        </p>
      </div>
    </div>
  );
}

// Thirty made-up placements to try the system on. They are tagged, counted and
// removable in one click, so demo data can never be mistaken for real files.
function DemoDataButton({ cases, onChanged }) {
  const [busy, setBusy] = useState('');
  // Count the underlying rows, not the merged cases, so the button says
  // exactly how many rows the delete will remove.
  const demoCount = (cases || []).reduce(
    (n, c) => n + (c.data?.demo ? (c.ids?.length || 1) : 0), 0);

  async function add() {
    if (!confirm('ליצור 30 משפחות ו־30 עובדים לדוגמה?\n\nאלה תיקי הדגמה מסומנים — אפשר למחוק את כולם בלחיצה אחת.')) return;
    setBusy('add');
    try { const n = await seedDemoData(); onChanged(); alert(`נוצרו ${n} תיקי הדגמה.`); }
    catch (e) { alert(e?.message || e); } finally { setBusy(''); }
  }
  async function remove() {
    if (!confirm(`למחוק את כל ${demoCount} תיקי ההדגמה?\n\nתיקים אמיתיים לא ייגעו.`)) return;
    setBusy('del');
    try { const n = await clearDemoData(); onChanged(); alert(`נמחקו ${n} תיקי הדגמה.`); }
    catch (e) { alert(e?.message || e); } finally { setBusy(''); }
  }

  if (demoCount) {
    return (
      <button className="rp-btn ghost demo" disabled={!!busy} onClick={remove}>
        {busy === 'del' ? 'מוחק…' : `🧪 מחק ${demoCount} תיקי הדגמה`}
      </button>
    );
  }
  return (
    <button className="rp-btn ghost demo" disabled={!!busy} onClick={add}>
      {busy === 'add' ? 'יוצר…' : '🧪 צור נתוני הדגמה'}
    </button>
  );
}

// The same person used to appear once per submission. They are merged now by
// passport (or ID); this marks the merged rows so nothing looks lost.
function MergedTag({ c }) {
  if (!(c.duplicateOf > 1)) return null;
  return (
    <span className="rg-merged" title={`${c.duplicateOf} רשומות של אותו אדם אוחדו לתיק אחד`}>
      אוחד ×{c.duplicateOf}
    </span>
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
