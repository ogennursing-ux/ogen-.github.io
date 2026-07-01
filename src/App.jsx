import { useEffect, useMemo, useState } from 'react';
import Dropzone from './components/Dropzone.jsx';
import Toolbar from './components/Toolbar.jsx';
import ToolRail from './components/ToolRail.jsx';
import SignerBar from './components/SignerBar.jsx';
import PdfPage from './components/PdfPage.jsx';
import EditPanel from './components/EditPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import AllSignatures from './components/AllSignatures.jsx';
import Templates from './components/Templates.jsx';
import WorkerFormsAdmin from './components/WorkerFormsAdmin.jsx';
import FormBuilder from './components/FormBuilder.jsx';
import Settings from './components/Settings.jsx';
import LinkCreated from './components/LinkCreated.jsx';
import SignerView from './components/SignerView.jsx';
import FormSignerView from './components/FormSignerView.jsx';
import Login from './components/Login.jsx';
import LangToggle from './components/LangToggle.jsx';
import { renderPdfPages } from './lib/pdfUtils.js';
import { fileToPdfBytes } from './lib/docx.js';
import { mergePdfs } from './lib/exporters.js';
import { FIELD_DEFAULTS, FIELD_LABELS, DEFAULT_SIGNERS, clamp, uid, todayISO } from './lib/fields.js';
import { api, rememberRequest, rememberTemplate, signingLink, formLink, listMyTemplates } from './lib/api.js';
import { getSettings, notify } from './lib/notify.js';
import { workerPortalLink } from './lib/workerPortal.js';
import { buildFormPdf } from './lib/formPdf.js';
import { LangContext, getInitialLang, applyLang, useT } from './lib/i18n.js';

const WORKER_SIGNERS = () => [{ name: 'עובד סוציאלי', color: '#1f7a53', email: '' }];

export default function App() {
  const [lang, setLang] = useState(getInitialLang);
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem('ogen_auth') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    applyLang(lang);
  }, [lang]);

  const params = new URLSearchParams(location.search);
  const reqId = params.get('req');
  const formId = params.get('form');

  function logout() {
    try {
      localStorage.removeItem('ogen_auth');
    } catch {
      /* ignore */
    }
    setAuthed(false);
  }

  let view;
  if (reqId) view = <SignerView id={reqId} />;
  else if (formId) view = <FormSignerView id={formId} />;
  else if (!authed) view = <Login onLogin={() => setAuthed(true)} />;
  else view = <PrepareApp onLogout={logout} />;

  return <LangContext.Provider value={{ lang, setLang }}>{view}</LangContext.Provider>;
}

const newSigners = () => [{ ...DEFAULT_SIGNERS[0], email: '' }];

function PrepareApp({ onLogout }) {
  const t = useT();
  const [screen, setScreen] = useState('home'); // home | name | editor | created
  const [pages, setPages] = useState([]);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [baseName, setBaseName] = useState('document');
  const [fields, setFields] = useState([]);
  const [signers, setSigners] = useState(newSigners);
  const [activeSigner, setActiveSigner] = useState(0);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sendMode, setSendMode] = useState('regular');
  const [note, setNote] = useState('');

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

  async function handleFile(files) {
    const arr = Array.isArray(files) ? files : [files];
    if (!arr.length) return;
    setBusy(true);
    try {
      // Convert each file (PDF passthrough, Word -> PDF) then merge if several.
      const pdfs = [];
      for (const f of arr) pdfs.push(await fileToPdfBytes(f));
      const bytes = pdfs.length === 1 ? pdfs[0] : await mergePdfs(pdfs);
      const buf = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
      const rendered = await renderPdfPages(new Uint8Array(buf.slice(0)));
      setPdfBytes(buf);
      setPages(rendered);
      setBaseName(arr[0].name.replace(/\.(pdf|docx?)$/i, '') || 'document');
      setFields([]);
      setSigners(
        sendMode === 'round'
          ? [{ ...DEFAULT_SIGNERS[0], email: '' }, { ...DEFAULT_SIGNERS[1], email: '' }]
          : sendMode === 'worker'
          ? WORKER_SIGNERS()
          : newSigners(),
      );
      setActiveSigner(0);
      setSelectedId(null);
      setActiveTool(null);
      setNote('');
      setScreen('name'); // ask for the document name before the editor
    } catch (err) {
      console.error(err);
      alert(t('לא ניתן לפתוח את המסמך') + ': ' + err.message);
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

  const updateSigner = (i, patch) =>
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addSigner = () =>
    setSigners((prev) => (prev.length >= 2 ? prev : [...prev, { ...DEFAULT_SIGNERS[1], email: '' }]));
  function removeSigner(i) {
    setSigners((prev) => prev.filter((_, idx) => idx !== i));
    setFields((prev) => prev.map((f) => (f.signer >= i ? { ...f, signer: Math.max(0, f.signer - 1) } : f)));
    setActiveSigner(0);
  }

  function startOver() {
    if (fields.length && !confirm(t('להתחיל מסמך חדש? השדות הנוכחיים יימחקו.'))) return;
    setPages([]);
    setPdfBytes(null);
    setFields([]);
    setSigners(newSigners());
    setActiveSigner(0);
    setSelectedId(null);
    setActiveTool(null);
    setNote('');
    setScreen('home');
  }

  const signerList = () =>
    signers.map((s) => ({ name: s.name, email: s.email || null, color: s.color, signed: false, signedAt: null }));

  async function createLink() {
    if (!fields.length) {
      alert(t('הוסף לפחות שדה אחד למסמך לפני יצירת הקישור.'));
      return;
    }
    setBusy(true);
    try {
      const settings = getSettings();
      const list = signerList();
      const { id } = await api.createRequest({
        title: baseName,
        pdfBytes,
        fields,
        signers: { current: 0, list, note },
        signerEmail: list[0].email,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberRequest({ id, title: baseName, createdAt: Date.now() });
      const link = signingLink(id);
      if (settings.webhook && list[0].email) {
        notify(settings.webhook, { type: 'invite', to: list[0].email, title: baseName, link });
      }
      setCreated({ link, signersCount: signers.length, signerEmail: list[0].email || '', permanent: false });
      setScreen('created');
    } catch (err) {
      console.error(err);
      alert(t('יצירת הקישור נכשלה') + ': ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!fields.length) {
      alert(t('הוסף לפחות שדה אחד למסמך לפני יצירת הקישור.'));
      return;
    }
    setBusy(true);
    try {
      const settings = getSettings();
      const { id } = await api.createTemplate({
        title: baseName,
        pdfBytes,
        fields,
        signers: signerList(),
        note,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
      });
      rememberTemplate({ id, title: baseName, createdAt: Date.now() });
      setCreated({ link: formLink(id), permanent: true });
      setScreen('created');
    } catch (err) {
      console.error(err);
      alert(t('שמירת התבנית נכשלה') + ': ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishWorkerForm() {
    if (!fields.length) {
      alert(t('הוסף לפחות שדה אחד למסמך לפני הפרסום.'));
      return;
    }
    setBusy(true);
    try {
      const settings = getSettings();
      await api.createTemplate({
        title: baseName,
        pdfBytes,
        fields,
        signers: signerList(),
        note,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
        category: 'worker',
        active: true,
      });
      setCreated({ workerPublished: true });
      setScreen('created');
    } catch (err) {
      console.error(err);
      alert(t('פרסום הטופס נכשל') + ': ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishStructuredForm(title, schema) {
    setBusy(true);
    try {
      const settings = getSettings();
      // Generate a blank rendition of the form so the template still has a PDF.
      const blankPdf = await buildFormPdf(title, schema, {});
      await api.createTemplate({
        title,
        pdfBytes: blankPdf,
        fields: [],
        signers: signerList(),
        note,
        ownerEmail: settings.ownerEmail || null,
        webhook: settings.webhook || null,
        category: 'worker',
        active: true,
        formType: 'structured',
        schema,
      });
      setCreated({ workerPublished: true });
      setScreen('created');
    } catch (err) {
      console.error(err);
      alert(t('פרסום הטופס נכשל') + ': ' + err.message);
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
      alert(t('הורדה נכשלה') + ': ' + err.message);
    }
  }

  const header = (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">✒️</span>
        <span className="brand-name">{t('חתימה דיגיטלית')}</span>
      </div>
      <div className="header-actions">
        {screen === 'editor' && <span className="doc-name">{baseName}.pdf</span>}
        {screen !== 'editor' && (
          <button className="header-settings" onClick={() => setShowSettings(true)}>{t('⚙ הגדרות')}</button>
        )}
        <LangToggle />
        <button className="header-settings" onClick={onLogout}>{t('התנתק')}</button>
      </div>
    </header>
  );

  const settingsModal = showSettings && <Settings onClose={() => setShowSettings(false)} />;

  if (screen === 'created') {
    return (
      <div className="app">
        {header}
        {created.workerPublished ? (
          <div className="centered-screen">
            <div className="card">
              <div className="big-check" aria-hidden>✓</div>
              <h2>{t('הטופס פורסם!')}</h2>
              <p className="muted">
                {t('הטופס יופיע כעת בפורטל הטפסים לעובדים הסוציאליים. אפשר לנהל טפסים וקוד גישה תחת "טפסים לעובדים סוציאליים".')}
              </p>
              <div className="card-actions">
                <button className="btn-ghost" onClick={() => { setSendMode('worker'); startOver(); }}>
                  {t('טפסים לעובדים סוציאליים')}
                </button>
                <button className="btn-primary" onClick={startOver}>{t('מסמך חדש')}</button>
              </div>
            </div>
          </div>
        ) : (
          <LinkCreated
            link={created.link}
            signerEmail={created.signerEmail}
            signersCount={created.signersCount}
            permanent={created.permanent}
            onNewDocument={startOver}
            onDashboard={startOver}
          />
        )}
        {settingsModal}
      </div>
    );
  }

  if (screen === 'formBuilder') {
    return (
      <div className="app">
        {header}
        <FormBuilder
          busy={busy}
          onPublish={publishStructuredForm}
          onCancel={() => setScreen('home')}
        />
        {settingsModal}
      </div>
    );
  }

  if (screen === 'name') {
    return (
      <div className="app">
        {header}
        <div className="centered-screen">
          <div className="card">
            <h2>{t('איך לקרוא למסמך?')}</h2>
            <input
              className="text-input"
              value={baseName}
              autoFocus
              onChange={(e) => setBaseName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setScreen('editor')}
            />
            <button className="btn-primary full" style={{ marginTop: 14 }} onClick={() => setScreen('editor')}>
              {t('המשך לעריכה')}
            </button>
          </div>
        </div>
        {settingsModal}
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <div className="app">
        {header}
        <div className="home-tabs">
          <button
            className={`home-tab${sendMode === 'regular' ? ' active' : ''}`}
            onClick={() => setSendMode('regular')}
          >
            {t('שליחה רגילה')}
          </button>
          <button
            className={`home-tab${sendMode === 'round' ? ' active' : ''}`}
            onClick={() => setSendMode('round')}
          >
            {t('סבב חתימות (2 חותמים)')}
          </button>
          <button
            className={`home-tab${sendMode === 'worker' ? ' active' : ''}`}
            onClick={() => setSendMode('worker')}
          >
            {t('טפסים לעובדים סוציאליים')}
          </button>
        </div>
        {sendMode === 'worker' ? (
          <>
            <div className="worker-create card">
              <div>
                <strong>{t('צור טופס חדש לעובד הסוציאלי')}</strong>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {t('טופס שדות נקי (כמו טופס ממשלתי) — או העלאת מסמך PDF קיים.')}
                </p>
              </div>
              <button className="btn-primary" onClick={() => setScreen('formBuilder')}>
                ➕ {t('בניית טופס שדות')}
              </button>
            </div>
            <Dropzone onFile={handleFile} busy={busy} />
            <WorkerFormsAdmin />
          </>
        ) : (
          <>
            <Dropzone onFile={handleFile} busy={busy} />
            <Dashboard onDownloadSigned={downloadSigned} />
            <AllSignatures />
          </>
        )}

        {sendMode !== 'worker' && (
        <button className="fab" onClick={() => setShowTemplates(true)}>
          📁 {t('תבניות')}
        </button>
        )}
        {showTemplates && (
          <div className="modal-backdrop" onPointerDown={() => setShowTemplates(false)}>
            <div className="drawer" onPointerDown={(e) => e.stopPropagation()}>
              <div className="drawer-head">
                <strong>{t('תבניות')}</strong>
                <button className="icon-btn" onClick={() => setShowTemplates(false)} aria-label="close">✕</button>
              </div>
              {listMyTemplates().length ? (
                <Templates />
              ) : (
                <p className="muted" style={{ padding: '8px 4px' }}>{t('אין תבניות שמורות עדיין.')}</p>
              )}
            </div>
          </div>
        )}
        {settingsModal}
      </div>
    );
  }

  return (
    <div className="app editor-layout">
      {header}
      <Toolbar
        onContinue={sendMode === 'worker' ? publishWorkerForm : createLink}
        onReset={startOver}
        onSaveTemplate={sendMode === 'worker' ? undefined : saveTemplate}
        busy={busy}
        canContinue={fields.length > 0}
        continueLabel={sendMode === 'worker' ? t('פרסם כטופס לעובדים סוציאליים ›') : t('צור קישור לחתימה ›')}
      />
      <SignerBar
        signers={signers}
        activeSigner={activeSigner}
        onSelect={setActiveSigner}
        onUpdate={updateSigner}
        onAdd={addSigner}
        onRemove={removeSigner}
      />
      <div className="doc-name-bar">
        <label>{t('הודעה לחותם (לא תופיע במסמך)')}</label>
        <input
          className="doc-name-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('הודעה לחותם (לא תופיע במסמך)')}
        />
      </div>
      {activeTool ? (
        <div className="place-hint">
          {t('לחץ על המסמך כדי למקם {label}', { label: t(FIELD_LABELS[activeTool]) })}
        </div>
      ) : (
        fields.length === 0 && (
          <div className="place-hint subtle">
            {t('בחר סוג שדה מהסרגל למעלה ולחץ על המסמך כדי להוסיף שדה שהחותם ימלא')}
          </div>
        )
      )}

      <ToolRail activeTool={activeTool} onSelectTool={setActiveTool} />

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
      />
      {settingsModal}
    </div>
  );
}
