import { useEffect, useState } from 'react';
import SignSurface from './SignSurface.jsx';
import { api } from '../lib/api.js';
import { notify, bytesToBase64 } from '../lib/notify.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';
import { isFieldEmpty } from '../lib/fields.js';

const FALLBACK = { current: 0, list: [{ name: 'החותם', color: '#1f7a53' }] };

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
  if (Array.isArray(s)) return { current: 0, list: s.length ? s : FALLBACK.list };
  if (!s.list || !s.list.length) return FALLBACK;
  return { current: s.current || 0, list: s.list };
}

export default function SignerView({ id }) {
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

  const updateField = (fid, patch) =>
    setFields((prev) => prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)));

  async function submit() {
    const missing = fields.filter((f) => f.signer === current && f.required && isFieldEmpty(f)).length;
    if (missing) {
      alert(`יש למלא ${missing} שדות חובה לפני השליחה.`);
      return;
    }
    const emptySig = fields.filter(
      (f) => f.signer === current && f.type === 'signature' && !f.value,
    ).length;
    if (emptySig && !confirm(`נשארו ${emptySig} שדות חתימה ריקים. לשלוח בכל זאת?`)) return;

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const newList = signers.list.map((s, i) =>
        i === current ? { ...s, signed: true, signedAt: now } : s,
      );
      const isLast = current >= signers.list.length - 1;

      if (isLast) {
        const bytes = await buildSignedPdf(originalBytes.slice(0), fields, {
          names: newList.map((s) => s.name),
          refId: id,
        });
        await api.submitSigned(id, { fields, signers: { current, list: newList }, signedPdfBytes: bytes });
        setSignedBytes(bytes);
        setDoneKind('final');
        // email the signed document to the owner
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
        await api.advance(id, { fields, signers: { current: current + 1, list: newList } });
        setDoneKind('intermediate');
        // invite the next signer
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
  if (status === 'already')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        <h2>המסמך כבר נחתם</h2>
        <p className="muted">אפשר להוריד עותק חתום.</p>
        <button className="btn-primary full" disabled={busy} onClick={downloadSignedExisting}>
          {busy ? 'מוריד…' : 'הורד מסמך חתום'}
        </button>
      </div>,
    );
  if (status === 'done')
    return centered(
      <div className="card">
        <div className="big-check" aria-hidden>✓</div>
        {doneKind === 'final' ? (
          <>
            <h2>תודה! החתימה הושלמה</h2>
            <p className="muted">המסמך החתום נשמר ונשלח לשולח הבקשה.</p>
            <button className="btn-primary full" onClick={() => download(signedBytes, `${title}-signed.pdf`)}>
              הורד עותק חתום
            </button>
          </>
        ) : (
          <>
            <h2>תודה! החתימה נשמרה</h2>
            <p className="muted">המסמך הועבר לחתימת {signers.list[current + 1]?.name || 'החותם הבא'}.</p>
          </>
        )}
      </div>,
    );

  const signer = signers.list[current] || FALLBACK.list[0];
  const multi = signers.list.length > 1;
  return (
    <div className="app">
      {header}
      <div className="signflow-bar">
        <div className="signflow-info">
          <span className="signer-dot lg" style={{ background: signer.color }} />
          <div className="signflow-text">
            <strong>{multi ? `תור החתימה: ${signer.name}` : 'אנא מלא וחתום על השדות'}</strong>
            <span className="signflow-step">
              {title}{multi ? ` · חותם ${current + 1} מתוך ${signers.list.length}` : ''}
            </span>
          </div>
        </div>
        <div className="signflow-actions">
          <button className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'שולח…' : 'סיים ושלח חתימה'}
          </button>
        </div>
      </div>

      <SignSurface
        pages={pages}
        fields={fields}
        signers={signers.list}
        currentSigner={current}
        onChange={updateField}
      />
    </div>
  );
}
