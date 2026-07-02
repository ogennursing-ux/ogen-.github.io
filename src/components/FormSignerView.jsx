import { useEffect, useState } from 'react';
import SignFlow from './SignFlow.jsx';
import LangToggle from './LangToggle.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64, getIp } from '../lib/notify.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';
import { normalizeSigners } from '../lib/fields.js';
import { useT } from '../lib/i18n.js';

const SIGNERS = [{ name: 'החותם', color: '#1f7a53' }];

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

// Permanent (reusable) link: every visitor signs a fresh copy of the template.
export default function FormSignerView({ id, brandIcon = '✒️', brandLabel, onBack }) {
  const t = useT();
  const [status, setStatus] = useState('loading'); // loading|ready|done|error
  const [error, setError] = useState('');
  const [template, setTemplate] = useState(null);
  const [pages, setPages] = useState([]);
  const [originalBytes, setOriginalBytes] = useState(null);
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const [signedBytes, setSignedBytes] = useState(null);

  const title = template?.title || 'document';

  async function load() {
    setStatus('loading');
    try {
      const t = await api.getTemplate(id);
      setTemplate(t);
      const bytes = await api.getOriginalBytes(t);
      setOriginalBytes(bytes);
      const rendered = await renderPdfPages(new Uint8Array(bytes.slice(0)));
      setPages(rendered);
      setFields((t.fields || []).map((f) => ({ ...f, signer: 0 })));
      setStatus('ready');
    } catch (e) {
      console.error(e);
      setError(e.message || 'שגיאה בטעינת המסמך');
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(filled, signerName) {
    setBusy(true);
    try {
      const ip = await getIp();
      const bytes = await buildSignedPdf(originalBytes.slice(0), filled, {
        names: [signerName || 'החותם'],
        ip,
      });
      // Record the signer's name so it shows in the signatures list.
      const base = normalizeSigners(template?.signers);
      const list = (base.list && base.list.length ? base.list : SIGNERS).map((s, i) =>
        i === 0 ? { ...s, signed: true, signedAt: new Date().toISOString(), ip, signedName: signerName || '' } : s,
      );
      await api.submitForm(template, { fields: filled, signedPdfBytes: bytes, signers: { ...base, list } });
      setSignedBytes(bytes);
      setStatus('done');
      if (template.webhook_url && template.owner_email) {
        notify(template.webhook_url, {
          type: 'completed',
          to: template.owner_email,
          title,
          link: location.href,
          fileName: `${title}-signed.pdf`,
          fileBase64: bytesToBase64(bytes),
        });
      }
    } catch (e) {
      console.error(e);
      alert('שליחת החתימה נכשלה: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">{brandIcon}</span>
        <span className="brand-name">{t(brandLabel || 'חתימה דיגיטלית')}</span>
      </div>
      <div className="header-actions">
        <LangToggle />
        {onBack && <button className="header-settings" onClick={onBack}>{t('חזרה לרשימה')}</button>}
      </div>
    </header>
  );
  const centered = (content) => (
    <div className="app">{header}<div className="centered-screen">{content}</div></div>
  );

  if (status === 'loading') return centered(<p className="muted">{t('טוען מסמך…')}</p>);
  if (status === 'error')
    return centered(
      <div className="card"><h2>{t('לא ניתן לפתוח את המסמך')}</h2><p className="muted">{error}</p></div>,
    );
  if (status === 'done')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>{t('תודה! החתימה נשלחה')}</h2>
        <p className="muted">{t('העותק החתום נשמר ונשלח לשולח.')}</p>
        <button className="btn-primary full" onClick={() => download(signedBytes, `${title}-signed.pdf`)}>
          {t('הורד עותק חתום')}
        </button>
        <button className="btn-ghost full" style={{ marginTop: 8 }} onClick={load}>
          {t('חתום על עותק נוסף')}
        </button>
      </div>,
    );

  return (
    <div className="app">
      {header}
      <SignFlow
        pages={pages}
        fields={fields}
        signers={SIGNERS}
        currentSigner={0}
        title={title}
        note={normalizeSigners(template?.signers).note}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
