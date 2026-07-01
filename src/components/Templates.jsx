import { useState } from 'react';
import {
  api,
  listMyTemplates,
  forgetTemplate,
  formLink,
  signingLink,
  rememberRequest,
  rememberTemplate,
} from '../lib/api.js';
import { getSettings } from '../lib/notify.js';
import { normalizeSigners } from '../lib/fields.js';
import { useT } from '../lib/i18n.js';

const DEFAULT_LIST = [{ name: 'החותם', email: null, color: '#1f7a53' }];

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

export default function Templates() {
  const t = useT();
  const [items, setItems] = useState(listMyTemplates());
  const [subs, setSubs] = useState({});
  const [busy, setBusy] = useState(false);

  if (!items.length) return null;

  async function createOneOff(tmplRef) {
    setBusy(true);
    try {
      const tmpl = await api.getTemplate(tmplRef.id);
      const bytes = await api.getOriginalBytes(tmpl);
      const norm = normalizeSigners(tmpl.signers);
      const base = norm.list.length ? norm.list : DEFAULT_LIST;
      const list = base.map((s) => ({ ...s, signed: false, signedAt: null }));
      const settings = getSettings();
      const { id } = await api.createRequest({
        title: tmpl.title,
        pdfBytes: bytes,
        fields: tmpl.fields,
        signers: { current: 0, list, note: norm.note },
        signerEmail: list[0].email || null,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberRequest({ id, title: tmpl.title, createdAt: Date.now() });
      copy(signingLink(id));
      alert(t('נוצר קישור חד-פעמי חדש והועתק. שלח אותו לחותם.'));
    } catch (e) {
      alert('error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubs(id) {
    if (subs[id]) {
      setSubs((s) => ({ ...s, [id]: undefined }));
      return;
    }
    setSubs((s) => ({ ...s, [id]: 'loading' }));
    try {
      const list = await api.listSubmissions(id);
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

  async function duplicate(tmplRef) {
    setBusy(true);
    try {
      const tmpl = await api.getTemplate(tmplRef.id);
      const bytes = await api.getOriginalBytes(tmpl);
      const norm = normalizeSigners(tmpl.signers);
      const title = (tmpl.title || t('תבנית')) + ' (' + t('שכפל') + ')';
      const settings = getSettings();
      const { id } = await api.createTemplate({
        title,
        pdfBytes: bytes,
        fields: tmpl.fields,
        signers: norm.list,
        note: norm.note,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberTemplate({ id, title, createdAt: Date.now() });
      setItems(listMyTemplates());
    } catch (e) {
      alert('error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function remove(id) {
    if (!confirm(t('למחוק את התבנית? קישורים קבועים שלה יפסיקו לעבוד.'))) return;
    api.deleteTemplate(id).catch(() => {});
    forgetTemplate(id);
    setItems(listMyTemplates());
  }

  return (
    <div className="dashboard">
      <h3>{t('התבניות שלי')}</h3>
      <ul className="req-list">
        {items.map((tmplRef) => {
          const list = subs[tmplRef.id];
          return (
            <li key={tmplRef.id} className="tmpl-item">
              <div className="tmpl-row">
                <div className="req-main">
                  <span className="req-title">{tmplRef.title || t('תבנית')}</span>
                  <span className="req-date">{new Date(tmplRef.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="req-side wrap">
                  <button className="btn-primary sm" disabled={busy} onClick={() => copy(formLink(tmplRef.id))}>
                    {t('העתק לינק קבוע')}
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => createOneOff(tmplRef)}>
                    {t('קישור חד-פעמי')}
                  </button>
                  <button className="btn-ghost sm" onClick={() => toggleSubs(tmplRef.id)}>
                    {t('חתימות')}{Array.isArray(list) ? ` (${list.length})` : ''}
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => duplicate(tmplRef)}>
                    {t('שכפל')}
                  </button>
                  <button className="btn-ghost sm danger-text" onClick={() => remove(tmplRef.id)}>
                    {t('מחק')}
                  </button>
                </div>
              </div>
              {list === 'loading' && <p className="muted small sub-note">{t('טוען…')}</p>}
              {Array.isArray(list) &&
                (list.length ? (
                  <ul className="sub-list">
                    {list.map((sub) => (
                      <li key={sub.id} className="sub-row">
                        <span>{new Date(sub.signed_at || sub.created_at).toLocaleString()}</span>
                        <button className="btn-ghost sm" onClick={() => downloadSubmission(sub)}>{t('הורד')}</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small sub-note">{t('עדיין אין חתימות.')}</p>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
