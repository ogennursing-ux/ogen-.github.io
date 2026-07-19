import { useState } from 'react';
import LangToggle from './LangToggle.jsx';
import BrandName from './BrandName.jsx';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { useT } from '../lib/i18n.js';

// Simple client-side gate for the owner area. NOTE: this is a basic gate, not
// strong security — the check runs in the browser. Either the short name or the
// full company name is accepted as the username, so the login keeps working
// after the rebrand.
const USERS = ['עוגן סיעוד', COMPANY_NAME, 'קליק חתימה'];
const PASS = '12345';

export default function Login({ onLogin }) {
  const t = useT();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (USERS.includes(user.trim()) && pass === PASS) {
      try {
        localStorage.setItem('ogen_auth', '1');
      } catch {
        /* ignore */
      }
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="brand-mark brand-logo" src="./klik-icon.png" alt="" />
          <BrandName />
        </div>
        <LangToggle />
      </header>
      <div className="centered-screen">
        <form className="card login-card" onSubmit={submit}>
          <img className="login-logo" src="./klik-logo.png" alt="קליק חתימה" />
          <h2>{t('כניסה למערכת')}</h2>
          <label className="field-label">{t('שם משתמש')}</label>
          <input className="text-input" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
          <label className="field-label" style={{ marginTop: 10 }}>{t('סיסמה')}</label>
          <input
            className="text-input"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          {error && <p className="login-error">{t('שם משתמש או סיסמה שגויים')}</p>}
          <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>
            {t('התחבר')}
          </button>
          <div className="legal-links">
            <a href="./legal.html#terms" target="_blank" rel="noreferrer">{t('תנאי שימוש')}</a>
            <span aria-hidden>·</span>
            <a href="./legal.html#privacy" target="_blank" rel="noreferrer">{t('מדיניות פרטיות')}</a>
            <span aria-hidden>·</span>
            <a href="./legal.html#accessibility" target="_blank" rel="noreferrer">{t('הצהרת נגישות')}</a>
          </div>
        </form>
      </div>
    </div>
  );
}
