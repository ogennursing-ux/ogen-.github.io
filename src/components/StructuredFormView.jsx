import { useMemo, useState } from 'react';
import LangToggle from './LangToggle.jsx';
import SignaturePad from './SignaturePad.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64, getIp } from '../lib/notify.js';
import { buildFormPdf } from '../lib/formPdf.js';
import { emptyValue, isSchemaValueEmpty, formMeta } from '../lib/formSchema.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';
import { useT } from '../lib/i18n.js';

const SAVED_SIG_KEY = 'worker_saved_signature';
const getSavedSignature = () => {
  try {
    return localStorage.getItem(SAVED_SIG_KEY) || null;
  } catch {
    return null;
  }
};
const rememberSignature = (dataUrl) => {
  try {
    if (dataUrl) localStorage.setItem(SAVED_SIG_KEY, dataUrl);
  } catch {
    /* ignore */
  }
};

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
  const [doneTitle, setDoneTitle] = useState(title);
  const [invalid, setInvalid] = useState(() => new Set());
  const [signingId, setSigningId] = useState(null); // field id whose pad is open
  const [savedSig, setSavedSig] = useState(getSavedSignature);

  const set = (id, val) => setValues((v) => ({ ...v, [id]: val }));

  function saveSignature(id, dataUrl) {
    set(id, dataUrl);
    if (dataUrl) {
      rememberSignature(dataUrl);
      setSavedSig(dataUrl);
    }
    setSigningId(null);
  }

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
      // Use the form's faithful PDF renderer when it has one; otherwise the
      // generic structured-form layout.
      const bytes = template.renderPdf
        ? await template.renderPdf(title, schema, values)
        : await buildFormPdf(title, schema, values);
      // Descriptive submission title (e.g. "patient name — visit type") so the
      // owner can identify each submission at a glance.
      const submissionTitle = template.titleFor ? template.titleFor(values) : title;
      setDoneTitle(submissionTitle);
      await api.submitForm(template, {
        fields: { schema, values, formKey: template.formKey || null },
        signedPdfBytes: bytes,
        title: submissionTitle,
      });
      setSignedBytes(bytes);
      setStatus('done');
      if (template.webhook_url && template.owner_email) {
        const ip = await getIp();
        notify(template.webhook_url, {
          type: 'completed',
          to: template.owner_email,
          title: submissionTitle,
          link: location.href,
          fileName: `${submissionTitle}.pdf`,
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
            <p className="muted">{t('הטופס המלא נשמר ונשלח ל{company}.', { company: COMPANY_NAME })}</p>
            <button className="btn-primary full" onClick={() => download(signedBytes, `${doneTitle}.pdf`)}>
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
              if (f.type === 'signature') {
                return (
                  <div key={f.id} className={`gov-field wide${bad ? ' invalid' : ''}`}>
                    <label className="gov-label">
                      {f.label}
                      {f.required && <b className="req-star"> *</b>}
                    </label>
                    <div className="sig-field">
                      {values[f.id] ? (
                        <div className="sig-preview">
                          <img src={values[f.id]} alt={t('חתימה')} />
                          <button type="button" className="btn-ghost sm" onClick={() => setSigningId(f.id)}>
                            {t('חתום מחדש')}
                          </button>
                          <button type="button" className="btn-ghost sm danger-text" onClick={() => set(f.id, '')}>
                            {t('נקה')}
                          </button>
                        </div>
                      ) : (
                        <div className="sig-empty">
                          <button type="button" className="btn-primary sm" onClick={() => setSigningId(f.id)}>
                            ✒️ {t('הוסף חתימה')}
                          </button>
                          {savedSig && (
                            <button
                              type="button"
                              className="btn-ghost sm"
                              onClick={() => set(f.id, savedSig)}
                              title={t('השתמש בחתימה השמורה')}
                            >
                              <img src={savedSig} alt="" className="sig-saved-thumb" />
                              {t('השתמש בחתימה השמורה')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              if (f.type === 'checklist') {
                const selected = Array.isArray(values[f.id]) ? values[f.id] : [];
                const toggle = (opt) =>
                  set(f.id, selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
                return (
                  <div key={f.id} className={`gov-field wide${bad ? ' invalid' : ''}`}>
                    <label className="gov-label">
                      {f.label}
                      {f.required && <b className="req-star"> *</b>}
                    </label>
                    <div className="gov-checklist">
                      {(f.options || []).map((opt, k) => (
                        <label key={k} className="gov-check-item">
                          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }
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

      {signingId && (
        <SignaturePad
          onSave={(dataUrl) => saveSignature(signingId, dataUrl)}
          onClose={() => setSigningId(null)}
        />
      )}
    </div>
  );
}
