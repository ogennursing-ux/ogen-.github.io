import { useEffect, useState } from 'react';
import FormSignerView from '../components/FormSignerView.jsx';
import LangToggle from '../components/LangToggle.jsx';
import { api } from '../lib/api.js';
import { WORKER_ACCESS_CODE } from '../lib/workerPortal.js';
import { LangContext, getInitialLang, applyLang, useT } from '../lib/i18n.js';

const AUTH_KEY = 'worker_auth';

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
          <p className="muted">{t('הזן/י את קוד הגישה שקיבלת מעוגן סיעוד.')}</p>
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

function FormsList({ onSelect }) {
  const t = useT();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api
      .listWorkerTemplates()
      .then((rows) => setItems(rows.filter((r) => r.signers?.active !== false)))
      .catch((e) => {
        console.error(e);
        setItems([]);
      });
  }, []);

  return (
    <div className="centered-screen">
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>{t('טפסים זמינים למילוי')}</h2>
        <p className="muted">{t('בחר/י טופס, מלא/י אותו ושלח/י — הוא יגיע ישירות לעוגן סיעוד.')}</p>
        {items === null && <p className="muted">{t('טוען…')}</p>}
        {items && !items.length && <p className="muted">{t('אין כרגע טפסים זמינים.')}</p>}
        {items && items.length > 0 && (
          <ul className="req-list">
            {items.map((item) => (
              <li key={item.id} className="tmpl-item">
                <div className="tmpl-row">
                  <div className="req-main">
                    <span className="req-title">{item.title || t('טופס')}</span>
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

  function selectForm(id) {
    setFormId(id);
    const url = new URL(location.href);
    url.searchParams.set('form', id);
    history.replaceState({}, '', url);
  }

  function backToList() {
    setFormId(null);
    const url = new URL(location.href);
    url.searchParams.delete('form');
    history.replaceState({}, '', url);
  }

  let view;
  if (!authed) {
    view = <AccessGate onEnter={() => setAuthed(true)} />;
  } else if (formId) {
    view = (
      <FormSignerView
        id={formId}
        brandIcon="📋"
        brandLabel="טפסים לעובדים סוציאליים"
        onBack={backToList}
      />
    );
  } else {
    view = (
      <div className="app">
        <Header onLogout={logout} />
        <FormsList onSelect={selectForm} />
      </div>
    );
  }

  return <LangContext.Provider value={{ lang, setLang }}>{view}</LangContext.Provider>;
}
