import { useEffect, useMemo, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { loadRegistry, searchWorkers, searchFamilies } from './registry.js';
import PdfPlacementEditor from './PdfPlacementEditor.jsx';
import {
  fillTemplateForCase, sendTemplateToSigning, signatureCount, bytesToBase64, templateBlob,
  listTemplates, saveTemplate, deleteTemplate,
} from './contractTemplates.js';

const intlPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };

function Login({ onIn }) {
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(false);
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={(e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); }}>
        <h2>📑 תבניות חוזים</h2>
        <label className="field-label">שם משתמש</label>
        <input className="text-input" value={user} autoFocus onChange={(e) => setUser(e.target.value)} />
        <label className="field-label" style={{ marginTop: 10 }}>סיסמה</label>
        <input className="text-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <p className="login-error">שם משתמש או סיסמה שגויים</p>}
        <button className="btn-primary full" type="submit" style={{ marginTop: 14 }}>התחבר</button>
      </form>
    </div>
  );
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// Pick a case to fill a template for.
function CasePicker({ onPick, onClose }) {
  const [cases, setCases] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { loadRegistry().then(setCases).catch(() => setCases([])); }, []);
  const list = useMemo(() => {
    if (!cases) return [];
    const w = searchWorkers(cases, q); const seen = new Set(w.map((c) => c.id));
    return [...w, ...searchFamilies(cases, q).filter((c) => !seen.has(c.id))].slice(0, 40);
  }, [cases, q]);
  return (
    <div className="aid-overlay" onClick={onClose}>
      <div className="aid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aid-head"><h3>בחר/י תיק למילוי</h3><button className="aid-x" onClick={onClose}>✕</button></div>
        <input className="text-input" placeholder="חיפוש עובד/משפחה…" value={q} onChange={(e) => setQ(e.target.value)} />
        {cases === null ? <p className="muted">טוען…</p> : (
          <div className="mn-list" style={{ marginTop: 10 }}>
            {list.map((c) => (
              <button key={c.id} className="mn-item" onClick={() => onPick(c)}>
                <b>{c.worker?.nameEn || c.worker?.nameHe || c.family?.fullName || '—'}</b>
                <span>{c.family?.fullName || ''} {c.worker?.passportNo ? '· ' + c.worker.passportNo : ''}</span>
              </button>
            ))}
            {!list.length && <p className="muted">לא נמצא.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Upload a PDF → place fields → name → save.
function Uploader({ onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [blob, setBlob] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setBlob(file);
    if (!name) setName(file.name.replace(/\.pdf$/i, ''));
    setEditing(true); // jump straight into placing fields
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const pdfBase64 = bytesToBase64(await blob.arrayBuffer());
      await saveTemplate({ name: name.trim() || 'תבנית', pdfBase64, placements });
      onSaved();
    } catch (e2) { setErr(e2?.message || String(e2)); }
    finally { setBusy(false); }
  }

  return (
    <div className="ct-panel">
      <div className="ct-panel-head"><h3>העלאת תבנית חדשה (PDF)</h3><button className="rp-btn ghost sm" onClick={onCancel}>ביטול</button></div>
      {!blob ? (
        <label className="ct-file">
          <input type="file" accept="application/pdf,.pdf" onChange={onFile} />
          <span>📎 בחר/י את קובץ החוזה (PDF)</span>
        </label>
      ) : (
        <>
          <label className="field-label">שם התבנית</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="ct-count">מוקמו <b>{placements.length}</b> שדות על החוזה.</p>
          <div className="ct-card-actions">
            <button className="rp-btn" onClick={() => setEditing(true)}>🖊️ מיקום שדות</button>
            <button className="rp-btn matash" disabled={busy || !placements.length} onClick={save}>{busy ? 'שומר…' : '💾 שמור תבנית'}</button>
          </div>
          {!placements.length && <p className="muted" style={{ marginTop: 8 }}>מקם/י לפחות שדה אחד לפני השמירה.</p>}
        </>
      )}
      {err && <p className="aid-warn">{err}</p>}

      {editing && blob && (
        <PdfPlacementEditor
          template={{ blob, placements }}
          onClose={() => setEditing(false)}
          onSave={(pl) => { setPlacements(pl); setEditing(false); }}
        />
      )}
    </div>
  );
}

function SignResult({ result, onClose }) {
  return (
    <div className="aid-overlay" onClick={onClose}>
      <div className="aid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aid-head"><h3>🖊️ נשלח לחתימה</h3><button className="aid-x" onClick={onClose}>✕</button></div>
        <p className="muted">החוזה הממולא נכנס למערכת החתימה. שלח/י את הקישור לחותם/ת:</p>
        <input className="text-input" dir="ltr" readOnly value={result.link} onFocus={(e) => e.target.select()} />
        <div className="ct-card-actions" style={{ marginTop: 10 }}>
          <button className="rp-btn sm" onClick={() => navigator.clipboard?.writeText(result.link).catch(() => {})}>📋 העתק קישור</button>
          <a className="rp-btn ghost sm" href={result.link} target="_blank" rel="noreferrer">↗️ פתח</a>
          {result.phone && <a className="rp-btn ghost sm" href={`https://wa.me/${intlPhone(result.phone)}?text=${encodeURIComponent('לחתימת החוזה: ' + result.link)}`} target="_blank" rel="noreferrer">💬 וואטסאפ</a>}
        </div>
      </div>
    </div>
  );
}

function Desk() {
  const [templates, setTemplates] = useState(null);
  const [view, setView] = useState('list');
  const [picking, setPicking] = useState(null); // { tpl, mode: 'fill' | 'sign' }
  const [editingTpl, setEditingTpl] = useState(null);
  const [signResult, setSignResult] = useState(null);
  const [msg, setMsg] = useState('');

  const reload = () => listTemplates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => { reload(); }, []);

  function onPick(caseObj) {
    const p = picking; setPicking(null);
    if (p.mode === 'sign') return sendFor(p.tpl, caseObj);
    return fillFor(p.tpl, caseObj);
  }

  async function fillFor(tpl, caseObj) {
    setMsg('ממלא…');
    try {
      const blob = await fillTemplateForCase(tpl, caseObj);
      const who = caseObj.worker?.nameEn || caseObj.family?.fullName || 'חוזה';
      download(blob, `${tpl.name} — ${who}.pdf`);
      setMsg('✓ החוזה הממולא הורד');
    } catch (e) { setMsg('נכשל: ' + (e?.message || e)); }
    setTimeout(() => setMsg(''), 3000);
  }

  async function sendFor(tpl, caseObj) {
    setMsg('שולח לחתימה…');
    try {
      const { link } = await sendTemplateToSigning(tpl, caseObj, { who: 'worker' });
      setSignResult({ link, phone: caseObj.worker?.phone || '' });
      setMsg('');
    } catch (e) { setMsg('נכשל: ' + (e?.message || e)); setTimeout(() => setMsg(''), 3000); }
  }

  async function saveFields(tpl, placements) {
    setEditingTpl(null); setMsg('שומר…');
    try { await saveTemplate({ id: tpl.id, name: tpl.name, pdfBase64: tpl.pdfBase64, placements }); await reload(); setMsg('✓ נשמר'); }
    catch (e) { setMsg('נכשל: ' + (e?.message || e)); }
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="ct-wrap">
      <header className="mn-head">
        <div>
          <h1>📑 תבניות חוזים</h1>
          <p className="mn-sub">מעלים חוזה PDF, מסמנים עליו שדות (כמו בחתימה הדיגיטלית) ומצמידים כל שדה לפרט במערכת — ומאז החוזה מתמלא לבד לכל תיק.</p>
        </div>
        <a className="rp-btn ghost" href="#registry">← חזרה למערכת</a>
      </header>

      {msg && <div className="ct-msg">{msg}</div>}

      {view === 'new' ? (
        <Uploader onSaved={() => { setView('list'); reload(); }} onCancel={() => setView('list')} />
      ) : (
        <>
          <button className="rp-btn matash" onClick={() => setView('new')}>➕ העלאת תבנית חדשה</button>
          {templates === null ? <p className="muted" style={{ marginTop: 16 }}>טוען…</p> : templates.length === 0 ? (
            <p className="muted" style={{ marginTop: 16 }}>אין עדיין תבניות. העלה/י חוזה PDF ראשון.</p>
          ) : (
            <div className="ct-list">
              {templates.map((t) => (
                <div key={t.id} className="ct-card">
                  <div>
                    <b>{t.name}</b>
                    <span>{(t.placements || []).length} שדות מוקמו{signatureCount(t) ? ` · ${signatureCount(t)} חתימות ✍️` : ''}</span>
                  </div>
                  <div className="ct-card-actions">
                    <button className="rp-btn sm" onClick={() => setPicking({ tpl: t, mode: 'fill' })}>📝 מלא לפי תיק</button>
                    {signatureCount(t) > 0 && <button className="rp-btn matash sm" onClick={() => setPicking({ tpl: t, mode: 'sign' })}>🖊️ שלח לחתימה</button>}
                    <button className="rp-btn ghost sm" onClick={() => setEditingTpl(t)}>שדות</button>
                    <button className="rp-btn ghost sm" onClick={async () => { if (confirm('למחוק את התבנית?')) { await deleteTemplate(t.id); reload(); } }}>מחק</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picking && <CasePicker onPick={onPick} onClose={() => setPicking(null)} />}
      {signResult && <SignResult result={signResult} onClose={() => setSignResult(null)} />}
      {editingTpl && (
        <PdfPlacementEditor
          template={{ blob: templateBlob(editingTpl), placements: editingTpl.placements }}
          onClose={() => setEditingTpl(null)}
          onSave={(pl) => saveFields(editingTpl, pl)}
        />
      )}
    </div>
  );
}

export default function ContractTemplates() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onIn={() => setAuthed(true)} />;
  return <Desk />;
}
