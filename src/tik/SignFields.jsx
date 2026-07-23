import { useEffect, useRef, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { recordsFromChat } from './chatRecords.js';
import { buildFilledContract } from './filledContract.js';
import { placementSignatureFields } from './signingBridge.js';
import { loadPlacementFields, savePlacementFields } from './officeConfig.js';
import { renderPdfPages } from '../lib/pdfUtils.js';

const SIGNER_LABEL = ['חתימת מעסיק', 'חתימת מטפל/ת'];
const SIGNER_COLOR = ['#047857', '#2563eb'];

// A representative case, only so the contract has something to draw. The office
// never sends this — it is just the backdrop for placing the signature boxes.
const SAMPLE = {
  employerName: 'ישראל ישראלי', idNumber: '312345678', contactPhone: '0500000000',
  contactName: 'משפחה', street: 'הרצל 1', city: 'תל אביב', zip: '0000000',
  salary: '6500', weeklyAdvance: '100', startDate: '2026-01-01', daysPerWeek: '6', weeklyDayOff: 'שבת',
  nameEn: 'WORKER NAME', nameHe: 'עובד/ת', passportNo: 'P0000000', nationality: 'Philippines',
  dob: '1990-01-01', gender: 'F', languages: 'אנגלית',
};

function Login({ onIn }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => { e.preventDefault(); if (login(user, pass)) onIn(); else setErr(true); };
  return (
    <div className="board-login">
      <form className="board-login-card" onSubmit={submit}>
        <h2>✒️ מיקום החתימות</h2>
        <p className="muted">כניסה עם פרטי המשרד.</p>
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

export default function SignFields() {
  const [authed, setAuthed] = useState(isAuthed());
  const [pages, setPages] = useState(null);
  const [fields, setFields] = useState([]);
  const [err, setErr] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const pageRefs = useRef({});
  const drag = useRef(null);

  useEffect(() => {
    if (!authed) return;
    let alive = true;
    (async () => {
      try {
        const { worker, family } = recordsFromChat(SAMPLE);
        const bytes = await buildFilledContract(family, worker, {});
        const imgs = await renderPdfPages(new Uint8Array(bytes.slice(0)), { baseScale: 1.3 });
        if (!alive) return;
        setPages(imgs);
        const saved = await loadPlacementFields();
        const base = (saved && saved.length ? saved : placementSignatureFields());
        setFields(base.map((f, i) => ({
          id: i, pageIndex: f.pageIndex, signer: f.signer,
          xPct: f.xPct, yPct: f.yPct, wPct: f.wPct ?? 0.2, hPct: f.hPct ?? 0.07,
        })));
      } catch (e) { if (alive) setErr(e?.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [authed]);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function onMove(e) {
    const d = drag.current; if (!d) return;
    const el = pageRefs.current[d.pageIndex]; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width;
    const cy = (e.clientY - r.top) / r.height;
    setFields((prev) => prev.map((f) => (f.id === d.id
      ? { ...f, xPct: clamp(cx - f.wPct / 2, 0, 1 - f.wPct), yPct: clamp(cy - f.hPct / 2, 0, 1 - f.hPct) }
      : f)));
  }
  function endDrag() {
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
  }
  function startDrag(e, f) {
    e.preventDefault();
    drag.current = { id: f.id, pageIndex: f.pageIndex };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
  }

  const nudge = (id, dx, dy) => setFields((prev) => prev.map((f) => (f.id === id
    ? { ...f, xPct: clamp(f.xPct + dx, 0, 1 - f.wPct), yPct: clamp(f.yPct + dy, 0, 1 - f.hPct) } : f)));

  async function save() {
    setBusy(true);
    try { await savePlacementFields(fields); setSavedMsg('✓ נשמר! מעכשיו כל חוזה חדש ישתמש במיקום הזה.'); setTimeout(() => setSavedMsg(''), 4000); }
    catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }
  function resetDefaults() {
    const base = placementSignatureFields();
    setFields(base.map((f, i) => ({ id: i, pageIndex: f.pageIndex, signer: f.signer, xPct: f.xPct, yPct: f.yPct, wPct: f.wPct ?? 0.2, hPct: f.hPct ?? 0.07 })));
  }

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  const pageIdxs = [...new Set(fields.map((f) => f.pageIndex))].sort((a, b) => a - b);

  return (
    <div className="sf-wrap">
      <div className="sf-head">
        <div>
          <h1>✒️ מיקום החתימות</h1>
          <p>גררו כל תיבה למקום שבו צריכה להיות החתימה. שומרים פעם אחת — וכל חוזה חדש ישתמש בזה.</p>
        </div>
        <button className="board-toapp" onClick={() => { location.hash = ''; location.reload(); }}>המשרד ←</button>
      </div>

      <div className="sf-legend">
        <span><i style={{ background: SIGNER_COLOR[0] }} /> מעסיק</span>
        <span><i style={{ background: SIGNER_COLOR[1] }} /> מטפל/ת</span>
      </div>

      {err && <p className="board-err">שגיאה: {err}</p>}
      {!pages && !err && <p className="board-empty">טוען תצוגה של החוזה… (רגע אחד)</p>}

      {pages && pageIdxs.map((pi) => (
        <div key={pi} className="sf-pagewrap">
          <div className="sf-pagenum">עמוד {pi + 1}</div>
          <div className="sf-page" ref={(el) => { pageRefs.current[pi] = el; }}>
            <img src={pages[pi]?.url} alt={`page ${pi + 1}`} draggable={false} />
            {fields.filter((f) => f.pageIndex === pi).map((f) => (
              <div
                key={f.id}
                className="sf-box"
                onPointerDown={(e) => startDrag(e, f)}
                style={{
                  left: `${f.xPct * 100}%`, top: `${f.yPct * 100}%`,
                  width: `${f.wPct * 100}%`, height: `${f.hPct * 100}%`,
                  borderColor: SIGNER_COLOR[f.signer], color: SIGNER_COLOR[f.signer],
                  background: `${SIGNER_COLOR[f.signer]}1a`,
                }}
              >
                <span>{SIGNER_LABEL[f.signer]}</span>
                <div className="sf-nudge">
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(f.id, 0, -0.004)}>▲</button>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(f.id, 0, 0.004)}>▼</button>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(f.id, 0.004, 0)}>▶</button>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(f.id, -0.004, 0)}>◀</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {pages && (
        <div className="sf-actions">
          {savedMsg && <div className="sf-saved">{savedMsg}</div>}
          <button className="btn-primary full" disabled={busy} onClick={save}>{busy ? 'שומר…' : '💾 שמור מיקום החתימות'}</button>
          <button className="sf-reset" onClick={resetDefaults}>אפס לברירת מחדל</button>
        </div>
      )}
    </div>
  );
}
