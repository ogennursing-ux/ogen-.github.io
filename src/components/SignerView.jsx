import { useEffect, useMemo, useState } from 'react';
import PdfPage from './PdfPage.jsx';
import EditPanel from './EditPanel.jsx';
import SignaturePad from './SignaturePad.jsx';
import { api } from '../lib/api.js';
import { renderPdfPages, buildSignedPdf } from '../lib/pdfUtils.js';

const DEFAULT_SIGNER = [{ name: 'החותם', color: '#1f7a53' }];

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

// The signer's experience: open a link, fill the fields, submit.
export default function SignerView({ id }) {
  const [status, setStatus] = useState('loading'); // loading|ready|already|done|error
  const [error, setError] = useState('');
  const [req, setReq] = useState(null);
  const [pages, setPages] = useState([]);
  const [originalBytes, setOriginalBytes] = useState(null);
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [signFor, setSignFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signedBytes, setSignedBytes] = useState(null);

  const signers = req?.signers?.length ? req.signers : DEFAULT_SIGNER;
  const title = req?.title || 'document';

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId],
  );

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
        setFields((r.fields || []).map((f) => ({ ...f, signer: 0 })));
        setStatus('ready');
      } catch (e) {
        console.error(e);
        setError(e.message || 'שגיאה בטעינת המסמך');
        setStatus('error');
      }
    })();
  }, [id]);

  function updateField(fid, patch) {
    setFields((prev) => prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)));
  }

  async function submit() {
    const emptySig = fields.filter((f) => f.type === 'signature' && !f.value).length;
    if (emptySig && !confirm(`נשארו ${emptySig} שדות חתימה ריקים. לשלוח בכל זאת?`)) return;
    setBusy(true);
    try {
      const bytes = await buildSignedPdf(originalBytes.slice(0), fields);
      await api.submitSigned(id, { fields, signedPdfBytes: bytes });
      setSignedBytes(bytes);
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
      const bytes = await api.getSignedBytes(req);
      download(bytes, `${title}-signed.pdf`);
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

  if (status === 'loading') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen"><p className="muted">טוען מסמך…</p></div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen">
          <div className="card">
            <h2>לא ניתן לפתוח את המסמך</h2>
            <p className="muted">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'already') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen">
          <div className="card">
            <div className="big-check" aria-hidden>✓</div>
            <h2>המסמך כבר נחתם</h2>
            <p className="muted">אפשר להוריד עותק חתום.</p>
            <button className="btn-primary full" disabled={busy} onClick={downloadSignedExisting}>
              {busy ? 'מוריד…' : 'הורד מסמך חתום'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen">
          <div className="card">
            <div className="big-check" aria-hidden>✓</div>
            <h2>תודה! החתימה נשלחה</h2>
            <p className="muted">המסמך החתום נשמר ונשלח לשולח הבקשה.</p>
            <button
              className="btn-primary full"
              onClick={() => download(signedBytes, `${title}-signed.pdf`)}
            >
              הורד עותק חתום
            </button>
          </div>
        </div>
      </div>
    );
  }

  // status === 'ready'
  return (
    <div className="app">
      {header}
      <div className="signflow-bar">
        <div className="signflow-info">
          <span className="signer-dot lg" style={{ background: signers[0].color }} />
          <div className="signflow-text">
            <strong>אנא מלא וחתום על השדות המסומנים</strong>
            <span className="signflow-step">{title}</span>
          </div>
        </div>
        <div className="signflow-actions">
          <button className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'שולח…' : 'סיים ושלח חתימה'}
          </button>
        </div>
      </div>

      <main
        className="pages"
        onPointerDown={(e) => {
          if (e.target.classList.contains('pages')) setSelectedId(null);
        }}
      >
        {pages.map((page, i) => (
          <PdfPage
            key={i}
            page={page}
            index={i}
            fields={fields}
            signers={signers}
            phase="sign"
            currentSigner={0}
            activeTool={null}
            selectedId={selectedId}
            noEdit
            onPlace={() => {}}
            onSelect={setSelectedId}
            onChange={updateField}
            onDelete={() => {}}
          />
        ))}
      </main>

      <EditPanel
        field={selectedField}
        signers={signers}
        phase="sign"
        onChange={updateField}
        onDelete={() => {}}
        onDuplicate={() => {}}
        onClose={() => setSelectedId(null)}
        onOpenSign={setSignFor}
      />

      {signFor && (
        <SignaturePad
          onClose={() => setSignFor(null)}
          onSave={(dataUrl) => {
            if (dataUrl) updateField(signFor, { value: dataUrl });
            setSignFor(null);
          }}
        />
      )}
    </div>
  );
}
