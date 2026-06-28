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

const copy = (text) =>
  navigator.clipboard?.writeText(text).catch(() => window.prompt('העתק:', text));

// Owner's saved templates: permanent links, one-off links, and submissions.
export default function Templates() {
  const [items, setItems] = useState(listMyTemplates());
  const [subs, setSubs] = useState({}); // id -> array | 'loading'
  const [busy, setBusy] = useState(false);

  if (!items.length) return null;

  async function createOneOff(t) {
    setBusy(true);
    try {
      const tmpl = await api.getTemplate(t.id);
      const bytes = await api.getOriginalBytes(tmpl);
      const list = (tmpl.signers && tmpl.signers.length ? tmpl.signers : DEFAULT_LIST).map((s) => ({
        ...s,
        signed: false,
        signedAt: null,
      }));
      const settings = getSettings();
      const { id } = await api.createRequest({
        title: tmpl.title,
        pdfBytes: bytes,
        fields: tmpl.fields,
        signers: { current: 0, list },
        signerEmail: list[0].email || null,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberRequest({ id, title: tmpl.title, createdAt: Date.now() });
      copy(signingLink(id));
      alert('נוצר קישור חד-פעמי חדש והועתק. שלח אותו לחותם.');
    } catch (e) {
      alert('שגיאה: ' + e.message);
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
      alert('שגיאה בטעינת החתימות: ' + e.message);
    }
  }

  async function downloadSubmission(sub) {
    try {
      download(await api.getSignedBytes(sub), `${sub.title || 'document'}-signed.pdf`);
    } catch (e) {
      alert('הורדה נכשלה: ' + e.message);
    }
  }

  async function duplicate(t) {
    setBusy(true);
    try {
      const tmpl = await api.getTemplate(t.id);
      const bytes = await api.getOriginalBytes(tmpl);
      const title = (tmpl.title || 'תבנית') + ' (עותק)';
      const settings = getSettings();
      const { id } = await api.createTemplate({
        title,
        pdfBytes: bytes,
        fields: tmpl.fields,
        signers: tmpl.signers,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberTemplate({ id, title, createdAt: Date.now() });
      setItems(listMyTemplates());
    } catch (e) {
      alert('שגיאה בשכפול: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function remove(id) {
    if (!confirm('למחוק את התבנית? קישורים קבועים שלה יפסיקו לעבוד.')) return;
    api.deleteTemplate(id).catch(() => {});
    forgetTemplate(id);
    setItems(listMyTemplates());
  }

  return (
    <div className="dashboard">
      <h3>התבניות שלי</h3>
      <ul className="req-list">
        {items.map((t) => {
          const list = subs[t.id];
          return (
            <li key={t.id} className="tmpl-item">
              <div className="tmpl-row">
                <div className="req-main">
                  <span className="req-title">{t.title || 'תבנית'}</span>
                  <span className="req-date">{new Date(t.createdAt).toLocaleDateString('he-IL')}</span>
                </div>
                <div className="req-side wrap">
                  <button className="btn-primary sm" disabled={busy} onClick={() => copy(formLink(t.id))}>
                    העתק לינק קבוע
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => createOneOff(t)}>
                    קישור חד-פעמי
                  </button>
                  <button className="btn-ghost sm" onClick={() => toggleSubs(t.id)}>
                    חתימות{Array.isArray(list) ? ` (${list.length})` : ''}
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => duplicate(t)}>
                    שכפל
                  </button>
                  <button className="btn-ghost sm danger-text" onClick={() => remove(t.id)}>
                    מחק
                  </button>
                </div>
              </div>
              {list === 'loading' && <p className="muted small sub-note">טוען…</p>}
              {Array.isArray(list) && (
                list.length ? (
                  <ul className="sub-list">
                    {list.map((sub) => (
                      <li key={sub.id} className="sub-row">
                        <span>{new Date(sub.signed_at || sub.created_at).toLocaleString('he-IL')}</span>
                        <button className="btn-ghost sm" onClick={() => downloadSubmission(sub)}>
                          הורד
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small sub-note">עדיין אין חתימות.</p>
                )
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
