import { useEffect, useRef, useState } from 'react';
import { renderPdfPages } from './pdfRender.js';
import { CONTRACT_FIELD_LABELS, PLACEHOLDER_KEYS } from './contractMerge.js';

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);

const DEFAULT_W = 0.26;
const DEFAULT_H = 0.028;

// One-time positioning of worker fields on a PDF contract. The user picks a
// field, clicks where it goes on the page, and can drag/resize/align it. The
// saved percentage geometry drives the overlay at generation time.
export default function PdfPlacementEditor({ template, onClose, onSave }) {
  const [pages, setPages] = useState(null);
  const [placements, setPlacements] = useState(() =>
    (template.placements || []).map((p) => ({ ...p, id: p.id || uid() })),
  );
  const [activeField, setActiveField] = useState('nameHe');
  const [selectedId, setSelectedId] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const buf = await template.blob.arrayBuffer();
      const rendered = await renderPdfPages(new Uint8Array(buf.slice(0)));
      if (alive) setPages(rendered);
    })();
    return () => { alive = false; };
  }, [template]);

  function addAt(pageIndex, xPct, yPct) {
    const p = {
      id: uid(),
      fieldKey: activeField,
      pageIndex,
      xPct: Math.max(0, Math.min(1 - DEFAULT_W, xPct - DEFAULT_W / 2)),
      yPct: Math.max(0, Math.min(1 - DEFAULT_H, yPct - DEFAULT_H / 2)),
      wPct: DEFAULT_W,
      hPct: DEFAULT_H,
      align: 'right',
    };
    setPlacements((prev) => [...prev, p]);
    setSelectedId(p.id);
  }

  function onPageClick(e, pageIndex) {
    if (e.target.closest('.pp-box')) return; // clicked a box, not the page
    const rect = e.currentTarget.getBoundingClientRect();
    addAt(pageIndex, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }

  function startDrag(e, pl) {
    e.stopPropagation();
    setSelectedId(pl.id);
    const wrap = e.currentTarget.closest('.pp-page');
    const rect = wrap.getBoundingClientRect();
    drag.current = { id: pl.id, rect, offX: e.clientX - (rect.left + pl.xPct * rect.width), offY: e.clientY - (rect.top + pl.yPct * rect.height) };
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', endDrag);
  }
  function onDrag(e) {
    const d = drag.current;
    if (!d) return;
    const xPct = (e.clientX - d.offX - d.rect.left) / d.rect.width;
    const yPct = (e.clientY - d.offY - d.rect.top) / d.rect.height;
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === d.id
          ? { ...p, xPct: Math.max(0, Math.min(1 - p.wPct, xPct)), yPct: Math.max(0, Math.min(1 - p.hPct, yPct)) }
          : p,
      ),
    );
  }
  function endDrag() {
    drag.current = null;
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', endDrag);
  }

  const patch = (id, p) => setPlacements((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeSel = () => { setPlacements((prev) => prev.filter((p) => p.id !== selectedId)); setSelectedId(null); };
  const selected = placements.find((p) => p.id === selectedId);

  return (
    <div className="pp-overlay">
      <div className="pp-bar">
        <strong>מיקום שדות · {template.name}</strong>
        <div className="pp-bar-actions">
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn-primary" onClick={() => onSave(placements.map(({ id, ...rest }) => ({ id, ...rest })))}>
            💾 שמור מיקומים
          </button>
        </div>
      </div>

      <div className="pp-palette">
        <span className="muted small">בחר שדה ואז לחץ על הדף כדי למקם:</span>
        {PLACEHOLDER_KEYS.map((k) => (
          <button
            key={k}
            className={`pp-chip${activeField === k ? ' active' : ''}`}
            onClick={() => setActiveField(k)}
          >
            {CONTRACT_FIELD_LABELS[k] || k}
          </button>
        ))}
      </div>

      {selected && (
        <div className="pp-selbar">
          <span>{CONTRACT_FIELD_LABELS[selected.fieldKey] || selected.fieldKey}</span>
          <button className="btn-ghost sm" onClick={() => patch(selected.id, { wPct: Math.max(0.05, selected.wPct - 0.02) })}>▭−</button>
          <button className="btn-ghost sm" onClick={() => patch(selected.id, { wPct: Math.min(0.9, selected.wPct + 0.02) })}>▭+</button>
          <button className="btn-ghost sm" onClick={() => patch(selected.id, { hPct: Math.max(0.015, selected.hPct - 0.005) })}>A−</button>
          <button className="btn-ghost sm" onClick={() => patch(selected.id, { hPct: Math.min(0.12, selected.hPct + 0.005) })}>A+</button>
          <button className="btn-ghost sm" onClick={() => patch(selected.id, { align: selected.align === 'right' ? 'left' : selected.align === 'left' ? 'center' : 'right' })}>
            יישור: {selected.align === 'right' ? 'ימין' : selected.align === 'left' ? 'שמאל' : 'מרכז'}
          </button>
          <button className="btn-danger sm" onClick={removeSel}>מחק שדה</button>
        </div>
      )}

      <div className="pp-pages">
        {pages === null && <p className="muted" style={{ padding: 20 }}>טוען את ה-PDF…</p>}
        {pages && pages.map((pg, i) => (
          <div
            key={i}
            className="pp-page"
            style={{ aspectRatio: `${1 / pg.aspect}` }}
            onPointerDown={(e) => onPageClick(e, i)}
          >
            <img src={pg.url} alt={`עמוד ${i + 1}`} draggable={false} />
            {placements.filter((p) => p.pageIndex === i).map((p) => (
              <div
                key={p.id}
                className={`pp-box${selectedId === p.id ? ' sel' : ''} align-${p.align}`}
                style={{ left: `${p.xPct * 100}%`, top: `${p.yPct * 100}%`, width: `${p.wPct * 100}%`, height: `${p.hPct * 100}%` }}
                onPointerDown={(e) => startDrag(e, p)}
              >
                <span>{CONTRACT_FIELD_LABELS[p.fieldKey] || p.fieldKey}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
