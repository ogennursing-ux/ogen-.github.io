import { useEffect, useState } from 'react';
import SignFlow from './SignFlow.jsx';
import LangToggle from './LangToggle.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64, getIp } from '../lib/notify.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';
import { useT } from '../lib/i18n.js';

const FALLBACK = { current: 0, list: [{ name: 'החותם', color: '#1f7a53' }], note: '' };

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

function normalizeSigners(s) {
  if (!s) return FALLBACK;
  if (Array.isArray(s)) return { current: 0, list: s.length ? s : FALLBACK.list, note: '' };
  if (!s.list || !s.list.length) return { ...FALLBACK, note: s.note || '' };
  return { current: s.current || 0, list: s.list, note: s.note || '' };
}

export default function SignerView({ id }) {
  const t = useT();
  const [status, setStatus] = useState('loading'); // loading|ready|already|done|error
  const [doneKind, setDoneKind] = useState('final');
  const [error, setError] = useState('');
  const [req, setReq] = useState(null);
  const [pages, setPages] = useState([]);
  const [originalBytes, setOriginalBytes] = useState(null);
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const [signedBytes, setSignedBytes] = useState(null);

  const signers = normalizeSigners(req?.signers);
  const current = signers.current;
  const title = req?.title || 'document';

  useEffect(() => {
    (async () => {
      try {
        const r = await api.getRequest(id);
        setReq(r);
        if (r.status === 'signed') {
          setStatus('already');
          return;
        }
        const bytes = await api.getOriginalBytes(r);
        setOriginalBytes(bytes);
        const rendered = await renderPdfPages(new Uint8Array(bytes.slice(0)));
        setPages(rendered);
        setFields(r.fields || []);
        setStatus('ready');
      } catch (e) {
        console.error(e);
        setError(e.message || 'שגיאה בטעינת המסמך');
        setStatus('error');
      }
    })();
  }, [id]);

  async function handleSubmit(filled, signerName) {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const ip = await getIp();
      const newList = signers.list.map((s, i) =>
        i === current ? { ...s, signed: true, signedAt: now, ip, signedName: signerName || s.signedName || '' } : s,
      );
      const isLast = current >= signers.list.length - 1;

      if (isLast) {
        const bytes = await buildSignedPdf(originalBytes.slice(0), filled, {
          names: newList.map((s) => s.name),
          refId: id,
          ip,
        });
        await api.submitSigned(id, { fields: filled, signers: { current, list: newList }, signedPdfBytes: bytes });
        setSignedBytes(bytes);
        setDoneKind('final');
        if (req.webhook_url && req.owner_email) {
          notify(req.webhook_url, {
            type: 'completed',
            to: req.owner_email,
            title,
            link: location.href,
            fileName: `${title}-signed.pdf`,
            fileBase64: bytesToBase64(bytes),
          });
        }
      } else {
        await api.advance(id, { fields: filled, signers: { current: current + 1, list: newList } });
        setDoneKind('intermediate');
        const next = newList[current + 1];
        if (req.webhook_url && next?.email) {
          notify(req.webhook_url, { type: 'invite', to: next.email, title, link: location.href });
        }
      }
      setStatus('done');
    } catch (e) {
      console.error(e);
      alert('שליחת החתימה נכשלה: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSignedExisting() {
    setBusy(true);
    try {
      download(await api.getSignedBytes(req), `${title}-signed.pdf`);
    } catch (e) {
      alert('הורדה נכשלה: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">✒️</span>
        <span className="brand-name">{t('חתימה דיגיטלית')}</span>
      </div>
      <LangToggle />
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
  if (status === 'already')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>{t('המסמך כבר נחתם')}</h2>
        <p className="muted">{t('אפשר להוריד עותק חתום.')}</p>
        <button className="btn-primary full" disabled={busy} onClick={downloadSignedExisting}>
          {busy ? t('מוריד…') : t('הורד מסמך חתום')}
        </button>
      </div>,
    );
  if (status === 'done')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        {doneKind === 'final' ? (
          <>
            <h2>{t('תודה! החתימה הושלמה')}</h2>
            <p className="muted">{t('המסמך החתום נשמר ונשלח לשולח הבקשה.')}</p>
            <button className="btn-primary full" onClick={() => download(signedBytes, `${title}-signed.pdf`)}>
              {t('הורד עותק חתום')}
            </button>
          </>
        ) : (
          <>
            <h2>{t('תודה! החתימה נשמרה')}</h2>
            <p className="muted">{t('המסמך הועבר לחתימת {name}.', { name: signers.list[current + 1]?.name || '' })}</p>
          </>
        )}
      </div>,
    );

  return (
    <div className="app">
      {header}
      <SignFlow
        pages={pages}
        fields={fields}
        signers={signers.list}
        currentSigner={current}
        title={title}
        note={signers.note}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
