import { useMemo, useState } from 'react';
import LangToggle from './LangToggle.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64, getIp } from '../lib/notify.js';
import { buildFormPdf } from '../lib/formPdf.js';
import { emptyValue, isSchemaValueEmpty, formMeta } from '../lib/formSchema.js';
import { useT } from '../lib/i18n.js';

function download(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// gov.il-style fill experience for a structured worker form.
export default function StructuredFormView({ template, brandIcon = '📋', brandLabel, onBack }) {
  const t = useT();
  const meta = useMemo(() => formMeta(template), [template]);
  const schema = meta.schema;
  const title = template?.title || 'טופס';

  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of schema) if (f.type !== 'section') v[f.id] = emptyValue(f.type);
    return v;
  });
  const [status, setStatus] = useState('ready'); // ready | done
  const [busy, setBusy] = useState(false);
  const [signedBytes, setSignedBytes] = useState(null);
  const [invalid, setInvalid] = useState(() => new Set());

  const set = (id, val) => setValues((v) => ({ ...v, [id]: val }));

  async function submit() {
    const missing = new Set();
    for (const f of schema) {
      if (f.type === 'section') continue;
      if (f.required && isSchemaValueEmpty(f, values[f.id])) missing.add(f.id);
    }
    setInvalid(missing);
    if (missing.size) {
      alert(t('יש למלא את כל שדות החובה (המסומנים ב-*).'));
      const first = document.querySelector('.gov-field.invalid input, .gov-field.invalid select, .gov-field.invalid textarea');
      first?.focus();
      return;
    }
    setBusy(true);
    try {
      const bytes = await buildFormPdf(title, schema, values);
      await api.submitForm(template, { fields: { schema, values }, signedPdfBytes: bytes });
      setSignedBytes(bytes);
      setStatus('done');
      if (template.webhook_url && template.owner_email) {
        const ip = await getIp();
        notify(template.webhook_url, {
          type: 'completed',
          to: template.owner_email,
          title,
          link: location.href,
          fileName: `${title}.pdf`,
          fileBase64: bytesToBase64(bytes),
          ip,
        });
      }
    } catch (e) {
      console.error(e);
      alert(t('שליחת הטופס נכשלה') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">{brandIcon}</span>
        <span className="brand-name">{t(brandLabel || 'טפסים לעובדים סוציאליים')}</span>
      </div>
      <div className="header-actions">
        <LangToggle />
        {onBack && <button className="header-settings" onClick={onBack}>{t('חזרה לרשימה')}</button>}
      </div>
    </header>
  );

  if (status === 'done') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen">
          <div className="card">
            <div className="big-check" aria-hidden>✓</div>
            <h2>{t('תודה! הטופס נשלח')}</h2>
            <p className="muted">{t('הטופס המלא נשמר ונשלח לעוגן סיעוד.')}</p>
            <button className="btn-primary full" onClick={() => download(signedBytes, `${title}.pdf`)}>
              {t('הורד עותק PDF')}
            </button>
            {onBack && (
              <button className="btn-ghost full" style={{ marginTop: 8 }} onClick={onBack}>
                {t('חזרה לרשימה')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {header}
      <div className="gov-form-wrap">
        <form
          className="gov-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h1 className="gov-form-title">{title}</h1>
          {meta.note && <p className="gov-form-note">{meta.note}</p>}
          <p className="gov-form-hint">{t('שדות המסומנים בכוכבית (*) הם שדות חובה')}</p>

          <div className="gov-grid">
            {schema.map((f) => {
              if (f.type === 'section') {
                return (
                  <div key={f.id} className="gov-section">
                    <h3>{f.label}</h3>
                  </div>
                );
              }
              const bad = invalid.has(f.id);
              return (
                <div key={f.id} className={`gov-field${bad ? ' invalid' : ''}${f.type === 'textarea' ? ' wide' : ''}`}>
                  {f.type === 'checkbox' ? (
                    <label className="gov-check">
                      <input
                        type="checkbox"
                        checked={!!values[f.id]}
                        onChange={(e) => set(f.id, e.target.checked)}
                      />
                      <span>
                        {f.label}
                        {f.required && <b className="req-star"> *</b>}
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className="gov-label">
                        {f.label}
                        {f.required && <b className="req-star"> *</b>}
                      </label>
                      {f.type === 'textarea' ? (
                        <textarea
                          className="gov-input"
                          rows={3}
                          value={values[f.id]}
                          onChange={(e) => set(f.id, e.target.value)}
                        />
                      ) : f.type === 'select' ? (
                        <select
                          className="gov-input"
                          value={values[f.id]}
                          onChange={(e) => set(f.id, e.target.value)}
                        >
                          <option value="">{t('בחר/י…')}</option>
                          {(f.options || []).map((o, k) => (
                            <option key={k} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="gov-input"
                          type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
                          inputMode={f.type === 'idNumber' || f.type === 'phone' ? 'numeric' : undefined}
                          dir={f.type === 'idNumber' || f.type === 'phone' || f.type === 'email' || f.type === 'date' ? 'ltr' : 'rtl'}
                          value={values[f.id]}
                          onChange={(e) => set(f.id, e.target.value)}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="gov-actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? t('שולח…') : t('שליחה ›')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
