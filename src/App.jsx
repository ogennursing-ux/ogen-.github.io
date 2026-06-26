import { useEffect, useMemo, useState } from 'react';
import Dropzone from './components/Dropzone.jsx';
import Toolbar from './components/Toolbar.jsx';
import SignerBar from './components/SignerBar.jsx';
import PdfPage from './components/PdfPage.jsx';
import EditPanel from './components/EditPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import LinkCreated from './components/LinkCreated.jsx';
import SignerView from './components/SignerView.jsx';
import { renderPdfPages } from './lib/pdfUtils.js';
import { FIELD_DEFAULTS, DEFAULT_SIGNERS, clamp, uid, todayISO } from './lib/fields.js';
import { api, rememberRequest, signingLink } from './lib/api.js';

export default function App() {
  const reqId = new URLSearchParams(location.search).get('req');
  if (reqId) return <SignerView id={reqId} />;
  return <PrepareApp />;
}

const newSigners = () => [{ ...DEFAULT_SIGNERS[0], email: '' }];

function PrepareApp() {
  const [screen, setScreen] = useState('home'); // home | editor | created
  const [pages, setPages] = useState([]);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [baseName, setBaseName] = useState('document');
  const [fields, setFields] = useState([]);
  const [signers, setSigners] = useState(newSigners);
  const [activeSigner, setActiveSigner] = useState(0);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { link, signersCount }

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId],
  );

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteField(selectedId);
      } else if (e.key === 'Escape') {
        if (activeTool) setActiveTool(null);
        else setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, activeTool]);

  async function handleFile(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      alert('יש לבחור קובץ PDF.');
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const rendered = await renderPdfPages(new Uint8Array(buf.slice(0)));
      setPdfBytes(buf);
      setPages(rendered);
      setBaseName(file.name.replace(/\.pdf$/i, '') || 'document');
      setFields([]);
      setSigners(newSigners());
      setActiveSigner(0);
      setSelectedId(null);
      setActiveTool(null);
      setScreen('editor');
    } catch (err) {
      console.error(err);
      alert('לא ניתן לפתוח את הקובץ: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  function placeField(pageIndex, type, xPct, yPct) {
    const def = FIELD_DEFAULTS[type];
    const field = {
      id: uid(),
      type,
      pageIndex,
      signer: activeSigner,
      wPct: def.w,
      hPct: def.h,
      xPct: clamp(xPct - def.w / 2, 0, 1 - def.w),
      yPct: clamp(yPct - def.h / 2, 0, 1 - def.h),
      value: type === 'checkbox' ? false : type === 'date' ? todayISO() : '',
    };
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    setActiveTool(null);
  }

  const updateField = (id, patch) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  function deleteField(id) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateField(id) {
    const src = fields.find((f) => f.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: uid(),
      xPct: clamp(src.xPct + 0.02, 0, 1 - src.wPct),
      yPct: clamp(src.yPct + 0.02, 0, 1 - src.hPct),
    };
    setFields((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  }

  // ---- signer management ----
  const updateSigner = (i, patch) =>
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  function addSigner() {
    setSigners((prev) => (prev.length >= 2 ? prev : [...prev, { ...DEFAULT_SIGNERS[1], email: '' }]));
  }

  function removeSigner(i) {
    setSigners((prev) => prev.filter((_, idx) => idx !== i));
    // fields assigned to the removed signer fall back to signer 0
    setFields((prev) => prev.map((f) => (f.signer >= i ? { ...f, signer: Math.max(0, f.signer - (f.signer >= i ? 1 : 0)) } : f)));
    setActiveSigner(0);
  }

  function startOver() {
    if (fields.length && !confirm('להתחיל מסמך חדש? השדות הנוכחיים יימחקו.')) return;
    setPages([]);
    setPdfBytes(null);
    setFields([]);
    setSigners(newSigners());
    setActiveSigner(0);
    setSelectedId(null);
    setActiveTool(null);
    setScreen('home');
  }

  async function createLink() {
    if (!fields.length) {
      alert('הוסף לפחות שדה אחד למסמך לפני יצירת הקישור.');
      return;
    }
    setBusy(true);
    try {
      const list = signers.map((s) => ({
        name: s.name,
        email: s.email || null,
        color: s.color,
        signed: false,
        signedAt: null,
      }));
      const { id } = await api.createRequest({
        title: baseName,
        pdfBytes,
        fields,
        signers: { current: 0, list },
        signerEmail: signers[0].email || null,
      });
      rememberRequest({ id, title: baseName, createdAt: Date.now() });
      setCreated({ link: signingLink(id), signersCount: signers.length, signerEmail: signers[0].email || '' });
      setScreen('created');
    } catch (err) {
      console.error(err);
      alert('יצירת הקישור נכשלה: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSigned(id) {
    try {
      const req = await api.getRequest(id);
      const bytes = await api.getSignedBytes(req);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${req.title || 'document'}-signed.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('הורדה נכשלה: ' + err.message);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">✒️</span>
        <span className="brand-name">חתימה דיגיטלית</span>
      </div>
      {screen === 'editor' && <span className="doc-name">{baseName}.pdf</span>}
    </header>
  );

  if (screen === 'created') {
    return (
      <div className="app">
        {header}
        <LinkCreated
          link={created.link}
          signerEmail={created.signerEmail}
          signersCount={created.signersCount}
          onNewDocument={startOver}
          onDashboard={startOver}
        />
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <div className="app">
        {header}
        <Dropzone onFile={handleFile} busy={busy} />
        <Dashboard onDownloadSigned={downloadSigned} />
      </div>
    );
  }

  // screen === 'editor'
  return (
    <div className="app">
      {header}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onContinue={createLink}
        onReset={startOver}
        busy={busy}
        canContinue={fields.length > 0}
        continueLabel="צור קישור לחתימה ›"
      />
      <SignerBar
        signers={signers}
        activeSigner={activeSigner}
        onSelect={setActiveSigner}
        onUpdate={updateSigner}
        onAdd={addSigner}
        onRemove={removeSigner}
      />
      {activeTool ? (
        <div className="place-hint">לחץ על המסמך כדי למקם {labelOf(activeTool)}</div>
      ) : (
        fields.length === 0 && (
          <div className="place-hint subtle">
            בחר סוג שדה מהסרגל למעלה ולחץ על המסמך כדי להוסיף שדה שהחותם ימלא
          </div>
        )
      )}

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
            phase="setup"
            currentSigner={0}
            activeTool={activeTool}
            selectedId={selectedId}
            onPlace={placeField}
            onSelect={setSelectedId}
            onChange={updateField}
            onDelete={deleteField}
          />
        ))}
      </main>

      <EditPanel
        field={selectedField}
        signers={signers}
        phase="setup"
        onChange={updateField}
        onDelete={deleteField}
        onDuplicate={duplicateField}
        onClose={() => setSelectedId(null)}
        onOpenSign={() => {}}
      />
    </div>
  );
}

function labelOf(tool) {
  return { signature: 'חתימה', text: 'טקסט', date: 'תאריך', checkbox: 'תיבת סימון' }[tool];
}
