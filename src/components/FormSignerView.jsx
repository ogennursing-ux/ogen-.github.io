import { useEffect, useState } from 'react';
import SignFlow from './SignFlow.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64 } from '../lib/notify.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';

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
export default function FormSignerView({ id }) {
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

  async function handleSubmit(filled) {
    setBusy(true);
    try {
      const bytes = await buildSignedPdf(originalBytes.slice(0), filled, { names: ['החותם'] });
      await api.submitForm(template, { fields: filled, signedPdfBytes: bytes });
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
        <span className="brand-mark">✒️</span>
        <span className="brand-name">חתימה דיגיטלית</span>
      </div>
    </header>
  );
  const centered = (content) => (
    <div className="app">{header}<div className="centered-screen">{content}</div></div>
  );

  if (status === 'loading') return centered(<p className="muted">טוען מסמך…</p>);
  if (status === 'error')
    return centered(
      <div className="card"><h2>לא ניתן לפתוח את המסמך</h2><p className="muted">{error}</p></div>,
    );
  if (status === 'done')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>תודה! החתימה נשלחה</h2>
        <p className="muted">העותק החתום נשמר ונשלח לשולח.</p>
        <button className="btn-primary full" onClick={() => download(signedBytes, `${title}-signed.pdf`)}>
          הורד עותק חתום
        </button>
        <button className="btn-ghost full" style={{ marginTop: 8 }} onClick={load}>
          חתום על עותק נוסף
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
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
