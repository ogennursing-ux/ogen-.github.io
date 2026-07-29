import { useEffect, useMemo, useState } from 'react';
import WorkerFormRouter from '../components/WorkerFormRouter.jsx';
import LangToggle from '../components/LangToggle.jsx';
import { api } from '../lib/api.js';
import { WORKER_ACCESS_CODE, COMPANY_NAME } from '../lib/workerPortal.js';
import { builtinWorkerTemplates, BUILTIN_PREFIX } from '../lib/prebuiltForms.js';
import { LangContext, getInitialLang, applyLang, useT } from '../lib/i18n.js';
import { loadVisitWorklist, prefillFor, markVisitDone } from '../lib/visitWorklist.js';

const AUTH_KEY = 'worker_auth';
// The worklist opens the home-visit form pre-filled from the file.
const HOME_VISIT_ID = BUILTIN_PREFIX + 'homeVisit';

const fmtDate = (d) => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};

function Header({ onLogout }) {
  const t = useT();
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">📋</span>
        <span className="brand-name">{t('טפסים לעובדים סוציאליים')}</span>
      </div>
      <div className="header-actions">
        <LangToggle />
        {onLogout && (
          <button className="header-settings" onClick={onLogout}>{t('התנתק')}</button>
        )}
      </div>
    </header>
  );
}

function AccessGate({ onEnter }) {
  const t = useT();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (code.trim() === WORKER_ACCESS_CODE) {
      try {
        localStorage.setItem(AUTH_KEY, '1');
      } catch {
        /* ignore */
      }
      onEnter();
    } else {
      setError(true);
    }
  };

  return (
    <div className="app">
      <Header />
      <div className="centered-screen">
        <form className="card login-card" onSubmit={submit}>
          <h2>{t('כניסה לפורטל הטפסים')}</h2>
          <p className="muted">{t('הזן/י את קוד הגישה שקיבלת מ{company}.', { company: COMPANY_NAME })}</p>
          <label className="field-label">{t('קוד גישה')}</label>
          <input
            className="text-input"
            dir="ltr"
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <p className="login-error">{t('קוד גישה שגוי')}</p>}
          <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>
            {t('כניסה')}
          </button>
        </form>
      </div>
    </div>
  );
}

// The visits due across all active placements — pulled live from the office
// files, so the social worker sees exactly who to visit and opens a form that
// is already filled with that person's details.
function Worklist({ onVisit, onForms, onLogout }) {
  const t = useT();
  const [state, setState] = useState({ status: 'loading' });
  const [kind, setKind] = useState('all'); // all | placement | day30 | periodic

  useEffect(() => {
    let alive = true;
    loadVisitWorklist()
      .then((rows) => alive && setState({ status: 'ready', rows }))
      .catch((e) => { console.error(e); return alive && setState({ status: 'error', error: e?.message || String(e) }); });
    return () => { alive = false; };
  }, []);

  const rows = state.rows || [];
  const overdue = useMemo(() => rows.filter((v) => v.overdue).length, [rows]);
  const shown = useMemo(
    () => (kind === 'all' ? rows : rows.filter((v) => v.kind.key === kind)),
    [rows, kind],
  );
  const kinds = [
    { k: 'all', label: t('הכל') },
    { k: 'placement', label: '🤝 ' + t('השמה') },
    { k: 'day30', label: '📅 ' + t('30 יום') },
    { k: 'periodic', label: '🔄 ' + t('שוטף') },
  ];

  return (
    <div className="app">
      <Header onLogout={onLogout} />
      <div className="centered-screen">
        <div className="card" style={{ maxWidth: 760, width: '100%' }}>
          <div className="wl-head">
            <div>
              <h2 style={{ margin: 0 }}>{t('ביקורים לביצוע')}</h2>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {t('הרשימה נשלפת ישירות מהתיקים במשרד. לחיצה פותחת טופס ביקור בית מלא מראש.')}
              </p>
            </div>
            <button className="btn-ghost sm" onClick={onForms}>{t('טפסים אחרים')}</button>
          </div>

          {state.status === 'loading' && <p className="muted">{t('טוען…')}</p>}
          {state.status === 'error' && (
            <div className="wl-error">
              <p>{t('לא הצלחנו לטעון את רשימת הביקורים.')}</p>
              <p className="muted" dir="ltr" style={{ fontSize: 12 }}>{state.error}</p>
            </div>
          )}

          {state.status === 'ready' && (
            <>
              <div className="wl-kpis">
                <div className="wl-kpi"><b>{rows.length}</b><span>{t('ממתינים לביקור')}</span></div>
                <div className={`wl-kpi${overdue ? ' alert' : ''}`}><b>{overdue}</b><span>{t('באיחור')}</span></div>
              </div>
              <div className="wl-filters">
                {kinds.map((x) => (
                  <button key={x.k} className={`wl-chip${kind === x.k ? ' on' : ''}`} onClick={() => setKind(x.k)}>
                    {x.label}
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <p className="muted" style={{ marginTop: 16 }}>{t('אין ביקורים ממתינים בקטגוריה זו.')}</p>
              ) : (
                <ul className="wl-list">
                  {shown.map((v) => (
                    <li key={v.rowId} className={`wl-item${v.overdue ? ' overdue' : ''}`}>
                      <div className="wl-main">
                        <div className="wl-names">
                          <span className="wl-worker">{v.workerName || '—'}</span>
                          <span className="wl-sep">·</span>
                          <span className="wl-family">{v.familyName || '—'}</span>
                        </div>
                        <div className="wl-meta">
                          <span className={`wl-kind ${v.kind.key}`}>{v.kind.icon} {v.kind.label}</span>
                          {v.city && <span className="wl-city">📍 {v.city}</span>}
                          <span className="wl-due">🗓️ {fmtDate(v.due)}</span>
                          {v.overdue
                            ? <span className="wl-pill bad">{t('באיחור')}</span>
                            : <span className="wl-pill warn">{t('בעוד')} {v.daysLeft} {t('ימים')}</span>}
                        </div>
                      </div>
                      <button className="btn-primary sm" onClick={() => onVisit(v)}>
                        {t('פתח טופס ביקור')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FormsList({ onSelect, onBack, onLogout }) {
  const t = useT();
  const [items, setItems] = useState(null);

  useEffect(() => {
    // Built-in forms are always available; published forms are added on top.
    const builtins = builtinWorkerTemplates();
    api
      .listWorkerTemplates()
      .then((rows) => setItems([...builtins, ...rows.filter((r) => r.signers?.active !== false)]))
      .catch((e) => {
        console.error(e);
        setItems(builtins);
      });
  }, []);

  return (
    <div className="app">
      <Header onLogout={onLogout} />
      <div className="centered-screen">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="wl-head">
            <h2 style={{ margin: 0 }}>{t('טפסים זמינים למילוי')}</h2>
            {onBack && <button className="btn-ghost sm" onClick={onBack}>{t('חזרה לביקורים')}</button>}
          </div>
          <p className="muted">{t('בחר/י טופס, מלא/י אותו ושלח/י — הוא יגיע ישירות ל{company}.', { company: COMPANY_NAME })}</p>
          {items === null && <p className="muted">{t('טוען…')}</p>}
          {items && !items.length && <p className="muted">{t('אין כרגע טפסים זמינים.')}</p>}
          {items && items.length > 0 && (
            <ul className="req-list">
              {items.map((item) => (
                <li key={item.id} className="tmpl-item">
                  <div className="tmpl-row">
                    <div className="req-main">
                      <span className="req-title">{item.title || t('טופס')}</span>
                      {item.description && <span className="req-sub">{item.description}</span>}
                    </div>
                    <div className="req-side">
                      <button className="btn-primary sm" onClick={() => onSelect(item.id)}>
                        {t('מלא/י טופס')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkerApp() {
  const [lang, setLang] = useState(getInitialLang);
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [formId, setFormId] = useState(() => new URLSearchParams(location.search).get('form'));
  const [prefill, setPrefill] = useState(null);
  // The visit whose form is open — so submitting it can mark it done in the office.
  const [pendingVisit, setPendingVisit] = useState(null);
  // Landing screen when no form is open: the visit worklist, or the plain
  // forms list ("טפסים אחרים").
  const [screen, setScreen] = useState('worklist');

  useEffect(() => {
    applyLang(lang);
  }, [lang]);

  function logout() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setAuthed(false);
  }

  function selectForm(id, values = null) {
    setPrefill(values);
    setFormId(id);
    const url = new URL(location.href);
    url.searchParams.set('form', id);
    history.replaceState({}, '', url);
  }

  // Open the home-visit form pre-filled from the chosen case.
  function openVisit(visit) {
    const values = prefillFor('homeVisit', visit.caseObj, visit);
    setPendingVisit(visit);
    selectForm(HOME_VISIT_ID, values);
  }

  // After the social worker submits a visit form, record it as done on the
  // office file so both sides stay in sync.
  async function onVisitSubmitted(values) {
    if (!pendingVisit) return;
    await markVisitDone(pendingVisit.caseObj, pendingVisit.id, values?.visitDate);
  }

  function backToList() {
    setFormId(null);
    setPrefill(null);
    setPendingVisit(null);
    const url = new URL(location.href);
    url.searchParams.delete('form');
    history.replaceState({}, '', url);
  }

  let view;
  if (!authed) {
    view = <AccessGate onEnter={() => setAuthed(true)} />;
  } else if (formId) {
    view = (
      <WorkerFormRouter
        id={formId}
        brandIcon="📋"
        brandLabel="טפסים לעובדים סוציאליים"
        onBack={backToList}
        initialValues={prefill}
        onSubmitted={pendingVisit ? onVisitSubmitted : null}
      />
    );
  } else if (screen === 'forms') {
    view = <FormsList onSelect={(id) => selectForm(id)} onBack={() => setScreen('worklist')} onLogout={logout} />;
  } else {
    view = <Worklist onVisit={openVisit} onForms={() => setScreen('forms')} onLogout={logout} />;
  }

  return <LangContext.Provider value={{ lang, setLang }}>{view}</LangContext.Provider>;
}
