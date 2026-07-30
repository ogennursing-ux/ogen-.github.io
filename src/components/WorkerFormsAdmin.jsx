import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { WORKER_ACCESS_CODE, workerPortalLink } from '../lib/workerPortal.js';
import { builtinWorkerTemplates, isBuiltinId } from '../lib/prebuiltForms.js';
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
const copy = (text) => navigator.clipboard?.writeText(text).catch(() => window.prompt('copy', text));

export default function WorkerFormsAdmin({ onEditSubmission }) {
  const t = useT();
  const [items, setItems] = useState(null); // null = loading
  const [subs, setSubs] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const builtins = builtinWorkerTemplates();
    try {
      setItems([...builtins, ...(await api.listWorkerTemplates())]);
    } catch (e) {
      console.error(e);
      setItems(builtins);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleSubs(item) {
    const id = item.id;
    if (subs[id]) {
      setSubs((s) => ({ ...s, [id]: undefined }));
      return;
    }
    setSubs((s) => ({ ...s, [id]: 'loading' }));
    try {
      // Built-in forms don't carry a template_id, so match their submissions by
      // the formKey stored in the submission (older rows fall back to the form
      // title); published forms link directly by template_id.
      const list = isBuiltinId(id)
        ? (await api.listAllSigned()).filter((r) => r.fields?.formKey === item.formKey || r.title === item.title)
        : await api.listSubmissions(id);
      setSubs((s) => ({ ...s, [id]: list }));
    } catch (e) {
      setSubs((s) => ({ ...s, [id]: [] }));
      alert('error: ' + e.message);
    }
  }

  async function downloadSubmission(sub) {
    try {
      download(await api.getSignedBytes(sub), `${sub.title || 'document'}-signed.pdf`);
    } catch (e) {
      alert('error: ' + e.message);
    }
  }

  function remove(id) {
    if (!confirm(t('למחוק את הטופס? הוא ייעלם מהפורטל.'))) return;
    api.deleteTemplate(id).catch(() => {});
    setItems((cur) => (cur || []).filter((i) => i.id !== id));
  }

  const link = workerPortalLink();

  return (
    <div className="dashboard">
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('פורטל הטפסים לעובדים סוציאליים')}</h3>
        <p className="muted">{t('שלח/י את הקישור ואת קוד הגישה לעובד/ת הסוציאלי/ת — הוא/היא ייכנס/תיכנס לפורטל, יבחר/תבחר טופס מהרשימה, ימלא/תמלא וישלח/תשלח ישירות אלייך.')}</p>
        <div className="link-row">
          <input className="link-input" value={link} readOnly aria-label="קישור לטופס" onFocus={(e) => e.target.select()} />
          <button className="btn-primary" onClick={() => copy(link)}>{t('העתק')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {t('קוד גישה')}: <strong dir="ltr">{WORKER_ACCESS_CODE}</strong>
        </p>
      </div>

      <h3>{t('הטפסים שפורסמו')}</h3>
      {items === null && <p className="muted">{t('טוען…')}</p>}
      {items && !items.length && <p className="muted">{t('עדיין לא פורסמו טפסים. העלה מסמך למעלה ופרסם אותו כטופס.')}</p>}
      {items && items.length > 0 && (
        <ul className="req-list">
          {items.map((item) => {
            const active = item.signers?.active !== false;
            const list = subs[item.id];
            const builtin = isBuiltinId(item.id);
            return (
              <li key={item.id} className="tmpl-item">
                <div className="tmpl-row">
                  <div className="req-main">
                    <span className="req-title">{item.title || t('טופס')}</span>
                    <span className="req-date">{builtin ? t('טופס מובנה') : active ? t('פעיל') : t('מושבת')}</span>
                  </div>
                  <div className="req-side wrap">
                    {!builtin && (
                      <button
                        className="btn-ghost sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api.setTemplateActive(item.id, !active);
                            await load();
                          } catch (e) {
                            alert('error: ' + e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {active ? t('השבת') : t('הפעל')}
                      </button>
                    )}
                    <button className="btn-ghost sm" onClick={() => toggleSubs(item)}>
                      {t('הגשות')}{Array.isArray(list) ? ` (${list.length})` : ''}
                    </button>
                    {!builtin && (
                      <button className="btn-ghost sm danger-text" onClick={() => remove(item.id)}>
                        {t('מחק')}
                      </button>
                    )}
                  </div>
                </div>
                {list === 'loading' && <p className="muted small sub-note">{t('טוען…')}</p>}
                {Array.isArray(list) &&
                  (list.length ? (
                    <ul className="sub-list">
                      {list.map((sub) => (
                        <li key={sub.id} className="sub-row">
                          <span>
                            <strong>{sub.title || t('טופס')}</strong>
                            <span className="muted"> · {new Date(sub.signed_at || sub.created_at).toLocaleString()}</span>
                          </span>
                          <span className="sub-actions">
                            {onEditSubmission && sub.fields?.schema && (
                              <button className="btn-ghost sm" onClick={() => onEditSubmission(sub)}>{t('ערוך')}</button>
                            )}
                            <button className="btn-ghost sm" onClick={() => downloadSubmission(sub)}>{t('הורד')}</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small sub-note">{t('עדיין אין הגשות.')}</p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
