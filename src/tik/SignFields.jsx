import { useEffect, useRef, useState } from 'react';
import { isAuthed, login } from './officeAuth.js';
import { recordsFromChat } from './chatRecords.js';
import { buildFilledContract } from './filledContract.js';
import { placementSignatureFields } from './signingBridge.js';
import { loadPlacementFields, loadPageCuts, saveSignSetup } from './officeConfig.js';
import { renderPdfPages } from '../lib/pdfUtils.js';

// Turn the set of "new file starts here" page indices into the "1-4 ; 5-10 …"
// spec the signing app uses to split the signed contract into separate files.
function cutsToGroups(cutSet, totalPages) {
  const starts = [...new Set([0, ...cutSet])].filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b);
  if (starts.length <= 1) return '';
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i] + 1;
    const to = i + 1 < starts.length ? starts[i + 1] : totalPages;
    out.push(from === to ? `${from}` : `${from}-${to}`);
  }
  return out.join(' ; ');
}

const COLOR = ['#047857', '#2563eb']; // 0 = employer, 1 = caregiver
const SIZE = { signature: { w: 0.2, h: 0.06 }, date: { w: 0.17, h: 0.03 } };
const labelOf = (f) =>
  (f.type === 'date' ? '📅 תאריך ' : '✒️ חתימת ') + (f.signer === 0 ? 'מעסיק' : 'מטפל/ת');

const TOOLS = [
  { type: 'signature', signer: 0, label: '✒️ חתימת מעסיק' },
  { type: 'signature', signer: 1, label: '✒️ חתימת מטפל/ת' },
  { type: 'date', signer: 0, label: '📅 תאריך מעסיק' },
  { type: 'date', signer: 1, label: '📅 תאריך מטפל/ת' },
];

// A representative case, only so the contract has something to draw.
const SAMPLE = {
  employerName: 'ישראל ישראלי', idNumber: '312345678', contactPhone: '0500000000',
  contactName: 'משפחה', street: 'הרצל 1', city: 'תל אביב', zip: '0000000',
  salary: '6500', weeklyAdvance: '100', startDate: '2026-01-01', daysPerWeek: '6', weeklyDayOff: 'שבת',
  nameEn: 'WORKER NAME', nameHe: 'עובד/ת', passportNo: 'P0000000', nationality: 'Philippines',
  dob: '1990-01-01', gender: 'F', languages: 'אנגלית',
};

let _seq = 1;
const nextId = () => `f${_seq++}`;

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
  const [tool, setTool] = useState(null);       // {type, signer} to add on next page tap
  const [selected, setSelected] = useState(null); // id of selected field
  const [cuts, setCuts] = useState(() => new Set()); // page indices where a new file starts
  const [err, setErr] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const pageRefs = useRef({});
  const drag = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!authed) return undefined;
    let alive = true;
    (async () => {
      try {
        const { worker, family } = recordsFromChat(SAMPLE);
        const bytes = await buildFilledContract(family, worker, {});
        const imgs = await renderPdfPages(new Uint8Array(bytes.slice(0)), { baseScale: 1.1 });
        if (!alive) return;
        setPages(imgs);
        const mapF = (arr) => arr.map((f) => ({
          id: nextId(), type: f.type || 'signature', signer: f.signer, pageIndex: f.pageIndex,
          xPct: f.xPct, yPct: f.yPct,
          wPct: f.wPct ?? SIZE[f.type || 'signature'].w, hPct: f.hPct ?? SIZE[f.type || 'signature'].h,
        }));
        // Show the built-in defaults right away, then swap in the saved layout
        // if one exists (so a slow network never leaves the page empty).
        setFields(mapF(placementSignatureFields()));
        try {
          const saved = await loadPlacementFields();
          if (alive && saved && saved.length) setFields(mapF(saved));
        } catch { /* keep defaults */ }
        try {
          const savedCuts = await loadPageCuts();
          if (alive && savedCuts.length) setCuts(new Set(savedCuts));
        } catch { /* no cuts */ }
      } catch (e) { if (alive) setErr(e?.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [authed]);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function placeAt(pageIndex, xPct, yPct) {
    if (!tool) return;
    const sz = SIZE[tool.type];
    const f = {
      id: nextId(), type: tool.type, signer: tool.signer, pageIndex,
      xPct: clamp(xPct - sz.w / 2, 0, 1 - sz.w), yPct: clamp(yPct - sz.h / 2, 0, 1 - sz.h),
      wPct: sz.w, hPct: sz.h,
    };
    setFields((prev) => [...prev, f]);
    setSelected(f.id);
    setTool(null);
  }
  function onPageClick(e, pageIndex) {
    if (e.target.closest('.sf-box')) return;
    const r = pageRefs.current[pageIndex].getBoundingClientRect();
    if (tool) placeAt(pageIndex, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    else setSelected(null);
  }

  function onMove(e) {
    const d = drag.current; if (!d) return;
    moved.current = true;
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
    setSelected(f.id);
    moved.current = false;
    drag.current = { id: f.id, pageIndex: f.pageIndex };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
  }

  const nudge = (id, dx, dy) => setFields((prev) => prev.map((f) => (f.id === id
    ? { ...f, xPct: clamp(f.xPct + dx, 0, 1 - f.wPct), yPct: clamp(f.yPct + dy, 0, 1 - f.hPct) } : f)));
  const remove = (id) => { setFields((prev) => prev.filter((f) => f.id !== id)); setSelected(null); };
  const toggleCut = (pi) => setCuts((prev) => { const n = new Set(prev); if (n.has(pi)) n.delete(pi); else n.add(pi); return n; });

  async function save() {
    setBusy(true);
    try {
      const downloadGroups = cutsToGroups(cuts, pages.length);
      await saveSignSetup({ fields, pageCuts: [...cuts], downloadGroups });
      setSavedMsg('✓ נשמר! מעכשיו כל חוזה חדש ישתמש במיקומים ובחיתוך האלה.');
      setTimeout(() => setSavedMsg(''), 4000);
    } catch (e) { alert('שמירה נכשלה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }

  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  return (
    <div className="sf-wrap">
      <div className="sf-head">
        <div>
          <h1>✒️ מיקום החתימות והתאריכים</h1>
          <p>בחרו מה להוסיף, לחצו על המקום בעמוד, וגררו לדיוק. אפשר גם לחתוך את החוזה לקבצים נפרדים עם הכפתור ✂️ שמעל כל עמוד. שומרים פעם אחת — וכל חוזה חדש ישתמש בזה.</p>
        </div>
        <button className="board-toapp" onClick={() => { location.hash = 'board'; location.reload(); }}>← חזרה</button>
      </div>

      <div className="sf-tools">
        {TOOLS.map((tt) => {
          const on = tool && tool.type === tt.type && tool.signer === tt.signer;
          return (
            <button key={tt.label} className={`sf-tool${on ? ' on' : ''}`}
              style={{ borderColor: COLOR[tt.signer], color: on ? '#fff' : COLOR[tt.signer], background: on ? COLOR[tt.signer] : '#fff' }}
              onClick={() => setTool(on ? null : { type: tt.type, signer: tt.signer })}>
              {tt.label}
            </button>
          );
        })}
      </div>
      <div className="sf-hint">{tool ? '👆 עכשיו לחצו על המקום בעמוד שבו זה צריך להיות' : 'טיפ: לחצו על תיבה כדי לבחור, לגרור, או למחוק (✕).'}</div>

      {err && <p className="board-err">שגיאה: {err}</p>}
      {!pages && !err && <p className="board-empty">טוען את החוזה המלא… (רגע אחד, זה 26 עמודים)</p>}

      {pages && pages.map((pg, pi) => (
        <div key={pi} className="sf-pagewrap">
          <div className="sf-pagehead">
            <span className="sf-pagenum">עמוד {pi + 1}</span>
            <span className="sf-fileno">קובץ {1 + [...cuts].filter((s) => s <= pi).length}</span>
            {pi > 0 && (
              <button className={`sf-cut${cuts.has(pi) ? ' on' : ''}`} onClick={() => toggleCut(pi)}>
                {cuts.has(pi) ? '✂️ קובץ חדש מכאן ✓' : '✂️ קובץ חדש מכאן'}
              </button>
            )}
          </div>
          <div className="sf-page" ref={(el) => { pageRefs.current[pi] = el; }} onClick={(e) => onPageClick(e, pi)}>
            <img src={pg.url} alt={`page ${pi + 1}`} draggable={false} />
            {fields.filter((f) => f.pageIndex === pi).map((f) => (
              <div
                key={f.id}
                className={`sf-box${f.type === 'date' ? ' date' : ''}${selected === f.id ? ' sel' : ''}`}
                onPointerDown={(e) => startDrag(e, f)}
                onClick={(e) => { e.stopPropagation(); if (!moved.current) setSelected(f.id); }}
                style={{
                  left: `${f.xPct * 100}%`, top: `${f.yPct * 100}%`,
                  width: `${f.wPct * 100}%`, height: `${f.hPct * 100}%`,
                  borderColor: COLOR[f.signer], color: COLOR[f.signer],
                  background: `${COLOR[f.signer]}1a`,
                }}
              >
                <span>{labelOf(f)}</span>
                {selected === f.id && (
                  <>
                    <button className="sf-del" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(f.id); }}>✕</button>
                    <div className="sf-nudge">
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); nudge(f.id, 0, -0.003); }}>▲</button>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); nudge(f.id, 0, 0.003); }}>▼</button>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); nudge(f.id, 0.003, 0); }}>▶</button>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); nudge(f.id, -0.003, 0); }}>◀</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {pages && (
        <div className="sf-actions">
          {savedMsg && <div className="sf-saved">{savedMsg}</div>}
          <div className="sf-count">{fields.length} שדות · {cuts.size + 1} קבצים בהורדה</div>
          <button className="btn-primary full" disabled={busy} onClick={save}>{busy ? 'שומר…' : '💾 שמור מיקום החתימות'}</button>
        </div>
      )}
    </div>
  );
}
