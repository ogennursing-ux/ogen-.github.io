import { useEffect, useMemo, useState } from 'react';
import Dropzone from './components/Dropzone.jsx';
import Toolbar from './components/Toolbar.jsx';
import SignerBar from './components/SignerBar.jsx';
import SignFlowBar from './components/SignFlowBar.jsx';
import PdfPage from './components/PdfPage.jsx';
import EditPanel from './components/EditPanel.jsx';
import SignaturePad from './components/SignaturePad.jsx';
import { renderPdfPages, buildSignedPdf } from './lib/pdfUtils.js';
import { FIELD_DEFAULTS, DEFAULT_SIGNERS, clamp, uid, todayISO } from './lib/fields.js';

export default function App() {
  const [pages, setPages] = useState([]);
  const [pdfBytes, setPdfBytes] = useState(null); // original ArrayBuffer (kept intact)
  const [baseName, setBaseName] = useState('document');
  const [fields, setFields] = useState([]);
  const [signers, setSigners] = useState(() => DEFAULT_SIGNERS.map((s) => ({ ...s })));

  const [phase, setPhase] = useState('setup'); // 'setup' | 'sign'
  const [activeSigner, setActiveSigner] = useState(0); // owner for newly placed fields
  const [currentSigner, setCurrentSigner] = useState(0); // whose turn it is while signing

  const [activeTool, setActiveTool] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [signFor, setSignFor] = useState(null); // field id whose signature pad is open
  const [busy, setBusy] = useState(false);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId],
  );

  // Keyboard shortcuts: Delete removes the selected field (setup only),
  // Escape cancels the active tool or clears the selection.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && phase === 'setup') {
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
  }, [selectedId, activeTool, phase]);

  async function handleFile(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      alert('יש לבחור קובץ PDF.');
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // pdf.js may detach its input, so render from a copy and keep `buf` for pdf-lib.
      const rendered = await renderPdfPages(new Uint8Array(buf.slice(0)));
      setPdfBytes(buf);
      setPages(rendered);
      setBaseName(file.name.replace(/\.pdf$/i, '') || 'document');
      setFields([]);
      setSelectedId(null);
      setActiveTool(null);
      setPhase('setup');
      setCurrentSigner(0);
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
      value: type === 'checkbox' ? true : type === 'date' ? todayISO() : '',
    };
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    setActiveTool(null);
    if (type === 'signature') setSignFor(field.id);
  }

  function updateField(id, patch) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function deleteField(id) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (signFor === id) setSignFor(null);
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

  function renameSigner(index, name) {
    setSigners((prev) => prev.map((s, i) => (i === index ? { ...s, name } : s)));
  }

  function reset() {
    if (fields.length && !confirm('להתחיל מסמך חדש? השדות הנוכחיים יימחקו.')) return;
    setPages([]);
    setPdfBytes(null);
    setFields([]);
    setSigners(DEFAULT_SIGNERS.map((s) => ({ ...s })));
    setSelectedId(null);
    setActiveTool(null);
    setSignFor(null);
    setPhase('setup');
    setActiveSigner(0);
    setCurrentSigner(0);
  }

  function startSigning() {
    if (!fields.length) {
      alert('הוסף לפחות שדה אחד לפני המעבר לחתימה.');
      return;
    }
    setSelectedId(null);
    setActiveTool(null);
    setCurrentSigner(0);
    setPhase('sign');
  }

  function backToEdit() {
    setSelectedId(null);
    setPhase('setup');
  }

  function nextSigner() {
    const remaining = fields.filter(
      (f) => f.signer === currentSigner && f.type === 'signature' && !f.value,
    ).length;
    if (
      remaining &&
      !confirm(`ל${signers[currentSigner].name} נשארו ${remaining} שדות חתימה ריקים. להמשיך בכל זאת?`)
    ) {
      return;
    }
    setSelectedId(null);
    setCurrentSigner((i) => Math.min(i + 1, signers.length - 1));
  }

  async function download() {
    if (!pdfBytes) return;
    const emptySignatures = fields.filter((f) => f.type === 'signature' && !f.value).length;
    if (emptySignatures && !confirm(`יש ${emptySignatures} שדות חתימה ריקים. להוריד בכל זאת?`)) {
      return;
    }
    setBusy(true);
    try {
      // Pass a copy so the original stays usable for repeated downloads.
      const bytes = await buildSignedPdf(pdfBytes.slice(0), fields);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-signed.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('שגיאה ביצירת ה-PDF: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  const hasDoc = pages.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">✒️</span>
          <span className="brand-name">חתימה דיגיטלית</span>
        </div>
        {hasDoc && <span className="doc-name">{baseName}.pdf</span>}
      </header>

      {!hasDoc ? (
        <Dropzone onFile={handleFile} busy={busy} />
      ) : (
        <>
          {phase === 'setup' ? (
            <>
              <SignerBar
                signers={signers}
                activeSigner={activeSigner}
                onSelect={setActiveSigner}
                onRename={renameSigner}
              />
              <Toolbar
                activeTool={activeTool}
                onSelectTool={setActiveTool}
                onContinue={startSigning}
                onReset={reset}
                busy={busy}
                canContinue={fields.length > 0}
              />
              {activeTool ? (
                <div className="place-hint">לחץ על המסמך כדי למקם {labelOf(activeTool)}</div>
              ) : (
                fields.length === 0 && (
                  <div className="place-hint subtle">
                    בחר סוג שדה מהסרגל למעלה ולחץ על המסמך כדי להוסיף אותו
                  </div>
                )
              )}
            </>
          ) : (
            <SignFlowBar
              signers={signers}
              currentSigner={currentSigner}
              onNext={nextSigner}
              onBack={backToEdit}
              onDownload={download}
              busy={busy}
            />
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
                phase={phase}
                currentSigner={currentSigner}
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
            phase={phase}
            onChange={updateField}
            onDelete={deleteField}
            onDuplicate={duplicateField}
            onClose={() => setSelectedId(null)}
            onOpenSign={setSignFor}
          />
        </>
      )}

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

function labelOf(tool) {
  return { signature: 'חתימה', text: 'טקסט', date: 'תאריך', checkbox: 'תיבת סימון' }[tool];
}
